from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CapabilityMode(str, Enum):
    disabled = "disabled"
    inherit = "inherit"
    custom = "custom"


class CapabilityPolicy(BaseModel):
    mode: CapabilityMode = CapabilityMode.disabled
    enabledSkillIds: list[str] = Field(default_factory=list)
    enabledMcpServerIds: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _dedupe_ids(self) -> "CapabilityPolicy":
        self.enabledSkillIds = _dedupe_str_list(self.enabledSkillIds)
        self.enabledMcpServerIds = _dedupe_str_list(self.enabledMcpServerIds)
        return self


class SkillSource(BaseModel):
    id: str
    path: str
    label: str
    builtin: bool = False

    model_config = ConfigDict(extra="forbid")


class SkillEntry(BaseModel):
    id: str
    sourceId: str
    sourceLabel: str
    relativePath: str
    absolutePath: str
    name: str
    description: str
    version: str | None = None
    parseError: str | None = None

    model_config = ConfigDict(extra="forbid")


class SkillCatalogResponse(BaseModel):
    sources: list[SkillSource] = Field(default_factory=list)
    skills: list[SkillEntry] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class SkillDetailsResponse(BaseModel):
    id: str
    sourceId: str
    sourceLabel: str
    relativePath: str
    absolutePath: str
    name: str
    description: str
    version: str | None = None
    metadata: dict[str, Any] | None = None
    content: str = ""
    parseError: str | None = None

    model_config = ConfigDict(extra="forbid")


class GlobalCapabilityDefaults(BaseModel):
    defaultSkillIds: list[str] = Field(default_factory=list)
    defaultMcpServerIds: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _dedupe_ids(self) -> "GlobalCapabilityDefaults":
        self.defaultSkillIds = _dedupe_str_list(self.defaultSkillIds)
        self.defaultMcpServerIds = _dedupe_str_list(self.defaultMcpServerIds)
        return self


class McpServerRuntimeState(BaseModel):
    serverId: str
    connected: bool
    error: str | None = None
    toolCount: int = 0
    refreshedAtMs: int | None = None

    model_config = ConfigDict(extra="forbid")


class McpServersRuntimeStateResponse(BaseModel):
    servers: list[McpServerRuntimeState] = Field(default_factory=list)
    generatedAtMs: int

    model_config = ConfigDict(extra="forbid")


class SkillsConfigFile(BaseModel):
    skillSources: list[SkillSource] = Field(default_factory=list)
    globalDefaults: GlobalCapabilityDefaults = Field(
        default_factory=GlobalCapabilityDefaults
    )
    # projectConfigId -> chat key -> policy
    projectChatPolicies: dict[str, dict[str, CapabilityPolicy]] = Field(
        default_factory=dict
    )

    model_config = ConfigDict(extra="forbid")


def _dedupe_str_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    return deduped
