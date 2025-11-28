#!/usr/bin/env python3
import bcrypt

password = 'dn2907200'
hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=10))
print(hashed.decode('utf-8'))

