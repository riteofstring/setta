from enum import Enum


class RenameRefactorMode(str, Enum):
    ALWAYS_ASK = "ALWAYS_ASK"
    ALWAYS_RENAME = "ALWAYS_RENAME"
    NEVER_RENAME = "NEVER_RENAME"


class RunSnapshotMode(str, Enum):
    always = "always"
    ephemeral = "ephemeral"
    never = "never"
