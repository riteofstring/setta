from setta.logging.logger import SettaLogger, SettaList
import time


x = {"something": SettaList({"x":[1,2,3], "y":[4,5,6]})}
logger = SettaLogger()

for i in range(1000):
    print("sending", i)
    time.sleep(1)
    logger.send(x)
print('done')