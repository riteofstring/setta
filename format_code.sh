#!/bin/sh
black setup.py python
isort setup.py python --profile black