#!/bin/sh
black setup.py cli backend_py
isort setup.py cli backend_py --profile black