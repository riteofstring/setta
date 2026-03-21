from pydantic import BaseModel, Field

from setta.types.id import ID


class AgenticSummaryCacheStatus(BaseModel):
    maxSummariesPerRun: int
    summarySectionIds: list[ID] = Field(default_factory=list)
    cachedSectionIds: list[ID] = Field(default_factory=list)
    missingSectionIds: list[ID] = Field(default_factory=list)
    emptySourceSectionIds: list[ID] = Field(default_factory=list)
    consideredSectionIds: list[ID] = Field(default_factory=list)
    wouldAttemptSectionIds: list[ID] = Field(default_factory=list)
