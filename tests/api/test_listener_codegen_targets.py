import pytest

from setta.api.listener import SettaListener
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig


@pytest.mark.asyncio
async def test_listener_fails_fast_without_python_codegen() -> None:
    project_config = ProjectConfig(
        id=ID("project-disabled"),
        name="Project Disabled",
        codegenTargets=[],
    )
    project_state = ProjectStateSingleConfig(projectConfig=project_config)
    listener = SettaListener(project_name=project_config.name)

    with pytest.raises(RuntimeError):
        await listener._refresh_from_snapshot(project_state)

    assert listener._stop_event.is_set()
