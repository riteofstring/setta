import json
import os
import time
from contextlib import AsyncExitStack
from typing import TYPE_CHECKING

import pytest
import pytest_asyncio
from setta.code_gen.utils import GEN_CODE_INSTANCE_NAME, sanitize_name
from setta.lsp.writer import LanguageServerWriter
from setta.project_state.code import PythonCode
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


@pytest.mark.asyncio
class TestRenameRefactorBroadcast:
    def _log_setup(self, message: str) -> None:
        now = time.monotonic()
        if not hasattr(self, "_setup_start"):
            self._setup_start = now
        elapsed = now - self._setup_start
        print(f"[rename_refactor_setup +{elapsed:.3f}s] {message}", flush=True)

    def _wrap_async_method(self, target: object, name: str) -> None:
        original = getattr(target, name)

        def _format_context(args, kwargs) -> str:
            for value in list(args) + list(kwargs.values()):
                project_config_id = getattr(value, "projectConfigId", None)
                if project_config_id:
                    return f" project_config_id={project_config_id}"
            return ""

        async def wrapper(*args, **kwargs):
            start = time.monotonic()
            context = _format_context(args, kwargs)
            self._log_setup(f"{name} start{context}")
            result = await original(*args, **kwargs)
            duration = time.monotonic() - start
            self._log_setup(f"{name} done (+{duration:.3f}s){context}")
            return result

        setattr(target, name, wrapper)
        self._wrapped_methods.append((target, name, original))

    def _wrap_async_class_method(self, cls: type, name: str) -> None:
        original = getattr(cls, name)

        async def wrapper(self_obj, *args, **kwargs):
            start = time.monotonic()
            detail = ""
            if cls is LanguageServerWriter and name == "send_request":
                method = None
                if args:
                    method = args[0]
                if method is None:
                    method = kwargs.get("method")
                if method is not None:
                    detail = f" method={method}"
            if cls is LanguageServerWriter and name == "send_document_open_request":
                filepath = None
                if args:
                    filepath = args[0]
                if filepath is None:
                    filepath = kwargs.get("filepath")
                if filepath is not None:
                    detail = f" filepath={filepath}"
            if cls is PythonCode and name == "sync_lsp":
                detail = f" filepath={self_obj.binding.canonical_path}"
            self._log_setup(f"{cls.__name__}.{name} start{detail}")
            result = await original(self_obj, *args, **kwargs)
            duration = time.monotonic() - start
            self._log_setup(
                f"{cls.__name__}.{name} done (+{duration:.3f}s){detail}"
            )
            return result

        setattr(cls, name, wrapper)
        self._wrapped_class_methods.append((cls, name, original))

    def _install_debug_wrappers(self) -> None:
        self._wrapped_methods = []
        self._wrapped_class_methods = []
        manager_methods = [
            "set_project_config_codegen_targets",
            "load_project_config",
            "maybe_init_project_config",
            "update_and_broadcast_project_state",
            "update",
            "_refresh_codegen_state",
            "_broadcast_project_state_snapshot",
            "_broadcast_name_validation_errors",
            "maybe_do_rename_refactor",
            "set_section_name",
        ]
        for name in manager_methods:
            if hasattr(self.manager, name):
                self._wrap_async_method(self.manager, name)
        self._wrap_async_class_method(PythonCode, "sync_lsp")
        self._wrap_async_class_method(LanguageServerWriter, "send_request")
        self._wrap_async_class_method(
            LanguageServerWriter, "send_document_open_request"
        )

    def _restore_debug_wrappers(self) -> None:
        for target, name, original in getattr(self, "_wrapped_methods", []):
            setattr(target, name, original)
        for cls, name, original in getattr(self, "_wrapped_class_methods", []):
            setattr(cls, name, original)

    @pytest_asyncio.fixture(autouse=True)
    async def _setup(self):
        self._setup_env_prev = os.environ.get("SETTA_TEST_SETUP_LOG")
        os.environ["SETTA_TEST_SETUP_LOG"] = "1"
        self._setup_start = time.monotonic()
        self._log_setup("setup start")
        self._exit_stack = AsyncExitStack()
        self._log_setup("entering real_settings_manager")
        fixture = await self._exit_stack.enter_async_context(real_settings_manager())
        self._log_setup("real_settings_manager entered")
        self.manager = fixture.manager
        self.websocket_manager = fixture.websocket_manager
        self._autosave_prev = self.manager.settings_file.settings.backend.autosave
        self.manager.settings_file.settings.backend.autosave = False
        self._log_setup("installing debug wrappers")
        self._install_debug_wrappers()
        self._log_setup("debug wrappers installed")
        project_config_id = self.manager.project_state_backend.defaultProjectConfigId
        if not project_config_id:
            pytest.fail("Expected default project config id for rename test.")
        self.project_config_id: ID = project_config_id

        self._log_setup("set_project_config_codegen_targets start")
        await self.manager.set_project_config_codegen_targets(
            SetProjectConfigCodegenTargetsRequest(
                projectConfigId=self.project_config_id,
                codegenTargets=[ProjectCodegenPythonTarget()],
            )
        )
        self._log_setup("set_project_config_codegen_targets done")
        self._log_setup("load_project_config start")
        self.project_state = await self.manager.load_project_config(
            self.project_config_id
        )
        self._log_setup("load_project_config done")
        self.manager.completed_op_ids_since_last_broadcast.clear()
        self._log_setup("cleared completed_op_ids_since_last_broadcast")

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
        self._log_setup("websocket accept start")
        await self._websocket.accept()
        self._log_setup("websocket accept done")
        self.websocket_manager.sockets[self.websocket_id] = (
            WebsocketConnectionInfoWithSocket(
                id=self.websocket_id,
                connectionType=WebsocketConnectionType.FRONTEND,
                currentAddress=None,
                websocket=self._websocket,
            )
        )
        self._log_setup("websocket registered")

        self._log_setup("setup complete")
        yield

        self._log_setup("teardown start")
        self._log_setup("restoring debug wrappers")
        self._restore_debug_wrappers()
        self._log_setup("debug wrappers restored")
        self.websocket_manager.sockets.pop(self.websocket_id, None)
        self._log_setup("websocket removed")
        await self._exit_stack.aclose()
        self._log_setup("exit stack closed")
        self.manager.settings_file.settings.backend.autosave = self._autosave_prev
        if self._setup_env_prev is None:
            os.environ.pop("SETTA_TEST_SETUP_LOG", None)
        else:
            os.environ["SETTA_TEST_SETUP_LOG"] = self._setup_env_prev
        self._log_setup("setup env restored")

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
        pytest.fail(
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
            assert isinstance(impl_before.value, str)
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

            assert (
                frontend_op_id in self.manager.pending_rename_results
            ), "Rename prompt should enqueue a pending entry."

            rename_payloads: list[dict] = []
            for message in self._sent_messages[prev_message_count:]:
                if message.get("type") != "websocket.send" or "text" not in message:
                    continue
                payload = json.loads(message["text"])
                if payload.get("messageType") == "ReturnRenameRefactorResults":
                    rename_payloads.append(payload)

            assert rename_payloads, (
                "Expected rename refactor results broadcast for ALWAYS_ASK mode."
            )
            content = rename_payloads[-1]["content"]

            assert content["projectConfigId"] == self.project_config_id
            assert content["frontendOpId"] == frontend_op_id
            assert content["renameMode"] == "ALWAYS_ASK"
            assert "changedNodeValues" in content
            assert isinstance(content["changedNodeValues"], list)
            assert content["changedNodeValues"], (
                "Expected at least one changed node value in broadcast payload."
            )
            first_value = content["changedNodeValues"][0]
            assert "sectionId" in first_value["depKey"]
            assert "newValue" in first_value
            assert sanitize_name(new_name) in first_value["newValue"], (
                "Expected updated value to reference the sanitized new section name."
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
                pytest.fail(
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

            assert (
                "rename-op-accept" in self.manager.pending_rename_results
            ), "Rename acceptance should create a pending entry."
            pending_project_config_id, pending_values = (
                self.manager.pending_rename_results["rename-op-accept"]
            )
            assert pending_project_config_id == self.project_config_id, (
                "Pending rename result should be keyed by the target project config."
            )
            assert pending_values, (
                "Pending rename result should describe at least one changed node value."
            )

            state_mid = await self.manager.load_project_config(self.project_config_id)
            impl_mid = get_curr_effective_code_obj_impl_with_type_guard(
                state_mid,
                target_section_id,
                target_param_id,
                BaseChildlessCodeObjImpl,
            )
            assert isinstance(impl_mid.value, str)
            assert impl_mid.value == old_token, (
                "Values should remain unchanged before accepting the rename."
            )

            await self.manager.accept_rename_refactor(
                AcceptRenameRefactorRequest(
                    frontendOpId="rename-op-accept",
                    projectConfigId=self.project_config_id,
                )
            )

            assert (
                "rename-op-accept" not in self.manager.pending_rename_results
            ), "Acceptance should clear the pending entry."

            state_after = await self.manager.load_project_config(self.project_config_id)
            impl_after = get_curr_effective_code_obj_impl_with_type_guard(
                state_after,
                target_section_id,
                target_param_id,
                BaseChildlessCodeObjImpl,
            )
            assert isinstance(impl_after.value, str)
            assert impl_after.value == (
                f"{GEN_CODE_INSTANCE_NAME}.{sanitize_name(new_name)}"
            ), "Acceptance should update dependent values to the renamed token."
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
                pytest.fail(
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

            assert (
                "rename-op-decline" in self.manager.pending_rename_results
            ), "Decline should enqueue a pending rename result."
            pending_project_config_id, pending_values = (
                self.manager.pending_rename_results["rename-op-decline"]
            )
            assert pending_project_config_id == self.project_config_id, (
                "Pending rename decline entry should match the request project config."
            )
            assert pending_values, (
                "Pending rename decline entry should describe at least one changed node value."
            )

            state_mid = await self.manager.load_project_config(self.project_config_id)
            impl_mid = get_curr_effective_code_obj_impl_with_type_guard(
                state_mid,
                target_section_id,
                target_param_id,
                BaseChildlessCodeObjImpl,
            )
            assert isinstance(impl_mid.value, str)
            assert impl_mid.value == old_token, (
                "Values should remain unchanged before declining the rename."
            )

            await self.manager.decline_rename_refactor(
                DeclineRenameRefactorRequest(
                    frontendOpId="rename-op-decline",
                    projectConfigId=self.project_config_id,
                )
            )

            assert (
                "rename-op-decline" not in self.manager.pending_rename_results
            ), "Decline should clear the pending entry."

            state_after = await self.manager.load_project_config(self.project_config_id)
            impl_after = get_curr_effective_code_obj_impl_with_type_guard(
                state_after,
                target_section_id,
                target_param_id,
                BaseChildlessCodeObjImpl,
            )
            assert isinstance(impl_after.value, str)
            assert impl_after.value == old_token, (
                "Decline should not apply rename-related changes."
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
                pytest.fail(
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

            assert (
                "rename-op-auto" not in self.manager.pending_rename_results
            ), "Auto-rename should not enqueue pending results."
            rename_broadcasts = [
                message
                for message in self._sent_messages
                if message.get("type") == "websocket.send"
                and "text" in message
                and json.loads(message["text"])["messageType"]
                == "ReturnRenameRefactorResults"
            ]
            assert not rename_broadcasts, (
                "Auto-rename mode should not broadcast rename prompts."
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
            assert isinstance(impl.value, str)
            assert impl.value == (
                f"{GEN_CODE_INSTANCE_NAME}.{sanitize_name(new_name)}"
            ), "Auto-rename should update dependent parameter value to the new token."
        finally:
            backend_settings.renameRefactorMode = previous_mode
