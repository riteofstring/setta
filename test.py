# from setta.cli import Setta
# import time

# from setta.cli.logger import SettaImg, SettaList, pil_to_setta_img

# logger = Setta(send_data_to="/diffusionDrops")

# print("logger.root_path", logger.root_path)
# print("logger.send_data_to", logger.send_data_to)

# all_data = {"size": [], "elephant": []}

# for i in range(100):
#     all_data["size"].append(i)
#     all_data["elephant"].append(i*3)
#     logger.log({"frogdog": SettaList(all_data)}, save_to="db")
#     time.sleep(1)

# # from PIL import Image
# # import numpy as np
# # import io

# # # Suppose you have a NumPy array representing an image
# # arr = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
# # pil_to_setta_img(Image.fromarray(arr), "png").save("example_img")

import sklearn

sklearn.da