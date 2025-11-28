#!/bin/bash
cd ~/HealApp-Web
mkdir -p backups

echo "Creating data-only backup from Supabase..."
docker run --rm \
  -e PGPASSWORD="Dn2907200!" \
  -v $(pwd)/backups:/backups \
  --network host \
  postgres:17 \
  pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  --data-only --schema=public -F p -f /backups/supabase_data_only.sql

if [ $? -eq 0 ]; then
    echo "Data backup created successfully!"
    ls -lh backups/supabase_data_only.sql
else
    echo "Error creating data backup"
    exit 1
fi

