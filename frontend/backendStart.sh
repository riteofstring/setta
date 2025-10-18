cd ..
. ./activate.sh
SETTA_DEBUG_SECTION_FILTER=gui \
SETTA_SUPPRESS_PRINTS=1 \
SETTA_DEV_MODE="true" \
SETTA_DEBUG_MODULE_FILTER=setta.project_state.jsonSource.save,setta.project_state.jsonSource.load,setta.project_state.jsonSource.jsonSource,setta.project_state.settings_project_manager,setta.types.helpers_lvl2 \
SETTA_LOGGER_LEVEL_OVERRIDES="uvicorn=warning,uvicorn.error=warning,uvicorn.access=warning,uvicorn.asgi=warning,uvicorn.lifespan=warning,httpx=warning,mcp=warning,mcp.server=warning,mcp.server.lowlevel.server=warning,websockets=warning,websockets.server=warning,websockets.client=warning" \
UVICORN_LOG_LEVEL=warning \
setta "$@" --log-level debug
