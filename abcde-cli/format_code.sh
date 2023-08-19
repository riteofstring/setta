#!/bin/sh
black setup.py src tests
isort setup.py src tests --profile black