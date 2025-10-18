cd ..
. ./activate.sh
# SETTA_DEV_MODE="true" setta "$@" # pass in other command line args
SETTA_DEV_MODE="true" SETTA_SUPPRESS_BACKEND_PRINTS="1" setta "$@" --log-level critical
