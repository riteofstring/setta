from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, Field

from setta.types.chat_messages import JSONValue
from setta.types.id import ID

if TYPE_CHECKING:
    from mcp.server.fastmcp.server import Context

UISettingSource = Literal["core", "plugin"]
UISettingMutability = Literal["readOnly", "writable"]
UISettingSide = Literal["left", "right"]
UISettingHighlightStrategy = Literal["dom_anchor", "plugin_handler"]
UISettingRevealActivationType = Literal[
    "project_ai_settings_accordion_item",
    "run_instructions_accordion_item",
]
UISettingValueType = Literal[
    "boolean",
    "string",
    "number",
    "integer",
    "array",
    "object",
]
UISettingErrorCode = Literal[
    "setting_not_found",
    "setting_read_only",
    "invalid_value_type",
    "invalid_value_range_or_enum",
    "plugin_unavailable",
    "mutation_failed",
]


class UISettingLocation(BaseModel, extra="forbid"):
    side: UISettingSide
    overviewTabKey: str | None = None
    uiEditorTabName: str | None = None
    pluginId: str | None = None
    paneId: str | None = None
    requiresSectionSelection: bool = False
    preferredSectionType: str | None = None


class UISettingHighlight(BaseModel, extra="forbid"):
    strategy: UISettingHighlightStrategy
    anchorId: str | None = None
    pluginRevealKey: str | None = None


class UISettingRevealActivationStep(BaseModel, extra="forbid"):
    type: UISettingRevealActivationType
    itemValue: str


class UISettingValueSchema(BaseModel, extra="forbid"):
    type: UISettingValueType
    enumValues: list[JSONValue] | None = None
    minimum: float | None = None
    maximum: float | None = None
    minLength: int | None = None
    maxLength: int | None = None
    items: "UISettingValueSchema | None" = None
    properties: "dict[str, UISettingValueSchema] | None" = None
    requiredProperties: list[str] | None = None
    additionalProperties: bool | None = None


class UISettingEntry(BaseModel, extra="forbid"):
    settingId: str
    title: str
    synonyms: list[str] = Field(default_factory=list)
    description: str
    location: UISettingLocation
    highlight: UISettingHighlight
    source: UISettingSource
    pluginId: str | None = None
    mutability: UISettingMutability
    valueSchema: UISettingValueSchema
    revealActivationSteps: list[UISettingRevealActivationStep] = Field(
        default_factory=list
    )


class UISettingMutationResult(BaseModel, extra="forbid"):
    oldValue: JSONValue
    newValue: JSONValue
    normalizedValue: JSONValue
    changed: bool


class UISettingToolError(BaseModel, extra="forbid"):
    code: UISettingErrorCode
    message: str


@dataclass(frozen=True, slots=True)
class UISettingRuntimeEntry:
    metadata: UISettingEntry
    readValue: Callable[["Context", ID], Awaitable[JSONValue] | JSONValue]
    writeValue: (
        Callable[
            ["Context", ID, JSONValue, JSONValue | None],
            Awaitable[UISettingMutationResult] | UISettingMutationResult,
        ]
        | None
    ) = None


UISettingValueSchema.model_rebuild()
