#!/bin/sh
if ! . ./check_python.sh; then
    return 1
fi

if [ -f "abcde_env/bin/activate" ]; then
# Mac/Linux etc.
. abcde_env/bin/activate
else
# Windows
. abcde_env/Scripts/activate
fi