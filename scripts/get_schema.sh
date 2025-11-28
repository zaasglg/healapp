#!/bin/bash
cd ~/HealApp-Web
mkdir -p supabase/migrations/from_supabase

echo "Getting database schema from Supabase..."
docker run --rm \
  -e PGPASSWORD="Dn2907200!" \
  -v $(pwd)/supabase/migrations/from_supabase:/backups \
  --network host \
  postgres:17 \
  pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  --schema-only -f /backups/schema.sql

if [ $? -eq 0 ]; then
    echo "Schema extracted successfully!"
    ls -lh supabase/migrations/from_supabase/schema.sql
else
    echo "Error extracting schema"
    exit 1
fi

