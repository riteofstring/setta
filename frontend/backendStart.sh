#!/bin/bash
cd ..
. ./activate.sh
cd backend/src
RUNCODER_DEV_MODE="true" python -m backend.start