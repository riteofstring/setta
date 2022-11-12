import setuptools
import sys

sys.path.insert(0, "src")
import runcoder

setuptools.setup(
    name="runcoder",
    version=runcoder.__version__,
    package_dir={"": "src"},
    packages=setuptools.find_packages(where="src"),
    install_requires=["click", "requests"],
    entry_points={
        "console_scripts": [
            "runcoder = runcoder.main:cli",
        ],
    },
)
