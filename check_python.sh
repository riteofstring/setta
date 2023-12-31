#!/bin/sh
for p in python python2 python3; do
    loc=$(which $p 2>/dev/null)
    if [[ $loc == *"conda"* ]]; then
        printf "\e[01;31mError Looks like you have a conda environment activated for '$p'\e[0m"
        [ "$PS1" ] && return 1 || exit 1;
    fi
done