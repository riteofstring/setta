import setuptools

setuptools.setup(
    name="runcoder",
    version="0.0.0",
    package_dir={"": "src"},
    packages=setuptools.find_packages(where="src"),
    install_requires=[
        "click==8.1.3",
        "requests==2.28.1",
        "keyring==23.11.0",
        "PyYAML==6.0",
        "websockets==11.0.3",
        "jedi==0.19.0",
    ],
    entry_points={
        "console_scripts": [
            "runcoder = runcoder.cli.main:cli",
        ],
    },
    extras_require={
        "dev": ["black", "isort", "flake8"],
    },
)
