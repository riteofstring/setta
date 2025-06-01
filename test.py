# Full round-trip: timestamp -> filename -> back to datetime

import json
import uuid

x = {uuid.uuid4(): "hello"}

json.dumps(x)
