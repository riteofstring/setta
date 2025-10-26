import json
import unittest
from contextlib import AsyncExitStack

from setta.code_gen.utils import sanitize_name
from setta.project_state.project_manager_types import (
    SetParamEnteredValueRequest,
    SetSectionNameRequest,
)
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.helpers_lvl1 import get_curr_effective_code_obj_impl_with_type_guard
from setta.types.helpers_lvl2 import get_curr_top_level_param_ids
from setta.types.settings_state import RenameRefactorMode
from setta.types.websocket import (
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
)
from starlette.websockets import WebSocket

from tests.utils.manager_fixture import real_settings_manager


class RenameRefactorBroadcastTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._exit_stack = AsyncExitStack()
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self.manager = fixture.manager
        self.websocket_manager = fixture.websocket_manager
        self.project_config_id = (
            self.manager.project_state_backend.defaultProjectConfigId
        )
        if not self.project_config_id:
            self.fail("Expected default project config id for rename test.")

        self.project_state = await self.manager.load_project_config(
            self.project_config_id
        )
        self.manager.completed_op_ids_since_last_broadcast.clear()

        self.websocket_id = "rename-refactor-test-socket"
        self._sent_messages: list[dict] = []

        self._receive_counter = 0

        async def _receive():
            if self._receive_counter == 0:
                self._receive_counter += 1
                return {"type": "websocket.connect"}
            return {"type": "websocket.receive"}

        async def _send(message: dict):
            self._sent_messages.append(message)

        scope = {
            "type": "websocket",
            "asgi": {"version": "3.0"},
            "scheme": "ws",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "headers": [],
            "client": ("testclient", 0),
            "server": ("testserver", 80),
            "subprotocols": [],
        }
        self._websocket = WebSocket(scope=scope, receive=_receive, send=_send)
        await self._websocket.accept()
        self.websocket_manager.sockets[self.websocket_id] = (
            WebsocketConnectionInfoWithSocket(
                id=self.websocket_id,
                connectionType=WebsocketConnectionType.FRONTEND,
                currentAddress=None,
                websocket=self._websocket,
            )
        )

    async def asyncTearDown(self):
        self.websocket_manager.sockets.pop(self.websocket_id, None)
        await self._exit_stack.aclose()

    async def test_broadcasts_payload_for_always_ask(self):
        section_ids = list(self.project_state.projectConfig.topLevelSections.keys())
        self.assertTrue(
            section_ids, "Expected at least one section to trigger rename broadcast."
        )
        section_id = section_ids[0]
        current_name = self.manager.project_state_backend.sections[section_id].name
        new_name = f"{current_name}_renamed"

        request = SetSectionNameRequest(
            frontendOpId="rename-op-1",
            projectConfigId=self.project_config_id,
            sectionId=section_id,
            name=new_name,
        )
        await self.manager.set_section_name(request)

        self.assertIn("rename-op-1", self.manager.pending_rename_results)
        texts = [
            message["text"]
            for message in self._sent_messages
            if message["type"] == "websocket.send" and "text" in message
        ]
        parsed_messages = [json.loads(text) for text in texts]
        rename_payloads = [
            message
            for message in parsed_messages
            if message["messageType"] == "ReturnRenameRefactorResults"
        ]
        self.assertEqual(
            len(rename_payloads),
            1,
            f"Expected exactly one rename broadcast, found {len(rename_payloads)}.",
        )
        content = rename_payloads[0]["content"]

        self.assertEqual(content["projectConfigId"], self.project_config_id)
        self.assertEqual(content["frontendOpId"], "rename-op-1")
        self.assertEqual(content["renameMode"], "ALWAYS_ASK")
        self.assertTrue(
            content["renamedNodes"],
            "Expected at least one renamed node in broadcast payload.",
        )
        section_entries = [
            node
            for node in content["renamedNodes"]
            if node["sectionId"] == section_id and node["paramInfoId"] is None
        ]
        self.assertTrue(
            section_entries,
            "Expected broadcast to include the renamed section entry.",
        )
        section_change = section_entries[0]
        self.assertIn(
            sanitize_name(current_name),
            section_change["oldFullPathName"],
        )
        self.assertIn("renamed", section_change["newFullPathName"])
        self.assertIn("changedNodeValues", content)
        self.assertIsInstance(content["changedNodeValues"], list)
        if content["changedNodeValues"]:
            first_value = content["changedNodeValues"][0]
            self.assertIn("sectionId", first_value)
            self.assertIn("newValue", first_value)

    async def test_auto_applies_changes_for_always_rename(self):
        backend_settings = self.manager.settings_file.settings.backend
        previous_mode = backend_settings.renameRefactorMode
        try:
            state_before = await self.manager.load_project_config(
                self.project_config_id
            )
            target_section_id = None
            target_param_id = None
            original_name = None

            for section_id, section_core in state_before.sections.items():
                try:
                    param_ids = get_curr_top_level_param_ids(state_before, section_id)
                except TypeError:
                    continue
                for param_id in param_ids:
                    try:
                        get_curr_effective_code_obj_impl_with_type_guard(
                            state_before,
                            section_id,
                            param_id,
                            BaseChildlessCodeObjImpl,
                        )
                    except (TypeError, ValueError):
                        continue
                    target_section_id = section_id
                    target_param_id = param_id
                    original_name = section_core.name
                    break
                if target_section_id:
                    break

            if (
                target_section_id is None
                or target_param_id is None
                or original_name is None
            ):
                self.fail(
                    "Expected to locate a section/parameter pair for rename auto-apply test."
                )

            old_token = f"s.{sanitize_name(original_name)}"
            await self.manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    frontendOpId="set-param-auto",
                    projectConfigId=self.project_config_id,
                    sectionId=target_section_id,
                    paramInfoId=target_param_id,
                    value=old_token,
                )
            )

            backend_settings.renameRefactorMode = RenameRefactorMode.ALWAYS_RENAME
            new_name = f"{original_name}_auto"
            await self.manager.set_section_name(
                SetSectionNameRequest(
                    frontendOpId="rename-op-auto",
                    projectConfigId=self.project_config_id,
                    sectionId=target_section_id,
                    name=new_name,
                )
            )

            self.assertNotIn(
                "rename-op-auto",
                self.manager.pending_rename_results,
                "Auto-rename should not enqueue pending results.",
            )

            updated_state = await self.manager.load_project_config(
                self.project_config_id
            )
            impl = get_curr_effective_code_obj_impl_with_type_guard(
                updated_state,
                target_section_id,
                target_param_id,
                BaseChildlessCodeObjImpl,
            )
            self.assertIsInstance(impl.value, str)
            self.assertEqual(
                impl.value,
                f"s.{sanitize_name(new_name)}",
                "Auto-rename should update dependent parameter value to the new token.",
            )
        finally:
            backend_settings.renameRefactorMode = previous_mode
