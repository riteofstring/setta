import pytest

from setta.app.spec_store import read_app_spec
from setta.project_state.project_manager_types import (
    GetAppDefinitionRequest,
    SetAppDefinitionRequest,
    UpdateAppDefinitionRequest,
)

from tests.utils.manager_fixture import real_project_manager


class TestAppDefinitionProjectManager:
    pytestmark = pytest.mark.asyncio

    async def test_get_app_definition_empty(self) -> None:
        async with real_project_manager() as fixture:
            response = await fixture.manager.get_app_definition(
                GetAppDefinitionRequest()
            )

        assert response.appDefinition is None
        assert response.appSpec is None

    async def test_set_app_definition_persists_spec(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            response = await fixture.manager.set_app_definition(
                SetAppDefinitionRequest(
                    appSpec=payload,
                    appSpecPath="app_specs/custom.json",
                    appSpecVersion="v2",
                    catalogId="setta.app.default",
                )
            )

            assert response.appDefinition is not None
            assert response.appSpec == payload
            assert response.appDefinition.appSpecPath == "app_specs/custom.json"
            assert response.appDefinition.appSpecVersion == "v2"

            stored = read_app_spec(
                fixture.dbe, response.appDefinition.appSpecPath
            )

        assert stored == payload

    async def test_update_app_definition_merges_patch(self) -> None:
        async with real_project_manager() as fixture:
            initial = {
                "root": {
                    "key": "root",
                    "type": "Stack",
                    "props": {"gap": 8, "direction": "column"},
                },
                "elements": {},
            }
            await fixture.manager.set_app_definition(
                SetAppDefinitionRequest(appSpec=initial)
            )

            patch = {"root": {"props": {"gap": 12}}}
            response = await fixture.manager.update_app_definition(
                UpdateAppDefinitionRequest(patch=patch)
            )

            assert response.appSpec is not None
            assert response.appSpec["root"]["props"]["gap"] == 12
            assert response.appSpec["root"]["props"]["direction"] == "column"

            app_definition = fixture.manager.project_state_backend.appDefinition
            assert app_definition is not None
            assert app_definition.appSpecPath is not None
            stored = read_app_spec(fixture.dbe, app_definition.appSpecPath)

        assert stored["root"]["props"]["gap"] == 12
