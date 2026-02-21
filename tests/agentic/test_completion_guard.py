from setta.agentic.completion_guard import (
    FAILED_CHECKS_MESSAGE,
    INCONSISTENT_COMPLETION_INTENT_MESSAGE,
    MISSING_CHECKS_MESSAGE,
    apply_completion_guard,
    load_completion_guard_enabled,
)
from setta.database.db_objs import DBE
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
    ToolChatMessage,
    UserChatMessage,
)


def _text_message(text: str) -> MessageTextContent:
    return MessageTextContent(text=text)


def _assistant_message(text: str) -> AssistantChatMessage:
    return AssistantChatMessage(content=[_text_message(text)])


def _assistant_message_with_tool_call(text: str) -> AssistantChatMessage:
    return AssistantChatMessage(
        content=[_text_message(text)],
        tool_calls=[
            ToolCall(
                id="tool-call-1",
                function=ToolCallFunction(
                    name="setta__report_completion_status",
                    arguments={},
                ),
            )
        ],
    )


def _user_message(text: str) -> UserChatMessage:
    return UserChatMessage(content=[_text_message(text)])


def _completion_report_tool_message(
    *,
    completion_intent: bool,
    requires_verification: bool,
    check_results: list[dict[str, object]] | None = None,
    wrap_structured_content: bool = True,
    tool_name: str = "setta__report_completion_status",
) -> ToolChatMessage:
    report_payload = {
        "completionIntent": completion_intent,
        "requiresVerification": requires_verification,
        "checkResults": list(check_results or []),
    }
    result_payload: dict[str, object]
    if wrap_structured_content:
        result_payload = {"structuredContent": report_payload}
    else:
        result_payload = report_payload
    return ToolChatMessage(
        tool_call_id="tool-report",
        tool_name=tool_name,
        result=result_payload,
    )


def _assistant_text(message: AssistantChatMessage) -> str:
    block = message.content[0]
    return block.text if isinstance(block, MessageTextContent) else ""


def test_completion_guard_blocks_completion_claim_when_report_is_missing() -> None:
    prior_messages = [_user_message("Implement task A.")]
    assistant_message = _assistant_message("Task A is done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_keeps_non_completion_text_when_report_is_missing() -> None:
    # Clarification messages should remain unchanged even without a report payload.
    prior_messages = [_user_message("Implement task A.")]
    assistant_message = _assistant_message("I need one clarification before I continue.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "I need one clarification before I continue."


def test_completion_guard_keeps_error_text_when_report_is_missing() -> None:
    # Backend-generated error text should not be masked by completion-guard copy.
    prior_messages = [_user_message("Implement task A.")]
    assistant_message = _assistant_message(
        "[Error] AI request failed. See Backend Logs for details."
    )

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert (
        _assistant_text(assistant_message)
        == "[Error] AI request failed. See Backend Logs for details."
    )


def test_completion_guard_bypasses_when_toggle_is_disabled() -> None:
    prior_messages = [_user_message("Implement task A.")]
    assistant_message = _assistant_message("Task A is done.")

    replacement = apply_completion_guard(
        prior_messages,
        assistant_message,
        completion_guard_enabled=False,
    )

    assert replacement is None
    assert _assistant_text(assistant_message) == "Task A is done."


def test_completion_guard_blocks_when_required_check_fails() -> None:
    prior_messages = [
        _user_message("Implement task A."),
        _completion_report_tool_message(
            completion_intent=True,
            requires_verification=True,
            check_results=[
                {"checkName": "pytest", "required": True, "status": "failed"},
            ],
        ),
    ]
    assistant_message = _assistant_message("Task A is done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == FAILED_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == FAILED_CHECKS_MESSAGE


def test_completion_guard_blocks_when_required_checks_not_run() -> None:
    prior_messages = [
        _user_message("Implement task A."),
        _completion_report_tool_message(
            completion_intent=True,
            requires_verification=True,
            check_results=[
                {"checkName": "pytest", "required": True, "status": "not_run"},
            ],
        ),
    ]
    assistant_message = _assistant_message("Task A is done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_allows_passing_required_checks() -> None:
    prior_messages = [
        _user_message("Implement task A."),
        _completion_report_tool_message(
            completion_intent=True,
            requires_verification=True,
            check_results=[
                {"checkName": "pytest", "required": True, "status": "passed"},
                {"checkName": "ruff", "required": True, "status": "passed"},
            ],
        ),
    ]
    assistant_message = _assistant_message("Task A is done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Task A is done."


def test_completion_guard_allows_when_report_says_not_completion_intent() -> None:
    prior_messages = [
        _user_message("Investigate bug B."),
        _completion_report_tool_message(
            completion_intent=False,
            requires_verification=False,
        ),
    ]
    assistant_message = _assistant_message("I need one clarification.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "I need one clarification."


def test_completion_guard_blocks_when_report_intent_is_false() -> None:
    # Completion claims require a completion-intent report in the active task scope.
    prior_messages = [
        _user_message("Implement task A."),
        _completion_report_tool_message(
            completion_intent=False,
            requires_verification=False,
        ),
    ]
    assistant_message = _assistant_message("Task A is done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == INCONSISTENT_COMPLETION_INTENT_MESSAGE
    assert _assistant_text(assistant_message) == INCONSISTENT_COMPLETION_INTENT_MESSAGE


def test_completion_guard_allows_when_verification_not_required() -> None:
    prior_messages = [
        _user_message("Explain this design."),
        _completion_report_tool_message(
            completion_intent=True,
            requires_verification=False,
        ),
    ]
    assistant_message = _assistant_message("Summary complete.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Summary complete."


def test_completion_guard_uses_only_active_task_scope() -> None:
    prior_messages = [
        _user_message("Implement task A."),
        _completion_report_tool_message(
            completion_intent=True,
            requires_verification=True,
            check_results=[
                {"checkName": "pytest", "required": True, "status": "passed"},
            ],
        ),
        _user_message("Implement task B."),
    ]
    assistant_message = _assistant_message("Task B is done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_requires_fresh_report_after_latest_assistant() -> None:
    # Reports that predate the latest assistant turn are ignored.
    prior_messages = [
        _user_message("Implement task A."),
        _completion_report_tool_message(
            completion_intent=True,
            requires_verification=True,
            check_results=[
                {"checkName": "pytest", "required": True, "status": "passed"},
            ],
        ),
        _assistant_message("I still need one detail from you."),
    ]
    assistant_message = _assistant_message("Task A is complete.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_blocks_completion_text_with_tool_calls_without_report() -> None:
    prior_messages = [_user_message("Implement task A.")]
    assistant_message = _assistant_message_with_tool_call("Task A is done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_uses_same_turn_tool_results_for_completion_claims() -> None:
    prior_messages = [_user_message("Implement task A.")]
    assistant_message = _assistant_message_with_tool_call("Task A is done.")
    same_turn_results = [
        _completion_report_tool_message(
            completion_intent=True,
            requires_verification=True,
            check_results=[
                {"checkName": "pytest", "required": True, "status": "passed"},
            ],
        )
    ]

    replacement = apply_completion_guard(
        prior_messages,
        assistant_message,
        same_turn_tool_results=same_turn_results,
    )

    assert replacement is None
    assert _assistant_text(assistant_message) == "Task A is done."


def test_completion_guard_blocks_when_same_turn_tool_results_fail_checks() -> None:
    prior_messages = [_user_message("Implement task A.")]
    assistant_message = _assistant_message_with_tool_call("Task A is done.")
    same_turn_results = [
        _completion_report_tool_message(
            completion_intent=True,
            requires_verification=True,
            check_results=[
                {"checkName": "pytest", "required": True, "status": "failed"},
            ],
        )
    ]

    replacement = apply_completion_guard(
        prior_messages,
        assistant_message,
        same_turn_tool_results=same_turn_results,
    )

    assert replacement == FAILED_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == FAILED_CHECKS_MESSAGE


def test_completion_guard_accepts_direct_result_payload_and_mcp_prefix() -> None:
    prior_messages = [
        _user_message("Implement task A."),
        _completion_report_tool_message(
            completion_intent=True,
            requires_verification=True,
            check_results=[
                {"checkName": "pytest", "required": True, "status": "passed"},
            ],
            wrap_structured_content=False,
            tool_name="mcp__setta__report_completion_status",
        ),
    ]
    assistant_message = _assistant_message("Task A is done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Task A is done."


def test_completion_guard_blocks_when_completion_report_payload_is_malformed() -> None:
    prior_messages = [
        _user_message("Implement task A."),
        ToolChatMessage(
            tool_call_id="tool-report",
            tool_name="setta__report_completion_status",
            result={
                "structuredContent": {
                    "completionIntent": True,
                    "requiresVerification": True,
                    "checkResults": "invalid",
                }
            },
        ),
    ]
    assistant_message = _assistant_message("Task A is done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_load_completion_guard_enabled_reads_backend_toggle(tmp_path) -> None:
    dbe = DBE(tmp_path / "setta_files")
    dbe.write_json(
        dbe.settings,
        {
            "backend": {
                "completionGuardEnabled": False,
            }
        },
    )

    enabled = load_completion_guard_enabled(dbe)

    assert enabled is False
