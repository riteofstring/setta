import setuptools

setuptools.setup(
    name="runcoder",
    version="0.0.0",
    package_dir={"": "."},
    packages=setuptools.find_packages(where="."),
    install_requires=[],
    entry_points={
        "console_scripts": [
            "runcoder = cli.src.runcoder.cli.main:cli",
        ],
    },
    extras_require={
        "cli": [
            "click==8.1.3",
            "requests==2.28.1",
            "PyYAML==6.0",
            "websockets==11.0.3",
            "jedi==0.19.0",
            "mypy==1.5.1",
        ],
        "backend": ["fastapi==0.103.1", "uvicorn==0.23.2"],
        "dev": ["black==23.7.0", "isort==5.12.0", "flake8==6.1.0"],
        "test": ["torchvision==0.15.2"],
    },
)
