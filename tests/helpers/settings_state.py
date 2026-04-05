from pydantic import BaseModel, Field

from tests.helpers.settings_models import (
    ChatWindowingSettings,
    SectionSizingPolicy,
    SettingsBackend,
    SettingsGUI,
    SettingsShortcuts,
    get_default_language_server_settings,
)


class SettingsState(BaseModel, extra="forbid"):
    """Minimal test helper for settings-state policy coverage."""

    shortcuts: SettingsShortcuts = Field(default_factory=SettingsShortcuts)
    gui: SettingsGUI = Field(default_factory=SettingsGUI)
    backend: SettingsBackend = Field(default_factory=SettingsBackend)
    chatWindowing: ChatWindowingSettings = Field(default_factory=ChatWindowingSettings)
    sectionSizingPolicy: SectionSizingPolicy = Field(
        default_factory=SectionSizingPolicy
    )
    languageServer: dict = Field(default_factory=get_default_language_server_settings)
