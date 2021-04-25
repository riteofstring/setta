import os
import sys

sys.path.insert(0, "src")
import abcde_pip

import ui_specifier

print(
    "Running unit tests for ui_specifier version {} and abcde_pip version {}".format(
        ui_specifier.__version__, abcde_pip.__version__
    )
)
