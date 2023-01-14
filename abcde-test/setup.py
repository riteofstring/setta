import sys

import setuptools

sys.path.insert(0, "src_python")
import runcoder_test

setuptools.setup(
    name="runcoder-test",
    version=runcoder_test.__version__,
    package_dir={"": "src_python"},
    packages=setuptools.find_packages(where="src_python"),
    install_requires=["pyjson5 == 1.6.2"],
)