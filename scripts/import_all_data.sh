#!/bin/bash
cd ~/HealApp-Web

echo "Importing all data with disabled constraints..."

# Disable all foreign key constraints
docker exec caregivers-diary-db psql -U postgres -d postgres << "EOFSQL"
BEGIN;
-- Disable triggers for foreign keys
ALTER TABLE public.organizations DISABLE TRIGGER ALL;
ALTER TABLE public.user_profiles DISABLE TRIGGER ALL;
ALTER TABLE public.patient_cards DISABLE TRIGGER ALL;
ALTER TABLE public.diaries DISABLE TRIGGER ALL;
ALTER TABLE public.diary_history DISABLE TRIGGER ALL;
ALTER TABLE public.diary_metric_values DISABLE TRIGGER ALL;
COMMIT;
EOFSQL

# Import data from Supabase
echo "Importing data from Supabase..."
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  --data-only --schema=public --disable-triggers | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | \
  grep -v 'ERROR.*supabase_admin' | grep -v 'permission denied' | tail -10

# Re-enable triggers
docker exec caregivers-diary-db psql -U postgres -d postgres << "EOFSQL"
BEGIN;
ALTER TABLE public.organizations ENABLE TRIGGER ALL;
ALTER TABLE public.user_profiles ENABLE TRIGGER ALL;
ALTER TABLE public.patient_cards ENABLE TRIGGER ALL;
ALTER TABLE public.diaries ENABLE TRIGGER ALL;
ALTER TABLE public.diary_history ENABLE TRIGGER ALL;
ALTER TABLE public.diary_metric_values ENABLE TRIGGER ALL;
COMMIT;
EOFSQL

echo "Data import completed!"

