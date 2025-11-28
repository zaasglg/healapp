#!/usr/bin/env python3
import bcrypt

password = 'dn2907200'
# Generate hash with $2a$ format (GoTrue compatible)
salt = bcrypt.gensalt(rounds=10, prefix=b'2a')
hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
print(hashed.decode('utf-8'))

