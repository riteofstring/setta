from setta.cli import Setta
import time

from setta.cli.logger import SettaImg, SettaList

logger = Setta(root_path="/Users/kevin/Downloads")

print("logger.root_path", logger.root_path)
print("logger.send_data_to", logger.send_data_to)

# all_data = []

# for i in range(100):
#     all_data.append({"size": i, "elephant": 3})
#     logger.log({"frogdog": SettaList(all_data)}, save=True)
#     time.sleep(1)

from PIL import Image
import numpy as np
import io

# Suppose you have a NumPy array representing an image
arr = np.random.randint(0, 256, (100, 100, 3), dtype=np.uint8)
pil_img = Image.fromarray(arr)

# Encode the PIL image as PNG in memory
buffer = io.BytesIO()
pil_img.save(buffer, format="PNG")
raw_png = buffer.getvalue()

# Now pass that raw PNG bytes to SettaImg (which doesn't use PIL itself)
setta_img = SettaImg(img=raw_png, format="png")
setta_img.save("my_numpy_image_converted")  # writes "my_numpy_image_converted.png"
