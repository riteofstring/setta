import time

import numpy as np
from runcoder import Runcoder

x = Runcoder("Kevin", "123", "/Kevin/simpleTrainTest/simpleConfig1")

counter = 0
while True:
    print("sending")
    x.log("wave", "sin(x)", np.sin(counter * 0.1))
    x.log("wave", "cos(x)", np.cos(counter * 0.1))
    counter += 1
    time.sleep(0.5)
