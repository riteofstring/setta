#!/bin/bash
cd ..
. ./activate.sh
RUNCODER_DEV_MODE="true" runcoder --with_example_projects "$@" # pass in other command line args