import os
import platform

_FORCE_POLLING_OBSERVER_ENV = "SETTA_TEST_FORCE_POLLING_OBSERVER"


def should_force_polling_observer() -> bool:
    """Prefer native watchdog observers except where they're known to be flaky.

    The default macOS watchdog observer uses FSEvents, which is flaky/unsupported in
    some sandboxed test environments. Polling keeps those tests deterministic.
    """

    env_value = os.environ.get(_FORCE_POLLING_OBSERVER_ENV)
    if env_value is not None:
        return env_value.lower() in {"1", "true", "yes"}
    return platform.system() == "Darwin"

