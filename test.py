from setta.logging.logger import Setta, SettaList
import time


x = {"something": SettaList({"x":[1,2,3], "y":[4,5,6]})}
logger = Setta()

for i in range(1000):
    print("sending", i)
    time.sleep(0.025)
    logger.send(x)
print('done')