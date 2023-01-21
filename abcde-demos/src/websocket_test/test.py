import time

import numpy as np
from runcoder import Runcoder

x = Runcoder("Kevin", "123")

counter = 0
while True:
    value = np.sin(counter * 0.1)
    print("sending", value)
    x.log("wave", "sin(x)", value)
    counter += 1
    time.sleep(0.5)
