#!/bin/sh
if ! . ./check_python.sh; then
    [ "$PS1" ] && return 1 || exit 1;
fi

if [ ! -f "abcde_env/pyvenv.cfg" ]; then
    python3 -m venv abcde_env
fi

. ./activate.sh

if [[ "$1" == "dev" ]]; then
    pip install -e ".[cli,backend,dev,test]"
fi