import os
import sys

sys.path.insert(0, "src")
print("sys.path", sys.path)
import abcde_pip

print("Running unit tests for abcde_pip version {}".format(abcde_pip.__version__))
