import pytest

from setta.app.spec_store import read_app_spec
from setta.project_state.project_manager_types import (
    GetAppDefinitionRequest,
    SetAppDefinitionRequest,
    UpdateAppDefinitionRequest,
    ValidateAppDefinitionRequest,
)

from tests.utils.manager_fixture import real_project_manager


def _install_app_definition_transport_capture(sender):
    capture = {
        "project_state_broadcast_calls": 0,
        "app_definition_patch_calls": [],
    }
    original_project_state_broadcast = sender.broadcast_project_state
    original_app_definition_patch_broadcast = (
        sender.broadcast_project_state_app_definition_patch
    )

    async def record_project_state_broadcast(
        project_state,
        completed_op_ids,
        pending_op_ids,
        project_state_revision=None,
    ) -> None:
        capture["project_state_broadcast_calls"] += 1
        await original_project_state_broadcast(
            project_state,
            completed_op_ids,
            pending_op_ids,
            project_state_revision,
        )

    async def record_app_definition_patch(
        project_config_id,
        app_definition,
        app_spec,
        previous_project_state_revision,
        project_state_revision,
        completed_op_ids,
        pending_op_ids,
    ) -> None:
        capture["app_definition_patch_calls"].append(
            {
                "projectConfigId": project_config_id,
                "appDefinition": app_definition,
                "appSpec": app_spec,
                "previousProjectStateRevision": previous_project_state_revision,
                "projectStateRevision": project_state_revision,
                "completedOpIds": list(completed_op_ids),
                "pendingOpIds": list(pending_op_ids),
            }
        )
        await original_app_definition_patch_broadcast(
            project_config_id,
            app_definition,
            app_spec,
            previous_project_state_revision,
            project_state_revision,
            completed_op_ids,
            pending_op_ids,
        )

    sender.broadcast_project_state = record_project_state_broadcast  # type: ignore[method-assign]
    sender.broadcast_project_state_app_definition_patch = record_app_definition_patch  # type: ignore[method-assign]

    def restore() -> None:
        sender.broadcast_project_state = original_project_state_broadcast  # type: ignore[method-assign]
        sender.broadcast_project_state_app_definition_patch = original_app_definition_patch_broadcast  # type: ignore[method-assign]

    return capture, restore


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

    async def test_set_app_definition_uses_app_definition_patch_transport(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            sender = fixture.manager.websocket_msg_handler
            capture, restore = _install_app_definition_transport_capture(sender)
            try:
                response = await fixture.manager.set_app_definition(
                    SetAppDefinitionRequest(
                        appSpec=payload,
                        appSpecPath="app_specs/custom.json",
                        appSpecVersion="v2",
                        catalogId="setta.app.default",
                    )
                )
                await fixture.manager.finish_pending_operations(timeout=5.0)
            finally:
                restore()

        assert response.appDefinition is not None
        assert capture["project_state_broadcast_calls"] == 0
        assert len(capture["app_definition_patch_calls"]) == 1
        patch = capture["app_definition_patch_calls"][0]
        assert patch["appSpec"] == payload
        assert patch["appDefinition"] == response.appDefinition
        assert patch["previousProjectStateRevision"] < patch["projectStateRevision"]

    async def test_set_app_definition_rejects_unknown_component(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "UnknownComponent"},
                "elements": {},
            }
            with pytest.raises(ValueError, match="unknown component"):
                await fixture.manager.set_app_definition(
                    SetAppDefinitionRequest(appSpec=payload)
                )

    async def test_set_app_definition_rejects_unknown_action_type(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            with pytest.raises(ValueError, match="unknown type"):
                await fixture.manager.set_app_definition(
                    SetAppDefinitionRequest(
                        appSpec=payload,
                        actions={"custom": {"type": "not-supported"}},
                    )
                )

    async def test_set_app_definition_rejects_invalid_theme(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            with pytest.raises(ValueError, match="theme.motion"):
                await fixture.manager.set_app_definition(
                    SetAppDefinitionRequest(
                        appSpec=payload,
                        theme={"motion": "nope"},
                    )
                )

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

    async def test_compare_and_set_app_definition_metadata_uses_app_definition_patch_transport(
        self,
    ) -> None:
        async with real_project_manager() as fixture:
            manager = fixture.manager
            await manager.set_app_definition(
                SetAppDefinitionRequest(
                    appSpec={
                        "root": {"key": "root", "type": "Stack"},
                        "elements": {},
                    },
                )
            )
            await manager.finish_pending_operations(timeout=5.0)

            # Catalog ID currently has a single valid value, so only these
            # metadata routes can exercise the mutation+broadcast path.
            metadata_updates = [
                lambda: manager.compare_and_set_app_definition_spec_version(
                    app_spec_version="v2"
                ),
                lambda: manager.compare_and_set_app_definition_spec_path(
                    app_spec_path="app_specs/renamed.json"
                ),
                lambda: manager.compare_and_set_app_definition_theme_mode(
                    theme_mode="dark"
                ),
            ]

            for update_fn in metadata_updates:
                sender = manager.websocket_msg_handler
                capture, restore = _install_app_definition_transport_capture(sender)
                try:
                    await update_fn()
                    await manager.finish_pending_operations(timeout=5.0)
                finally:
                    restore()

                assert capture["project_state_broadcast_calls"] == 0
                assert len(capture["app_definition_patch_calls"]) == 1
                patch = capture["app_definition_patch_calls"][0]
                assert patch["previousProjectStateRevision"] < patch[
                    "projectStateRevision"
                ]

    async def test_update_app_definition_rejects_unknown_component(self) -> None:
        async with real_project_manager() as fixture:
            initial = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            await fixture.manager.set_app_definition(
                SetAppDefinitionRequest(appSpec=initial)
            )

            with pytest.raises(ValueError, match="unknown component"):
                await fixture.manager.update_app_definition(
                    UpdateAppDefinitionRequest(patch={"root": {"type": "Nope"}})
                )

    async def test_validate_app_definition_returns_capabilities(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            response = await fixture.manager.validate_app_definition(
                ValidateAppDefinitionRequest(appSpec=payload)
            )

        assert response.errors == []
        assert response.capabilities.catalogId == "setta.app.default"
        assert response.capabilities.catalogVersion == "v1"
        assert response.capabilities.appSpecVersion
        assert response.capabilities.themeSchemaVersion
        assert response.capabilities.features.get("responsive") is True
        assert response.capabilities.features.get("motion") is True
        assert response.capabilities.features.get("typography") is True
        assert response.capabilities.features.get("typographyScale") is True
        assert response.capabilities.features.get("shadows") is True
        assert response.capabilities.features.get("componentTokens") is True

    async def test_validate_app_definition_reports_unknown_component(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "UnknownComponent"},
                "elements": {},
            }
            response = await fixture.manager.validate_app_definition(
                ValidateAppDefinitionRequest(appSpec=payload)
            )

        assert response.errors
        assert "unknown component" in response.errors[0].message.lower()

    async def test_validate_app_definition_reports_theme_errors(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            response = await fixture.manager.validate_app_definition(
                ValidateAppDefinitionRequest(
                    appSpec=payload,
                    theme={"motion": "nope"},
                )
            )

        assert response.errors
        assert any("theme.motion" in issue.message for issue in response.errors)

    async def test_validate_app_definition_warns_on_run_missing_section_id(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {
                    "key": "run-btn",
                    "type": "ActionButton",
                    "props": {"label": "Run", "action": "run"},
                },
                "elements": {},
            }
            response = await fixture.manager.validate_app_definition(
                ValidateAppDefinitionRequest(appSpec=payload)
            )

        assert response.errors == []
        assert any("missing sectionId" in w.message for w in response.warnings)
        assert any(w.elementKey == "run-btn" for w in response.warnings)

    async def test_validate_app_definition_warns_on_ignored_theme_vars(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            response = await fixture.manager.validate_app_definition(
                ValidateAppDefinitionRequest(
                    appSpec=payload,
                    theme={"vars": {"accent": "#fff", "--app-accent": "#fff"}},
                )
            )

        assert response.errors == []
        assert any("theme.vars" in w.message for w in response.warnings)
        assert any("accent" in w.message for w in response.warnings)

    async def test_validate_app_definition_warns_on_external_assets(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {"key": "root", "type": "Stack"},
                "elements": {},
            }
            response = await fixture.manager.validate_app_definition(
                ValidateAppDefinitionRequest(
                    appSpec=payload,
                    assets=[{"rel": "stylesheet", "href": "https://example.com/app.css"}],
                )
            )

        assert response.errors == []
        assert any("external urls" in w.message.lower() for w in response.warnings)

    async def test_validate_app_definition_accumulates_multiple_errors(self) -> None:
        async with real_project_manager() as fixture:
            payload = {
                "root": {
                    "key": "root",
                    "type": "Stack",
                    "props": {"unknown": "nope"},
                    "children": [
                        # Child reference is missing.
                        "missing-child",
                        # Missing required configId.
                        {"key": "scope", "type": "ConfigScope", "children": []},
                        # Childless component has children.
                        {
                            "key": "heading",
                            "type": "Heading",
                            "props": {"text": "Hello"},
                            "children": [],
                        },
                    ],
                },
                "elements": {},
            }
            response = await fixture.manager.validate_app_definition(
                ValidateAppDefinitionRequest(appSpec=payload)
            )

        assert len(response.errors) >= 3
