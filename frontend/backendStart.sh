#!/bin/bash
cd ..
. ./activate.sh
# RUNCODER_DEV_MODE="true" runcoder --with_example_projects "$@" # pass in other command line args
RUNCODER_DEV_MODE="true" runcoder --with_example_projects --i "seed/exampleProjects/interactive_example/interactive_example.py" "$@" # --db "api_keys=../test.db" --w
