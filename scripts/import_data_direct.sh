#!/bin/bash
cd ~/HealApp-Web

echo "Importing data directly from Supabase..."

# 1. Import auth.users first
echo "Step 1: Importing auth.users..."
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  pg_dump -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  --data-only --schema=auth --table=auth.users | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | grep -E '(COPY|INSERT|ERROR)' | tail -3

# 2. Import organizations
echo "Step 2: Importing organizations..."
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  psql -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  -c "COPY (SELECT * FROM public.organizations) TO STDOUT WITH CSV HEADER" | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres \
  -c "COPY public.organizations FROM STDIN WITH CSV HEADER" 2>&1

# 3. Import user_profiles
echo "Step 3: Importing user_profiles..."
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  psql -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  -c "COPY (SELECT * FROM public.user_profiles) TO STDOUT WITH CSV HEADER" | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres \
  -c "COPY public.user_profiles FROM STDIN WITH CSV HEADER" 2>&1

# 4. Import patient_cards
echo "Step 4: Importing patient_cards..."
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  psql -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  -c "COPY (SELECT * FROM public.patient_cards) TO STDOUT WITH CSV HEADER" | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres \
  -c "COPY public.patient_cards FROM STDIN WITH CSV HEADER" 2>&1

# 5. Import diaries
echo "Step 5: Importing diaries..."
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  psql -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  -c "COPY (SELECT * FROM public.diaries) TO STDOUT WITH CSV HEADER" | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres \
  -c "COPY public.diaries FROM STDIN WITH CSV HEADER" 2>&1

# 6. Import diary_history
echo "Step 6: Importing diary_history..."
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  psql -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  -c "COPY (SELECT * FROM public.diary_history) TO STDOUT WITH CSV HEADER" | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres \
  -c "COPY public.diary_history FROM STDIN WITH CSV HEADER" 2>&1

# 7. Import diary_metric_values
echo "Step 7: Importing diary_metric_values..."
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  psql -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  -c "COPY (SELECT * FROM public.diary_metric_values) TO STDOUT WITH CSV HEADER" | \
  docker exec -i caregivers-diary-db psql -U postgres -d postgres \
  -c "COPY public.diary_metric_values FROM STDIN WITH CSV HEADER" 2>&1

echo "Data import completed!"

