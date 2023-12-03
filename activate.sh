#!/bin/sh
if ! . ./check_python.sh; then
    [ "$PS1" ] && return 1 || exit 1;
fi

if [ -f "abcde_env/bin/activate" ]; then
# Mac/Linux etc.
. abcde_env/bin/activate
else
# Windows
. abcde_env/Scripts/activate
fi