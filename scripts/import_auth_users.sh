#!/bin/bash
cd ~/HealApp-Web

echo "Importing auth.users from Supabase..."

# Get users data from Supabase and import
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  psql -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  -c "SELECT id, email, phone, encrypted_password, email_confirmed_at, phone_confirmed_at, confirmed_at, last_sign_in_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data, is_super_admin, role FROM auth.users;" \
  | docker exec -i caregivers-diary-db psql -U postgres -d postgres \
  -c "COPY auth.users (id, email, phone, encrypted_password, email_confirmed_at, phone_confirmed_at, confirmed_at, last_sign_in_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data, is_super_admin, role) FROM STDIN WITH CSV HEADER;" 2>&1

echo "Auth users import completed!"

