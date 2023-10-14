#!/bin/bash
cd ..
. ./activate.sh
cd backend_py/src
RUNCODER_DEV_MODE="true" python -m backend_py.start