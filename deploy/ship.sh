#!/usr/bin/env bash
# ALKEVA — one-command deploy to the Compute Engine VM.
#
#   ./deploy/ship.sh            # ship HEAD, rebuild what changed, restart apps
#   ./deploy/ship.sh --dirty    # ship the working tree instead of HEAD
#   ./deploy/ship.sh --logs     # ship, then tail the stack
#
# Why this is faster than the manual sequence it replaces:
#
#   1. `git archive` ships ~1.5 MB of tracked source. No node_modules, no
#      .next, no dist, and — critically — no .env: secrets live only in
#      /opt/alkeva/.env on the VM and are never in the payload.
#   2. Docker's layer cache does the real work. The dependency layer keys on
#      package.json + pnpm-lock.yaml alone, so a source-only change reuses the
#      cached `pnpm install` and the build starts at `pnpm -r build`. Touching
#      the lockfile is the one thing that forces the slow path.
#   3. Only api/web/worker are recreated. Redis keeps its data and Caddy keeps
#      its ACME state, so no certificate is re-requested on a deploy — Let's
#      Encrypt rate-limits that, and there is no reason to spend the budget.
#   4. Dangling images are pruned every run. Each build leaves a ~2.7 GB
#      orphan; three deploys without this filled the 20 GB disk and wedged the
#      box mid-build.
#
# The old container keeps serving until the new image is built. A failed build
# leaves production untouched.
set -euo pipefail

ZONE=europe-west1-b
PROJECT=alkeva
VM_HOST=23.251.133.30
VM_USER=hp
REMOTE=/opt/alkeva
# SITE is resolved from the VM's own ALKEVA_DOMAIN below, not hardcoded here.
# It was hardcoded to the sslip.io hostname, and when the real domain went
# live that host stopped having a certificate — so every health check failed
# the TLS handshake and the script reported a broken deploy on a healthy one.
# Reading the value Caddy actually serves means this cannot drift again.
SITE=
COMPOSE="docker compose -f deploy/docker-compose.prod.yml"
SSH_KEY="${HOME}/.ssh/google_compute_engine"

SHIP_DIRTY=0
TAIL_LOGS=0
for arg in "$@"; do
  case "$arg" in
    --dirty) SHIP_DIRTY=1 ;;
    --logs)  TAIL_LOGS=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# gcloud's `compute ssh` shells out to PuTTY/plink on Windows, which dropped
# connections repeatedly mid-deploy. OpenSSH against the key gcloud already
# generated is the same credential over a stabler client.
#
# The banner filter is `sed`, not `grep -v`: grep exits 1 when it emits no
# lines, and under `set -euo pipefail` that silently aborted the whole deploy
# the moment a step produced no output.
#
# The `| sed` also swallowed ssh's exit status — the pipeline's status is
# sed's, which is always 0 — so `set -e` never saw a remote failure and every
# step "succeeded" no matter what happened on the VM. PIPESTATUS restores it.
ssh_vm() {
  local status
  ssh -n -i "$SSH_KEY" -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null -o ConnectTimeout=30 \
    -o ServerAliveInterval=20 -o ServerAliveCountMax=6 \
    "${VM_USER}@${VM_HOST}" "$@" 2>&1 | sed '/^Warning: Permanently added/d'
  status=${PIPESTATUS[0]}
  return "$status"
}

step() { printf "\n\033[1m→ %s\033[0m\n" "$1"; }

# The domain Caddy is actually configured with. `tail -1` because a key may
# appear more than once in the env file and the last assignment is the one
# that wins; `tr -d` strips the CR that survives an editor on Windows.
SITE="https://$(ssh_vm "grep -E '^ALKEVA_DOMAIN=' ${REMOTE}/.env | tail -1 | cut -d= -f2-" | tr -d '\r\n ')"
if [ "$SITE" = "https://" ]; then
  echo "could not read ALKEVA_DOMAIN from ${REMOTE}/.env on the VM" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
BUNDLE="$TMP/alkeva-src.tar.gz"

step "Packaging source"
if [ "$SHIP_DIRTY" -eq 1 ]; then
  # Working tree, still honouring .gitignore — ships uncommitted work.
  tar --exclude-vcs --exclude=node_modules --exclude=.next --exclude=dist \
      --exclude=.claude --exclude=.vercel --exclude='.env' --exclude='.env.*' \
      -czf "$BUNDLE" .
  echo "  working tree (--dirty)"
else
  # Tracked files at HEAD only. Uncommitted work is deliberately NOT shipped:
  # production should always correspond to a commit you can point at.
  git archive --format=tar HEAD | gzip > "$BUNDLE"
  echo "  $(git rev-parse --short HEAD) $(git log -1 --pretty=%s)"
fi
echo "  $(du -h "$BUNDLE" | cut -f1)"

step "Uploading"
scp -q -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "$BUNDLE" "${VM_USER}@${VM_HOST}:~/alkeva-src.tar.gz"

step "Unpacking on the VM"
# Extract beside the live tree, then swap. The running containers do not read
# from this directory (the image carries its own copy), so the swap is safe
# mid-flight; keeping app.old means a bad deploy can be inspected after.
ssh_vm "set -e
  rm -rf ${REMOTE}/app.new ${REMOTE}/app.old
  mkdir -p ${REMOTE}/app.new
  tar -xzf ~/alkeva-src.tar.gz -C ${REMOTE}/app.new
  mv ${REMOTE}/app ${REMOTE}/app.old
  mv ${REMOTE}/app.new ${REMOTE}/app
  rm -f ~/alkeva-src.tar.gz"

step "Reclaiming disk before the build"
# This used to run only AFTER the build, which is too late to help the build
# that needs the space. A full `next build` plus the image export wants several
# GB of headroom on a 20 GB disk, and a stale build cache had eaten it: the web
# layer failed to export with "no space left on device" mid-deploy. Pruning
# first costs a slower rebuild occasionally and prevents that outright. The
# running image is in use, so `docker image prune` never touches it.
ssh_vm "docker image prune -f > /dev/null 2>&1 || true
  docker builder prune -af > /dev/null 2>&1 || true
  df -h / | tail -1"

# Run the noisy commands into a log and show the tail only on success; on
# failure show enough of it to diagnose without a second SSH round trip.
# `| tail -4` inline would have made the pipeline's status tail's own, which is
# how a failed build previously sailed through to a "✓ shipped".
run_step() {
  local title="$1" cmd="$2" ok_lines="$3"
  ssh_vm "cd ${REMOTE}/app && { ${cmd}; } > /tmp/alkeva-step.log 2>&1 || {
      echo '--- failed, last 30 lines ---'; tail -30 /tmp/alkeva-step.log; exit 1; }
    tail -${ok_lines} /tmp/alkeva-step.log" \
    || { printf "\n\033[31m✗ %s failed — production left on the previous image\033[0m\n" "$title"; exit 1; }
}

step "Building image (cached layers reused)"
run_step "build" "${COMPOSE} build" 4

step "Applying migrations and restarting apps"
# `up -d` runs the one-shot migrate container first (compose waits for it to
# exit 0) and recreates only services whose image changed.
run_step "migrate + restart" "${COMPOSE} up -d" 6

step "Reclaiming disk after the build"
# The orphaned image from this build. The cache is left alone here — the
# pre-build prune above is what guarantees headroom, and keeping this run's
# cache makes the next deploy's unchanged layers fast.
ssh_vm "docker image prune -f > /dev/null 2>&1 || true
  df -h / | tail -1"

step "Health"
ssh_vm "cd ${REMOTE}/app && ${COMPOSE} ps --format '{{.Service}} {{.State}}'"

# Nest takes a few seconds to bind after the container starts, so a single
# immediate probe reports 502 on a perfectly good deploy. Retry before
# believing it — but do NOT print success on a failing check, which is the
# whole point of having one.
FAILED=0
for path in /welcome /api/healthz /api/prices/latest; do
  code=000
  for _ in 1 2 3 4 5 6; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
      "${SITE}${path}" || echo 000)
    [ "$code" = "200" ] && break
    sleep 5
  done
  if [ "$code" = "200" ]; then
    printf "  \033[32m%s\033[0m %s\n" "$code" "$path"
  else
    printf "  \033[31m%s\033[0m %s\n" "$code" "$path"
    FAILED=1
  fi
done

if [ "$FAILED" -eq 1 ]; then
  printf "\n\033[31m✗ deploy finished but health checks failed\033[0m\n"
  printf "   ssh -i %s %s@%s\n" "$SSH_KEY" "$VM_USER" "$VM_HOST"
  printf "   cd %s/app && %s logs --tail=50 api web\n" "$REMOTE" "$COMPOSE"
  exit 1
fi

if [ "$TAIL_LOGS" -eq 1 ]; then
  step "Logs (ctrl-c to stop)"
  ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "${VM_USER}@${VM_HOST}" "cd ${REMOTE}/app && ${COMPOSE} logs -f --tail=40 api web worker"
fi

printf "\n\033[1m✓ shipped\033[0m  %s\n" "$SITE"
