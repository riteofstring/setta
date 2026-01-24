from setta.types.external_agents import (
    ClaudeSettingsManaged,
    ClaudeSettingsPermissions,
    ExternalAgentSettingsManagedBlock,
    OpenCodeSettingsManaged,
)

DEFAULT_CLAUDE_ASK_RULES = [
    "Bash(rm:*)",
    "Bash(sudo:*)",
    "Bash(chmod:*)",
    "Bash(chown:*)",
    "Bash(git push:*)",
    "Bash(git reset:*)",
    "Bash(git clean:*)",
    "Bash(dd:*)",
    "Bash(mkfs:*)",
    "Bash(diskutil:*)",
    "Bash(shutdown:*)",
    "Bash(reboot:*)",
]

DEFAULT_OPENCODE_PERMISSION = {
    "*": "allow",
    "bash": {
        "*": "allow",
        "rm *": "ask",
        "sudo *": "ask",
        "chmod *": "ask",
        "chown *": "ask",
        "git push": "ask",
        "git push *": "ask",
        "git reset": "ask",
        "git reset *": "ask",
        "git clean": "ask",
        "git clean *": "ask",
        "dd *": "ask",
        "mkfs *": "ask",
        "diskutil *": "ask",
        "shutdown": "ask",
        "shutdown *": "ask",
        "reboot": "ask",
        "reboot *": "ask",
    },
}


def build_default_claude_settings_block() -> ExternalAgentSettingsManagedBlock:
    return ExternalAgentSettingsManagedBlock(
        claude=ClaudeSettingsManaged(
            permissions=ClaudeSettingsPermissions(ask=list(DEFAULT_CLAUDE_ASK_RULES))
        )
    )


def build_default_opencode_settings_block() -> ExternalAgentSettingsManagedBlock:
    return ExternalAgentSettingsManagedBlock(
        opencode=OpenCodeSettingsManaged(permission=dict(DEFAULT_OPENCODE_PERMISSION))
    )
