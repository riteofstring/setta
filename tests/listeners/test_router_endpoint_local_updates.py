import unittest
from ast import literal_eval

from setta.listeners.router_endpoint_local_updates import (
    build_local_router_endpoint_updates,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.dependency_key import SectionDependencyKey
from setta.types.dependency_value import LiteralDependencyValue
from setta.types.id import ID
from setta.types.section_impls import ChatSectionState


class RouterEndpointLocalUpdateTests(unittest.TestCase):
    def test_builds_chat_section_update_payload(self) -> None:
        section_id = ID("section-chat")
        state = ChatSectionState(
            messages=[
                UserChatMessage(
                    id=ID("msg-1"),
                    content=[MessageTextContent(text="hi")],
                )
            ],
            inputText="",
            waitingForResponse=False,
            toolCallArguments={"tool-1": "{}"},
        )

        updates = build_local_router_endpoint_updates(
            endpoint_name="route_set_chat_section_state",
            payload={"sectionId": section_id, "state": state},
        )

        self.assertEqual(1, len(updates))
        update = updates[0]
        self.assertEqual(
            SectionDependencyKey(sectionId=section_id),
            update.dependency_key,
        )
        self.assertIsInstance(update.value, LiteralDependencyValue)
        parsed = ChatSectionState.model_validate(literal_eval(update.value.payload))
        self.assertEqual(state.messages, parsed.messages)
        self.assertEqual(state.toolCallArguments, parsed.toolCallArguments)

    def test_ignores_unrelated_endpoints(self) -> None:
        updates = build_local_router_endpoint_updates(
            endpoint_name="route_set_text_block_text",
            payload={"sectionId": ID("text-1"), "text": "hi"},
        )
        self.assertEqual([], updates)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
