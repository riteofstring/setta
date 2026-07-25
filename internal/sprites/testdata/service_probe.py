import os
import pathlib
import time


counter_path = pathlib.Path("/home/sprite/.setta/phase1b/service-start-count")
heartbeat_path = pathlib.Path("/home/sprite/.setta/phase1b/service-heartbeat")
try:
    count = int(counter_path.read_text(encoding="utf-8"))
except FileNotFoundError:
    count = 0

temporary_path = counter_path.with_suffix(".tmp")
temporary_path.write_text(f"{count + 1}\n", encoding="utf-8")
os.replace(temporary_path, counter_path)

heartbeat = 0
while True:
    heartbeat += 1
    heartbeat_temporary_path = heartbeat_path.with_suffix(".tmp")
    heartbeat_temporary_path.write_text(f"{heartbeat}\n", encoding="utf-8")
    os.replace(heartbeat_temporary_path, heartbeat_path)
    time.sleep(0.1)
