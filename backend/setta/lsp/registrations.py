from dataclasses import dataclass

from setta.types.section_impls import CodeLanguageKey


@dataclass(slots=True, frozen=True)
class RegisteredLanguageServer:
    plugin_id: str | None
    name: str
    language: CodeLanguageKey
    command: str
    args: tuple[str, ...] = ()
    settings_key: str | None = None
