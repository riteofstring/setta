#!/bin/sh
for p in python python2 python3; do
    loc=$(which $p 2>/dev/null)
    if [[ $loc == *"conda"* ]]; then
        echo "Looks like you have a conda environment activated for '$p'"
        return 1
    fi
done