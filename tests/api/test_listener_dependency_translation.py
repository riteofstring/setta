import pytest

from setta.api.listener import SettaListener
from setta.types.id import ID
from setta.types.listener import (
    ListenerDependencyCatalogEntry,
    PythonScriptWebsocketMsgTypeAdapter,
    WebsocketMsgListenerRegister,
)
from setta.types.protocol import create_dep_key
from tests.helpers.listener_runtime_state import (
    build_listener_runtime_state_from_entries,
)


def _build_runtime_state_with_duplicate_names():
    group_id = ID("section-group")
    first_child_id = ID("section-child-1")
    second_child_id = ID("section-child-2")
    return build_listener_runtime_state_from_entries(
        [
            ListenerDependencyCatalogEntry(
                dependencyKey=create_dep_key(sectionId=group_id),
                name="Settings Group",
                fullPathName="Settings_Group",
                sectionType="Group",
            ),
            ListenerDependencyCatalogEntry(
                dependencyKey=create_dep_key(sectionId=first_child_id),
                name="Data Source",
                fullPathName="Settings_Group__Data_Source",
                sectionType="TextBlock",
            ),
            ListenerDependencyCatalogEntry(
                dependencyKey=create_dep_key(sectionId=second_child_id),
                name="Data-Source",
                fullPathName="Settings_Group__Data_Source_2",
                sectionType="TextBlock",
            ),
        ]
    )


class TestSettaListenerDependencyTranslation:
    @pytest.fixture(autouse=True)
    def _setup(self) -> None:
        self.project_config_id = ID("project-listener")
        self.runtime_state = _build_runtime_state_with_duplicate_names()

    def _create_listener(self) -> SettaListener:
        listener = SettaListener(
            project_name="Listener Project",
        )
        listener._project_config_id = self.project_config_id
        listener._runtime_state = self.runtime_state
        return listener

    @pytest.mark.asyncio
    async def test_sanitized_name_round_trip_maps_back_to_dep_key(self) -> None:
        listener = self._create_listener()
        sent_payloads: list[str] = []
        sanitized_child = "Settings_Group__Data_Source"
        original_dep_key = self.runtime_state.dependency_metadata.dependency_key(
            sanitized_child
        )

        @listener.listen(deps=(sanitized_child,))
        def _callback(_state, _ctx):
            return None

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture

        # String deps should still resolve through the real register message,
        # not just through a helper-local serialization path.
        await listener._send_listener_register()

        assert len(sent_payloads) == 1
        register_message = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            sent_payloads[0]
        )
        assert isinstance(register_message, WebsocketMsgListenerRegister)
        callback_payload = next(iter(register_message.content.callbacks.values()))
        dependency = callback_payload.dependencies[0]

        assert dependency == original_dep_key
        assert (
            self.runtime_state.dependency_metadata.dependency_name(original_dep_key)
            == sanitized_child
        )

        spec = next(iter(listener._callbacks.values()))
        assert spec.structured_dependencies[0] == dependency

    @pytest.mark.asyncio
    async def test_duplicate_sanitized_names_translate_to_distinct_dependencies(
        self,
    ) -> None:
        listener = self._create_listener()
        sent_payloads: list[str] = []
        sanitized_names = sorted(self.runtime_state.dependency_metadata.names())
        assert sanitized_names == [
            "Settings_Group",
            "Settings_Group__Data_Source",
            "Settings_Group__Data_Source_2",
        ]

        @listener.listen(deps=tuple(sanitized_names[1:]))
        def _callback(_state, _ctx):
            return None

        async def capture(payload: str) -> None:
            sent_payloads.append(payload)

        listener._send_websocket_payload = capture
        await listener._send_listener_register()

        assert len(sent_payloads) == 1
        register_message = PythonScriptWebsocketMsgTypeAdapter.validate_json(
            sent_payloads[0]
        )
        assert isinstance(register_message, WebsocketMsgListenerRegister)
        callback_payload = next(iter(register_message.content.callbacks.values()))
        dependencies = callback_payload.dependencies

        assert len(dependencies) == 2
        assert dependencies[0] != dependencies[1]

        mapped_names = [
            self.runtime_state.dependency_metadata.dependency_name(dependency)
            for dependency in dependencies
        ]

        assert mapped_names == sanitized_names[1:]
