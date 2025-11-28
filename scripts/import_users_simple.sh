#!/bin/bash
cd ~/HealApp-Web

echo "Importing auth.users from Supabase..."

# Get all users and create INSERT statements compatible with target schema
docker run --rm -e PGPASSWORD="Dn2907200!" --network host postgres:17 \
  psql -h db.mtpawypaihmwrngirnxa.supabase.co -U postgres -d postgres \
  -c "SELECT id, COALESCE(aud, 'authenticated') as aud, COALESCE(role, 'authenticated') as role, email, encrypted_password, COALESCE(confirmed_at, email_confirmed_at, phone_confirmed_at) as confirmed_at, last_sign_in_at, created_at, updated_at, COALESCE(raw_user_meta_data, '{}'::jsonb) as raw_user_meta_data, COALESCE(raw_app_meta_data, '{}'::jsonb) as raw_app_meta_data, COALESCE(is_super_admin, false) as is_super_admin, COALESCE(instance_id, '00000000-0000-0000-0000-000000000000'::uuid) as instance_id FROM auth.users;" \
  -t -A -F $'\t' | \
  while IFS=$'\t' read -r id aud role email encrypted_password confirmed_at last_sign_in_at created_at updated_at raw_user_meta_data raw_app_meta_data is_super_admin instance_id; do
    if [ -n "$id" ]; then
      echo "INSERT INTO auth.users (id, aud, role, email, encrypted_password, confirmed_at, last_sign_in_at, created_at, updated_at, raw_user_meta_data, raw_app_meta_data, is_super_admin, instance_id) VALUES ('$id', '$aud', '$role', $(echo "$email" | sed "s/'/''/g" | sed "s/^/'/" | sed "s/$/'/"), $(echo "$encrypted_password" | sed "s/'/''/g" | sed "s/^/'/" | sed "s/$/'/"), $(echo "$confirmed_at" | sed "s/^/NULL/'/" | sed "s/^NULL/'/NULL/"), $(echo "$last_sign_in_at" | sed "s/^/NULL/'/" | sed "s/^NULL/'/NULL/"), '$created_at', '$updated_at', '$raw_user_meta_data', '$raw_app_meta_data', $is_super_admin, '$instance_id');"
    fi
  done | docker exec -i caregivers-diary-db psql -U postgres -d postgres 2>&1 | tail -10

echo "Auth users import completed!"

