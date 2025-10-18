cd ..
. ./activate.sh
# SETTA_DEV_MODE="true" setta "$@" # pass in other command line args
SETTA_ENABLE_VIRTUAL_COMPLETIONS=1 SETTA_VIRTUAL_COMPLETION_SCHEME=untitled SETTA_DEV_MODE="true" setta "$@" --log-level debug
