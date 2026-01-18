import json
import unittest
from contextlib import AsyncExitStack
from typing import TYPE_CHECKING

from setta.code_gen.utils import GEN_CODE_INSTANCE_NAME, sanitize_name
from setta.project_state.project_manager_types import (
    AcceptRenameRefactorRequest,
    DeclineRenameRefactorRequest,
    SetParamEnteredValueRequest,
    SetProjectConfigCodegenTargetsRequest,
    SetSectionNameRequest,
)
from setta.types.code_obj_impls import BaseChildlessCodeObjImpl
from setta.types.helpers_lvl1 import get_curr_effective_code_obj_impl_with_type_guard
from setta.types.helpers_lvl2 import get_curr_top_level_param_ids
from setta.types.id import ID
from setta.types.project_config import ProjectCodegenPythonTarget
from setta.types.settings_state import RenameRefactorMode
from setta.types.websocket import (
    WebsocketConnectionInfoWithSocket,
    WebsocketConnectionType,
)
from starlette.types import Message, Scope
from starlette.websockets import WebSocket

from tests.utils.manager_fixture import real_settings_manager

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateSingleConfig


class RenameRefactorBroadcastTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._exit_stack = AsyncExitStack()
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self.manager = fixture.manager
        self.websocket_manager = fixture.websocket_manager
        project_config_id = self.manager.project_state_backend.defaultProjectConfigId
        if not project_config_id:
            self.fail("Expected default project config id for rename test.")
        self.project_config_id: ID = project_config_id

        await self.manager.set_project_config_codegen_targets(
            SetProjectConfigCodegenTargetsRequest(
                projectConfigId=self.project_config_id,
                codegenTargets=[ProjectCodegenPythonTarget()],
            )
        )
        self.project_state = await self.manager.load_project_config(
            self.project_config_id
        )
        self.manager.completed_op_ids_since_last_broadcast.clear()

        self.websocket_id = "rename-refactor-test-socket"
        self._sent_messages: list[Message] = []

        self._receive_counter = 0

        async def _receive() -> Message:
            if self._receive_counter == 0:
                self._receive_counter += 1
                return {"type": "websocket.connect"}
            return {"type": "websocket.receive"}

        async def _send(message: Message) -> None:
            self._sent_messages.append(message)

        scope: Scope = {
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

    def _find_section_param_with_childless_impl(
        self, state: "ProjectStateSingleConfig"
    ) -> tuple[ID, ID, str]:
        for section_id, section_core in state.sections.items():
            try:
                param_ids = get_curr_top_level_param_ids(state, section_id)
            except (TypeError, ValueError):
                continue
            for param_id in param_ids:
                try:
                    get_curr_effective_code_obj_impl_with_type_guard(
                        state,
                        section_id,
                        param_id,
                        BaseChildlessCodeObjImpl,
                    )
                except (TypeError, ValueError):
                    continue
                return section_id, param_id, section_core.name
        self.fail(
            "Expected to locate a section parameter pair with a childless implementation."
        )

    async def test_broadcasts_payload_for_always_ask(self):
        backend_settings = self.manager.settings_file.settings.backend
        previous_mode = backend_settings.renameRefactorMode
        backend_settings.renameRefactorMode = RenameRefactorMode.ALWAYS_ASK
        cleanup_section_id: ID | None = None
        cleanup_param_id: ID | None = None
        original_param_value: str | None = None
        try:
            state_before = await self.manager.load_project_config(
                self.project_config_id
            )
            section_id, param_id, current_name = (
                self._find_section_param_with_childless_impl(state_before)
            )
            cleanup_section_id = section_id
            cleanup_param_id = param_id
            impl_before = get_curr_effective_code_obj_impl_with_type_guard(
                state_before,
                section_id,
                param_id,
                BaseChildlessCodeObjImpl,
            )
            self.assertIsInstance(impl_before.value, str)
            original_param_value = impl_before.value

            old_token = f"{GEN_CODE_INSTANCE_NAME}.{sanitize_name(current_name)}"
            await self.manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    frontendOpId="set-param-always-ask",
                    projectConfigId=self.project_config_id,
                    sectionId=section_id,
                    paramInfoId=param_id,
                    value=old_token,
                )
            )

            new_name = f"{current_name}_renamed"
            frontend_op_id = "rename-op-always-ask"
            prev_message_count = len(self._sent_messages)
            await self.manager.set_section_name(
                SetSectionNameRequest(
                    frontendOpId=frontend_op_id,
                    projectConfigId=self.project_config_id,
                    sectionId=section_id,
                    name=new_name,
                )
            )

            self.assertIn(
                frontend_op_id,
                self.manager.pending_rename_results,
                "Rename prompt should enqueue a pending entry.",
            )

            rename_payloads: list[dict] = []
            for message in self._sent_messages[prev_message_count:]:
                if message.get("type") != "websocket.send" or "text" not in message:
                    continue
                payload = json.loads(message["text"])
                if payload.get("messageType") == "ReturnRenameRefactorResults":
                    rename_payloads.append(payload)

            self.assertTrue(
                rename_payloads,
                "Expected rename refactor results broadcast for ALWAYS_ASK mode.",
            )
            content = rename_payloads[-1]["content"]

            self.assertEqual(content["projectConfigId"], self.project_config_id)
            self.assertEqual(content["frontendOpId"], frontend_op_id)
            self.assertEqual(content["renameMode"], "ALWAYS_ASK")
            self.assertIn("changedNodeValues", content)
            self.assertIsInstance(content["changedNodeValues"], list)
            self.assertTrue(
                content["changedNodeValues"],
                "Expected at least one changed node value in broadcast payload.",
            )
            first_value = content["changedNodeValues"][0]
            self.assertIn("sectionId", first_value["depKey"])
            self.assertIn("newValue", first_value)
            self.assertIn(
                sanitize_name(new_name),
                first_value["newValue"],
                "Expected updated value to reference the sanitized new section name.",
            )

            await self.manager.decline_rename_refactor(
                DeclineRenameRefactorRequest(
                    frontendOpId=frontend_op_id,
                    projectConfigId=self.project_config_id,
                )
            )
            backend_settings.renameRefactorMode = RenameRefactorMode.NEVER_RENAME
            await self.manager.set_section_name(
                SetSectionNameRequest(
                    frontendOpId=f"{frontend_op_id}-cleanup",
                    projectConfigId=self.project_config_id,
                    sectionId=section_id,
                    name=current_name,
                )
            )
        finally:
            backend_settings.renameRefactorMode = previous_mode
            if (
                cleanup_section_id is not None
                and cleanup_param_id is not None
                and original_param_value is not None
            ):
                await self.manager.set_param_entered_value(
                    SetParamEnteredValueRequest(
                        frontendOpId="set-param-reset-always-ask",
                        projectConfigId=self.project_config_id,
                        sectionId=cleanup_section_id,
                        paramInfoId=cleanup_param_id,
                        value=original_param_value,
                    )
                )

    async def test_accept_rename_refactor_applies_pending_changes(self):
        backend_settings = self.manager.settings_file.settings.backend
        previous_mode = backend_settings.renameRefactorMode
        backend_settings.renameRefactorMode = RenameRefactorMode.ALWAYS_ASK
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
                except (TypeError, ValueError):
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
                    "Expected section and parameter ids to exercise rename acceptance."
                )

            old_token = f"{GEN_CODE_INSTANCE_NAME}.{sanitize_name(original_name)}"
            await self.manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    frontendOpId="set-param-accept",
                    projectConfigId=self.project_config_id,
                    sectionId=target_section_id,
                    paramInfoId=target_param_id,
                    value=old_token,
                )
            )

            new_name = f"{original_name}_accept"
            await self.manager.set_section_name(
                SetSectionNameRequest(
                    frontendOpId="rename-op-accept",
                    projectConfigId=self.project_config_id,
                    sectionId=target_section_id,
                    name=new_name,
                )
            )

            self.assertIn(
                "rename-op-accept",
                self.manager.pending_rename_results,
                "Rename acceptance should create a pending entry.",
            )
            pending_project_config_id, pending_values = (
                self.manager.pending_rename_results["rename-op-accept"]
            )
            self.assertEqual(
                pending_project_config_id,
                self.project_config_id,
                "Pending rename result should be keyed by the target project config.",
            )
            self.assertTrue(
                pending_values,
                "Pending rename result should describe at least one changed node value.",
            )

            state_mid = await self.manager.load_project_config(self.project_config_id)
            impl_mid = get_curr_effective_code_obj_impl_with_type_guard(
                state_mid,
                target_section_id,
                target_param_id,
                BaseChildlessCodeObjImpl,
            )
            self.assertIsInstance(impl_mid.value, str)
            self.assertEqual(
                impl_mid.value,
                old_token,
                "Values should remain unchanged before accepting the rename.",
            )

            await self.manager.accept_rename_refactor(
                AcceptRenameRefactorRequest(
                    frontendOpId="rename-op-accept",
                    projectConfigId=self.project_config_id,
                )
            )

            self.assertNotIn(
                "rename-op-accept",
                self.manager.pending_rename_results,
                "Acceptance should clear the pending entry.",
            )

            state_after = await self.manager.load_project_config(self.project_config_id)
            impl_after = get_curr_effective_code_obj_impl_with_type_guard(
                state_after,
                target_section_id,
                target_param_id,
                BaseChildlessCodeObjImpl,
            )
            self.assertIsInstance(impl_after.value, str)
            self.assertEqual(
                impl_after.value,
                f"{GEN_CODE_INSTANCE_NAME}.{sanitize_name(new_name)}",
                "Acceptance should update dependent values to the renamed token.",
            )
        finally:
            backend_settings.renameRefactorMode = previous_mode

    async def test_decline_rename_refactor_clears_pending_entry(self):
        backend_settings = self.manager.settings_file.settings.backend
        previous_mode = backend_settings.renameRefactorMode
        backend_settings.renameRefactorMode = RenameRefactorMode.ALWAYS_ASK
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
                    "Expected section and parameter ids to exercise rename decline."
                )

            old_token = f"{GEN_CODE_INSTANCE_NAME}.{sanitize_name(original_name)}"
            await self.manager.set_param_entered_value(
                SetParamEnteredValueRequest(
                    frontendOpId="set-param-decline",
                    projectConfigId=self.project_config_id,
                    sectionId=target_section_id,
                    paramInfoId=target_param_id,
                    value=old_token,
                )
            )

            new_name = f"{original_name}_decline"
            await self.manager.set_section_name(
                SetSectionNameRequest(
                    frontendOpId="rename-op-decline",
                    projectConfigId=self.project_config_id,
                    sectionId=target_section_id,
                    name=new_name,
                )
            )

            self.assertIn(
                "rename-op-decline",
                self.manager.pending_rename_results,
                "Decline should enqueue a pending rename result.",
            )
            pending_project_config_id, pending_values = (
                self.manager.pending_rename_results["rename-op-decline"]
            )
            self.assertEqual(
                pending_project_config_id,
                self.project_config_id,
                "Pending rename decline entry should match the request project config.",
            )
            self.assertTrue(
                pending_values,
                "Pending rename decline entry should describe at least one changed node value.",
            )

            state_mid = await self.manager.load_project_config(self.project_config_id)
            impl_mid = get_curr_effective_code_obj_impl_with_type_guard(
                state_mid,
                target_section_id,
                target_param_id,
                BaseChildlessCodeObjImpl,
            )
            self.assertIsInstance(impl_mid.value, str)
            self.assertEqual(
                impl_mid.value,
                old_token,
                "Values should remain unchanged before declining the rename.",
            )

            await self.manager.decline_rename_refactor(
                DeclineRenameRefactorRequest(
                    frontendOpId="rename-op-decline",
                    projectConfigId=self.project_config_id,
                )
            )

            self.assertNotIn(
                "rename-op-decline",
                self.manager.pending_rename_results,
                "Decline should clear the pending entry.",
            )

            state_after = await self.manager.load_project_config(self.project_config_id)
            impl_after = get_curr_effective_code_obj_impl_with_type_guard(
                state_after,
                target_section_id,
                target_param_id,
                BaseChildlessCodeObjImpl,
            )
            self.assertIsInstance(impl_after.value, str)
            self.assertEqual(
                impl_after.value,
                old_token,
                "Decline should not apply rename-related changes.",
            )
        finally:
            backend_settings.renameRefactorMode = previous_mode

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

            old_token = f"{GEN_CODE_INSTANCE_NAME}.{sanitize_name(original_name)}"
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
            rename_broadcasts = [
                message
                for message in self._sent_messages
                if message.get("type") == "websocket.send"
                and "text" in message
                and json.loads(message["text"])["messageType"]
                == "ReturnRenameRefactorResults"
            ]
            self.assertFalse(
                rename_broadcasts,
                "Auto-rename mode should not broadcast rename prompts.",
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
                f"{GEN_CODE_INSTANCE_NAME}.{sanitize_name(new_name)}",
                "Auto-rename should update dependent parameter value to the new token.",
            )
        finally:
            backend_settings.renameRefactorMode = previous_mode
