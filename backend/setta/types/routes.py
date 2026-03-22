from enum import Enum


class Route(str, Enum):
    PREFIX = "/api"
    BOOTSTRAP_CONSUME = "/__setta__/bootstrap/consume"
    LOAD_ALL_PROJECT_METADATA = "/loadAllProjectMetadata"
    WEBSOCKET_LISTENER = "/ws/listeners/{id}"
    RUN_DETACHED = "/runDetached"
    GET_RUN_STATUS = "/getRunStatus"
    CANCEL_RUN = "/cancelRun"
    GET_RUNNER_SUMMARY = "/getRunnerSummary"
    GET_LATEST_PROJECT_STATE = "/getLatestProjectState"
