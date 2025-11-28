#!/bin/bash
cd ~/HealApp-Web

echo "Importing data in correct order..."

# Step 1: Import auth.users first
echo "Step 1: Importing auth.users..."
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  --data-only --schema=auth --table=auth.users --inserts | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | \
  grep -E '(INSERT|ERROR)' | tail -3

# Step 2: Import organizations
echo "Step 2: Importing organizations..."
grep 'INSERT INTO public.organizations' backups/data_inserts.sql | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | tail -2

# Step 3: Import user_profiles
echo "Step 3: Importing user_profiles..."
grep 'INSERT INTO public.user_profiles' backups/data_inserts.sql | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | tail -2

# Step 4: Import patient_cards
echo "Step 4: Importing patient_cards..."
grep 'INSERT INTO public.patient_cards' backups/data_inserts.sql | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | tail -2

# Step 5: Import diaries
echo "Step 5: Importing diaries..."
grep 'INSERT INTO public.diaries' backups/data_inserts.sql | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | tail -2

# Step 6: Import diary_history
echo "Step 6: Importing diary_history..."
grep 'INSERT INTO public.diary_history' backups/data_inserts.sql | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | tail -2

# Step 7: Import diary_metric_values
echo "Step 7: Importing diary_metric_values..."
grep 'INSERT INTO public.diary_metric_values' backups/data_inserts.sql | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | tail -2

echo "Import completed!"

