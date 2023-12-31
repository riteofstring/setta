#!/bin/sh
conda list --name abcde_env
exit_code=$?

if [ $exit_code -eq 1 ]; then
    conda create -y -n abcde_env python=3.11
fi

. ./activate.sh

if [[ "$1" == "dev" && "$CONDA_DEFAULT_ENV" == "abcde_env" ]]; then
    pip install -e ".[dev,test]"
elif [[ "$1" == "test" && "$CONDA_DEFAULT_ENV" == "abcde_env" ]]; then
    pip install -e ".[dev]"
fi