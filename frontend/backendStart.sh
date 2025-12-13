cd ..
. ./activate.sh
# SETTA_DEV_MODE="true" setta "$@" # pass in other command line args
SETTA_INIT_DELAY_SECONDS=3 SETTA_DEV_MODE="true" setta "$@" --log-level debug
