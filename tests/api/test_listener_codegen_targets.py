import pytest

from setta.api.listener import SettaListener
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateSingleConfig


@pytest.mark.asyncio
async def test_listener_bootstraps_without_python_codegen() -> None:
    project_config = ProjectConfig(
        id=ID("project-disabled"),
        name="Project Disabled",
        codegenTargets=[],
    )
    project_state = ProjectStateSingleConfig(projectConfig=project_config)
    listener = SettaListener(project_name=project_config.name)
    sent_payloads: list[str] = []

    async def capture(payload: str) -> None:
        sent_payloads.append(payload)

    listener._send_websocket_payload = capture

    await listener._refresh_from_snapshot(project_state)

    assert listener._runtime_state is not None
    assert listener._project_config_id == project_config.id
    assert sent_payloads
    assert not listener._stop_event.is_set()
