cd ..
. ./activate.sh
SETTA_DEBUG_SECTION_FILTER=gui \
SETTA_SUPPRESS_PRINTS=1 \
SETTA_DEV_MODE="true" \
SETTA_DEBUG_MODULE_FILTER=setta.project_state.jsonSource.save,setta.project_state.jsonSource.load,setta.project_state.settings_project_manager \
UVICORN_LOG_LEVEL=warning \
setta "$@" --log-level debug
