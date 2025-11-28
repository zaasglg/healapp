#!/usr/bin/env python3
import bcrypt
import sys

password = 'dn2907200'
stored_hash = sys.argv[1] if len(sys.argv) > 1 else '$2a$10$WfLsVeqRXt3DURxYutVege/ztAVBf8a2IZYqsj77OVdA4nI0lJINu'

try:
    result = bcrypt.checkpw(password.encode('utf-8'), stored_hash.encode('utf-8'))
    print(f"Password verification: {result}")
    if result:
        print("SUCCESS: Password matches!")
    else:
        print("FAILED: Password does not match!")
        sys.exit(1)
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)

