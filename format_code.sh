#!/bin/sh
black setup.py cli backend
isort setup.py cli backend --profile black