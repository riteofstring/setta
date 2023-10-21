#!/bin/bash
cd ..
. ./activate.sh
cd python/runcoder
RUNCODER_DEV_MODE="true" runcoder --reload --with_example_projects