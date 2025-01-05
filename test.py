from setta.cli import Setta
import time

from setta.cli.logger import SettaListData

logger = Setta(root_path="/Users/kevin/Downloads")

print("logger.root_path", logger.root_path)
print("logger.send_data_to", logger.send_data_to)

all_data = []

for i in range(100):
    all_data.append({"size": i, "elephant": 3})
    logger.log({"frogdog": SettaListData(all_data)}, save=True)
    time.sleep(1)