#!/bin/bash
cd ..
. ./activate.sh
# SETTA_DEV_MODE="true" setta --with_example_projects "$@" # pass in other command line args
SETTA_DEV_MODE="true" setta --with_example_projects --i "seed/exampleProjects/interactive_example/interactive_example.py" --w "$@"
