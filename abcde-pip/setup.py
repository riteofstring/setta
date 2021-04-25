import sys

import setuptools

sys.path.insert(0, "src")
import abcde_pip

setuptools.setup(
    name="abcde_pip",
    version=abcde_pip.__version__,
    author="Kevin Musgrave",
    package_dir={"": "src"},
    packages=setuptools.find_packages(where="src"),
    python_requires=">=3.8",
    install_requires=["websockets >= 8.1", "pyyaml >= 5.4.1", "requests >= 2.25.1"],
)
