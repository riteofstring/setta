# Full round-trip: timestamp -> filename -> back to datetime
from setta.utils.timestamps import (
    filename_to_datetime,
    get_now_timestamp,
    timestamp_to_filename,
)

original_timestamp = get_now_timestamp()
print(f"1. Original: {original_timestamp}")

filename_part = timestamp_to_filename(original_timestamp)
print(f"2. Filename: {filename_part}")

recovered_datetime = filename_to_datetime(filename_part)
print(f"3. Recovered: {recovered_datetime}")

print(f"4. Are they equal? {original_timestamp == recovered_datetime}")
# Note: We lose microsecond precision in the filename format
