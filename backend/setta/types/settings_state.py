from enum import Enum


class RunSnapshotMode(str, Enum):
    always = "always"
    ephemeral = "ephemeral"
    never = "never"
