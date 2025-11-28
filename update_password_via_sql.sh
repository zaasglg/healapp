#!/bin/bash
# Update password via SQL file

cd ~/HealApp-Web

# Generate hash
python3 << 'PYEOF'
import bcrypt
pwd = b'dn2907200'
salt = bcrypt.gensalt(rounds=10, prefix=b'2a')
h = bcrypt.hashpw(pwd, salt)
with open('/tmp/pwd_hash_final.txt', 'w') as f:
    f.write(h.decode())
print('Hash generated')
PYEOF

# Update password
HASH=$(cat /tmp/pwd_hash_final.txt)
docker compose exec -T db psql -U postgres -d postgres <<EOFSQL
UPDATE auth.users 
SET encrypted_password = '$HASH', updated_at = NOW()
WHERE email = 'nazardubnak@gmail.com';

SELECT email, LEFT(encrypted_password, 30) as hash_start
FROM auth.users 
WHERE email = 'nazardubnak@gmail.com';
EOFSQL

# Restart auth
docker compose restart auth
sleep 3
echo "Password updated and auth restarted"

