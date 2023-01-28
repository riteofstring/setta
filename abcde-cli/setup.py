import sys

import setuptools

sys.path.insert(0, "src")
import runcoder

setuptools.setup(
    name="runcoder",
    version=runcoder.__version__,
    package_dir={"": "src"},
    packages=setuptools.find_packages(where="src"),
    install_requires=[
        "click==8.1.3",
        "requests==2.28.1",
        "keyring==23.11.0",
        "PyYAML==6.0",
    ],
    entry_points={
        "console_scripts": [
            "runcoder = runcoder.main:cli",
        ],
    },
)
