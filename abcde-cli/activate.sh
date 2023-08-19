#!/bin/sh
if [ -f "abcde_env/bin/activate" ]; then
# Mac/Linux etc.
. abcde_env/bin/activate
else
# Windows
. abcde_env/Scripts/activate
fi