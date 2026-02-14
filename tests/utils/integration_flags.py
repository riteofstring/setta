import os

AGENT_INTEGRATION_ENV = "SETTA_RUN_AGENT_INTEGRATION_TESTS"
LEGACY_AGENT_INTEGRATION_ENV = "SETTA_RUN_EXTERNAL_AGENT_INTEGRATION_TESTS"
AGENT_INTEGRATION_SKIP_REASON = (
    "Agent integration tests are opt-in; set "
    f"{AGENT_INTEGRATION_ENV}=1 to run."
)
_TRUE_VALUES = {"1", "true", "yes"}


def agent_integration_tests_enabled() -> bool:
    for env_name in (AGENT_INTEGRATION_ENV, LEGACY_AGENT_INTEGRATION_ENV):
        value = os.environ.get(env_name, "")
        if value.strip().lower() in _TRUE_VALUES:
            return True
    return False
