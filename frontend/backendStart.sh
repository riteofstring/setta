#!/bin/bash
cd ..
. ./activate.sh
# SETTA_DEV_MODE="true" setta --with_examples "$@" # pass in other command line args
SETTA_DEV_MODE="true" setta --with_examples --i "seed/exampleProjects/interactive_example/interactive_example.py" --w "$@"
