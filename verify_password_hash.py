#!/usr/bin/env python3
import bcrypt
import sys

if len(sys.argv) < 2:
    print("Usage: python3 verify_password_hash.py <hash>")
    sys.exit(1)

stored_hash = sys.argv[1]
password = 'dn2907200'

try:
    result = bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))
    if result:
        print("SUCCESS: Password matches!")
        sys.exit(0)
    else:
        print("FAILED: Password does not match!")
        sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)

