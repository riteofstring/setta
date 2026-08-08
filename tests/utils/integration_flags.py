import os

EXTERNAL_AGENT_INTEGRATION_ENV = "SETTA_RUN_EXTERNAL_AGENT_INTEGRATION_TESTS"
EXTERNAL_AGENT_INTEGRATION_SKIP_REASON = (
    "External agent integration tests are opt-in; set "
    f"{EXTERNAL_AGENT_INTEGRATION_ENV}=1 to run."
)
_TRUE_VALUES = {"1", "true", "yes"}


def external_agent_integration_tests_enabled() -> bool:
    value = os.environ.get(EXTERNAL_AGENT_INTEGRATION_ENV, "")
    return value.strip().lower() in _TRUE_VALUES
