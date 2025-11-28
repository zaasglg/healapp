#!/bin/bash
cd ~/HealApp-Web

# Get current hash
CURRENT_HASH=$(docker compose exec -T db psql -U postgres -d postgres -t -A -c "SELECT encrypted_password FROM auth.users WHERE email = 'nazardubnak@gmail.com';")

echo "Current hash: ${CURRENT_HASH:0:30}..."

# Generate new hash
NEW_HASH=$(python3 /tmp/generate_password_hash_2a.py 2>&1 | head -1)

echo "New hash: ${NEW_HASH:0:30}..."

# Update password
docker compose exec -T db psql -U postgres -d postgres -c "UPDATE auth.users SET encrypted_password = '$NEW_HASH', updated_at = NOW() WHERE email = 'nazardubnak@gmail.com';"

# Verify
docker compose exec -T db psql -U postgres -d postgres -c "SELECT email, LEFT(encrypted_password, 30) as hash_start, LENGTH(encrypted_password) as len FROM auth.users WHERE email = 'nazardubnak@gmail.com';"

# Restart auth
docker compose restart auth

echo "Password updated and Auth restarted"

