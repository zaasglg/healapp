#!/bin/bash
cd ~/HealApp-Web

echo "Importing auth.users from Supabase..."

# Create a temporary SQL file with INSERT statements
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  psql -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres -t -A \
  -c "SELECT 'INSERT INTO auth.users (id, aud, role, email, encrypted_password, confirmed_at, last_sign_in_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data, is_super_admin, instance_id) VALUES (' || quote_literal(id::text) || ', ' || quote_literal(COALESCE(aud, 'authenticated')) || ', ' || quote_literal(COALESCE(role, 'authenticated')) || ', ' || quote_literal(COALESCE(email, '')) || ', ' || quote_literal(COALESCE(encrypted_password, '')) || ', ' || quote_literal(COALESCE(confirmed_at::text, 'NULL')) || ', ' || quote_literal(COALESCE(last_sign_in_at::text, 'NULL')) || ', ' || quote_literal(created_at::text) || ', ' || quote_literal(updated_at::text) || ', ' || quote_literal(COALESCE(raw_user_meta_data::text, '{}')) || ', ' || quote_literal(COALESCE(raw_app_meta_data::text, '{}')) || ', ' || COALESCE(is_super_admin::text, 'false') || ', ' || quote_literal(COALESCE(instance_id::text, '00000000-0000-0000-0000-000000000000')) || ');' FROM auth.users;" \
  > /tmp/auth_users_inserts.sql

# Import users
cat /tmp/auth_users_inserts.sql | docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | grep -E '(INSERT|ERROR)' | tail -5

echo "Auth users import completed!"

