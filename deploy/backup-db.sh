#!/usr/bin/env bash
# Nightly Postgres dump on the VPS. Installed by cron as root:
#
#   15 23 * * * /opt/alkeva/app/deploy/backup-db.sh >> /var/log/alkeva-backup.log 2>&1
#
# (23:15 UTC = 02:15 EAT, the quietest hour.)
#
# Supabase used to do this for us. With Postgres on the box, this is the only
# copy of the ledger that is not the live volume — so it fails loudly, keeps
# two weeks, and never deletes the last good dump on a failed run.
#
# These dumps sit on the same disk as the database: they cover a bad migration
# or a fat-fingered delete, NOT a lost server. Pull one off-box periodically:
#   scp -i ~/.ssh/alkeva_vps root@159.195.85.255:/opt/alkeva/backups/<file> .
set -euo pipefail

DIR=/opt/alkeva/backups
KEEP_DAYS=14
COMPOSE="docker compose -f /opt/alkeva/app/deploy/docker-compose.prod.yml"

mkdir -p "$DIR" && chmod 700 "$DIR"
OUT="$DIR/alkeva-$(date -u +%Y%m%dT%H%MZ).dump"

# Write to a temp name and rename only on success, so a half-written file can
# never be mistaken for a backup.
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$OUT.part"
# A custom-format dump starts with the magic "PGDMP"; an error page does not.
[ "$(head -c 5 "$OUT.part")" = "PGDMP" ] || { echo "$(date -u) dump invalid"; rm -f "$OUT.part"; exit 1; }
mv "$OUT.part" "$OUT"
chmod 600 "$OUT"

# Retention only after a good dump exists.
find "$DIR" -name 'alkeva-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u) ok $(du -h "$OUT" | cut -f1) $OUT"
