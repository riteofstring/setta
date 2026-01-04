from dataclasses import dataclass

from setta.project_state.project_manager_types import (
    GetLatestProjectStateSummaryRequest,
)
from setta.project_state.project_state_summary_types import ProjectStateSummary
from setta.types.helpers_lvl3 import build_project_state_summary
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig


@dataclass(slots=True)
class ProjectSummaryManager:
    project_state: ProjectStateSingleConfig

    async def get_latest_project_state_summary(
        self, request: GetLatestProjectStateSummaryRequest
    ) -> ProjectStateSummary:
        if request.projectConfigId != self.project_state.projectConfig.id:
            raise KeyError(f"Unknown projectConfigId: {request.projectConfigId}")
        return build_project_state_summary(self.project_state)


@dataclass(slots=True)
class ProjectSummarySwitcher:
    manager: ProjectSummaryManager
    last_share_session_id: str | None = None

    def get(
        self,
        _project_identifier: object,
        *,
        share_session_id: str | None = None,
    ) -> ProjectSummaryManager:
        self.last_share_session_id = share_session_id
        return self.manager


def build_project_state(project_config_id: ID) -> ProjectStateSingleConfig:
    project_config = ProjectConfig(id=project_config_id, name="Test Project")
    return ProjectStateSingleConfig(projectConfig=project_config)


def build_project_summary_switcher(project_config_id: ID) -> ProjectSummarySwitcher:
    project_state = build_project_state(project_config_id)
    return ProjectSummarySwitcher(ProjectSummaryManager(project_state))
