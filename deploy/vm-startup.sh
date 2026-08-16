#!/bin/bash
# Compute Engine startup script — runs as root on first boot (and every boot;
# every step below is idempotent).
#
# Two jobs: get Docker on the box, and give a 2 GB machine enough headroom to
# run `next build` without the OOM killer stepping in.
set -euxo pipefail

# --- swap ---------------------------------------------------------------------
# The web build peaks well above what an e2-small holds in RAM. 4 GB of swap on
# the boot disk costs disk, not money, and is far cheaper than moving up to an
# e2-medium purely to survive a build that runs a few times a month.
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Swap is a build-time safety net, not a runtime strategy: keep the kernel
  # reaching for it only under real pressure.
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-alkeva-swap.conf
fi

# --- docker -------------------------------------------------------------------
# Docker's own apt repo, not Debian's. Debian 12 (bookworm) has no
# `docker-compose-v2` package at all — only newer releases carry it — and its
# `docker.io` lags upstream. Installing from Docker directly gets both the
# engine and the `docker compose` plugin from one source.
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y --no-install-recommends ca-certificates curl gnupg git

  install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/debian/gpg \
      -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

# Docker's default json-file driver never rotates. On a 20 GB disk a chatty
# container fills the root filesystem and takes the whole stack down with it.
if [ ! -f /etc/docker/daemon.json ]; then
  mkdir -p /etc/docker
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
  systemctl restart docker
fi

# --- app directory ------------------------------------------------------------
mkdir -p /opt/alkeva
# The login user gets ownership so deploys do not need sudo for file edits.
if id -u dagmfre >/dev/null 2>&1; then
  usermod -aG docker dagmfre || true
  chown -R dagmfre /opt/alkeva || true
fi

touch /var/log/alkeva-startup-done
