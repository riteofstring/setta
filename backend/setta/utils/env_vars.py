WORKSPACE_ROOT_ENV = "SETTA_WORKSPACE_ROOT"
RUNTIME_ROOT_ENV = "SETTA_RUNTIME_ROOT"
FILES_ROOT_ENV = "SETTA_FILES_ROOT"
PROFILE_ENV = "SETTA_PROFILE"
PROFILE_LOOKUP_HOME_ENV = "SETTA_PROFILE_LOOKUP_HOME"
SERVER_MODE_ENV = "SETTA_SERVER_MODE"

# Internal knobs that back Setta's local/global setta_files model.
# These are not a replacement for the user config file; they're primarily for
# process-level overrides (CLI, tests).
SETTA_HOME_ENV = "SETTA_HOME"
FILES_LOCATION_ENV = "SETTA_FILES_LOCATION"
