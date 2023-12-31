#!/bin/sh
black python
isort python --profile black
flake8 python --count --show-source --statistics