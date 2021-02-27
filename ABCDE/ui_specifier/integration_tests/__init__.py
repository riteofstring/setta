import os
import sys

sys.path.insert(0, "../ui_specifier/src")
import ui_specifier

print(
    "Running integration tests for ui_specifier version {}".format(
        ui_specifier.__version__
    )
)
