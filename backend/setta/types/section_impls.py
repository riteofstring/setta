from enum import Enum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field
from setta.types.chat_messages import BaseChatMessageUnion
from setta.types.generated.go_shared_types import (
    BrowserSavedSearchTypeFilters,
    BrowserSearchScope,
    CodeFileAccessMode,
    CodeLanguage,
)
from setta.types.id import ID, create_new_id


class SectionSizeMode(str, Enum):
    auto = "auto"


class SectionSize(BaseModel, extra="forbid"):
    """Explicit width/height constraints that layout-aware tools can override."""

    width: float | Literal[SectionSizeMode.auto] = Field(
        default=SectionSizeMode.auto,
        description="Section width in pixels or 'auto' to defer to layout heuristics.",
    )
    height: float | Literal[SectionSizeMode.auto] = Field(
        default=SectionSizeMode.auto,
        description="Section height in pixels or 'auto' when the layout controls it.",
    )


CodeLanguageKey = CodeLanguage | str


class ConfigLanguage(str, Enum):
    python = "python"
    json = "json"


class CodeSectionDiagnosticsIgnoreState(BaseModel, extra="forbid"):
    muted: bool = False
    suppressedCodes: list[str | int] = Field(default_factory=list)


class BrowserSavedSearch(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = ""
    query: str = ""
    searchScope: BrowserSearchScope = BrowserSearchScope.recursive
    typeFilters: BrowserSavedSearchTypeFilters = Field(
        default_factory=BrowserSavedSearchTypeFilters
    )
    color: str = "#3b82f6"
    quickInfo: str = ""


class TaskBoardColumn(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    name: str = ""
    color: str = "#3b82f6"
    sortIndex: int = 0


class TaskBoardTaskRecurrence(str, Enum):
    none = "none"
    hourly = "hourly"
    daily = "daily"
    specified_days = "specified_days"
    specified_months = "specified_months"
    specified_years = "specified_years"


class TaskBoardRecurringWeekday(str, Enum):
    monday = "monday"
    tuesday = "tuesday"
    wednesday = "wednesday"
    thursday = "thursday"
    friday = "friday"
    saturday = "saturday"
    sunday = "sunday"


class TaskBoardRecurringMonth(str, Enum):
    january = "january"
    february = "february"
    march = "march"
    april = "april"
    may = "may"
    june = "june"
    july = "july"
    august = "august"
    september = "september"
    october = "october"
    november = "november"
    december = "december"


class TaskBoardTask(BaseModel, extra="forbid"):
    id: ID = Field(default_factory=create_new_id)
    title: str = ""
    description: str = ""
    completed: bool = False
    columnId: ID | None = None
    dueDateIso: str = ""
    recurrence: TaskBoardTaskRecurrence = TaskBoardTaskRecurrence.none
    recurrenceDays: list[TaskBoardRecurringWeekday] = Field(default_factory=list)
    recurrenceMonths: list[TaskBoardRecurringMonth] = Field(default_factory=list)
    recurrenceYears: list[int] = Field(default_factory=list)
    sortIndex: int = 0


class CodeFileBinding(BaseModel, extra="forbid"):
    canonical_path: Path
    access_mode: CodeFileAccessMode
    autoBinding: bool = False

    @property
    def snapshot_dir(self) -> Path:
        return self.canonical_path.parent


class StateMachineGateUiState(BaseModel, extra="forbid"):
    showDetails: bool = False


class ChatSectionBranch(BaseModel, extra="forbid"):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    createdAt: int = 0
    parentBranchId: ID | None = None
    branchFromMessageId: ID | None = None


class ChatSectionState(BaseModel, extra="forbid"):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    inputText: str = ""
    waitingForResponse: bool = False
    toolCallArguments: dict[str, str] = Field(default_factory=dict)
    activeBranchId: ID | None = None
    branches: dict[ID, ChatSectionBranch] = Field(default_factory=dict)
