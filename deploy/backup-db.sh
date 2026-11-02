#!/usr/bin/env bash
# Nightly Postgres dump on the VPS. Installed by cron as root:
#
#   15 23 * * * bash /opt/alkeva/app/deploy/backup-db.sh >> /var/log/alkeva-backup.log 2>&1
#
# (23:15 UTC = 02:15 EAT, the quietest hour.)
#
# Supabase used to do this for us. With Postgres on the box, this is the only
# copy of the ledger that is not the live volume — so it fails loudly, keeps
# two weeks, and never deletes the last good dump on a failed run.
#
# Phase 10 (real money):
#  - BACKUP_AGE_RECIPIENT (an `age` public key, age1…): every dump is encrypted
#    before it is kept. The dump holds the whole ledger and every customer's
#    identity data; the matching private key lives OFF the server with the
#    owner. Without it set, dumps stay plain (and the log says so).
#  - BACKUP_RCLONE_REMOTE (e.g. "b2:alkeva-backups"): the encrypted dump is
#    also copied off the box. A dump on the same disk as the database survives
#    a bad migration, not a lost server.
# Both live in /opt/alkeva/backup.env. Needs: apt install age rclone.
set -euo pipefail

DIR=/opt/alkeva/backups
KEEP_DAYS=14
COMPOSE="docker compose -f /opt/alkeva/app/deploy/docker-compose.prod.yml"
BACKUP_AGE_RECIPIENT=""
BACKUP_RCLONE_REMOTE=""
# shellcheck disable=SC1091
[ -f /opt/alkeva/backup.env ] && . /opt/alkeva/backup.env

mkdir -p "$DIR" && chmod 700 "$DIR"
OUT="$DIR/alkeva-$(date -u +%Y%m%dT%H%MZ).dump"

# Write to a temp name and rename only on success, so a half-written file can
# never be mistaken for a backup.
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$OUT.part"
# A custom-format dump starts with the magic "PGDMP"; an error page does not.
[ "$(head -c 5 "$OUT.part")" = "PGDMP" ] || { echo "$(date -u) dump invalid"; rm -f "$OUT.part"; exit 1; }
if [ -n "$BACKUP_AGE_RECIPIENT" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "$OUT.age.part" "$OUT.part"
  rm -f "$OUT.part"
  mv "$OUT.age.part" "$OUT.age"
  OUT="$OUT.age"
else
  echo "$(date -u) WARNING: BACKUP_AGE_RECIPIENT unset — dump kept UNENCRYPTED"
  mv "$OUT.part" "$OUT"
fi
chmod 600 "$OUT"

if [ -n "$BACKUP_RCLONE_REMOTE" ]; then
  rclone copy "$OUT" "$BACKUP_RCLONE_REMOTE" --no-traverse \
    || echo "$(date -u) WARNING: off-box copy to $BACKUP_RCLONE_REMOTE FAILED"
fi

# Retention only after a good dump exists.
find "$DIR" \( -name 'alkeva-*.dump' -o -name 'alkeva-*.dump.age' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date -u) ok $(du -h "$OUT" | cut -f1) $OUT"
