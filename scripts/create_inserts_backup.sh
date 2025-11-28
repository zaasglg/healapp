#!/bin/bash
cd ~/HealApp-Web
mkdir -p backups

echo "Creating data backup with INSERT statements..."
docker run --rm \
  -e PGPASSWORD="Dn2907200!" \
  -v $(pwd)/backups:/backups \
  --network host \
  postgres:17 \
  pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  --data-only --schema=public --inserts -f /backups/data_inserts.sql

if [ $? -eq 0 ]; then
    echo "Data backup with INSERTs created successfully!"
    ls -lh backups/data_inserts.sql
else
    echo "Error creating data backup"
    exit 1
fi

