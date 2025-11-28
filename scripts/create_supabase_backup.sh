#!/bin/bash
cd ~/HealApp-Web
mkdir -p backups

echo "Creating backup from Supabase..."
docker run --rm \
  -e PGPASSWORD="Dn2907200!" \
  -v $(pwd)/backups:/backups \
  --network host \
  postgres:17 \
  pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  -F p -f /backups/supabase_full_backup.sql

if [ $? -eq 0 ]; then
    echo "Backup created successfully!"
    ls -lh backups/supabase_full_backup.dump
else
    echo "Error creating backup"
    exit 1
fi

