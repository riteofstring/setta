from setta.agentic.completion_guard import (
    FAILED_CHECKS_MESSAGE,
    MISSING_CHECKS_MESSAGE,
    apply_completion_guard,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)


def _text_message(text: str) -> MessageTextContent:
    return MessageTextContent(text=text)


def _assistant_message(text: str) -> AssistantChatMessage:
    return AssistantChatMessage(content=[_text_message(text)])


def _user_message(text: str) -> UserChatMessage:
    return UserChatMessage(content=[_text_message(text)])


def _assistant_text(message: AssistantChatMessage) -> str:
    block = message.content[0]
    return block.text if isinstance(block, MessageTextContent) else ""


def test_completion_guard_blocks_done_claim_when_checks_missing() -> None:
    # Creation request + completion claim without verification must be blocked.
    prior_messages = [_user_message("Create a new project and scaffold everything.")]
    assistant_message = _assistant_message("Done. The project is ready.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_blocks_done_claim_when_checks_failed() -> None:
    # Failed checks should force an explicit failure response instead of completion.
    prior_messages = [
        _user_message("Build a new section for this project."),
        _assistant_message("I ran tests and checks failed."),
    ]
    assistant_message = _assistant_message("All done and ready.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == FAILED_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == FAILED_CHECKS_MESSAGE


def test_completion_guard_allows_done_claim_after_passing_checks() -> None:
    # Passing checks satisfy the gate and should preserve the completion claim.
    prior_messages = [
        _user_message("Create a project setup for this repo."),
        _assistant_message("Ran tests and verification passed with no errors."),
    ]
    assistant_message = _assistant_message("Done. Everything is complete.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done. Everything is complete."


def test_completion_guard_allows_common_tool_name_verification_wording() -> None:
    # Explicit pass wording with common check tools should satisfy verification status detection.
    prior_messages = [
        _user_message("Create a project setup for this repo."),
        _assistant_message("Ran pytest and ruff; tests passed."),
    ]
    assistant_message = _assistant_message("Done. Ready to ship.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done. Ready to ship."


def test_completion_guard_does_not_treat_generic_clean_language_as_passed_checks() -> (
    None
):
    # "clean" without explicit pass wording should not satisfy verification.
    prior_messages = [
        _user_message("Create a project setup for this repo."),
        _assistant_message("I can check this and keep it clean."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_ignores_non_creation_conversations() -> None:
    # Non-creation requests are out of scope for this completion gate.
    prior_messages = [_user_message("Explain this function in detail.")]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_ignores_conversational_ready_phrases() -> None:
    # Conversational readiness should not be interpreted as a completion claim.
    prior_messages = [_user_message("Create a new project setup.")]
    assistant_message = _assistant_message("Ready when you are. I can start now.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Ready when you are. I can start now."


def test_completion_guard_keeps_creation_flow_open_across_clarification_turns() -> None:
    # Clarification turns should not close the active creation/scaffold task window.
    prior_messages = [
        _user_message("Create a new project scaffold."),
        _assistant_message("Which language and framework should I use?"),
        _user_message("Python with FastAPI."),
    ]
    assistant_message = _assistant_message("Done. Ready to ship.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_keeps_creation_flow_open_for_how_what_why_clarifications() -> (
    None
):
    # Question-form clarifications should not close an active creation/scaffold task.
    prefixes = ["How", "What", "Why"]
    for prefix in prefixes:
        prior_messages = [
            _user_message("Create a new project scaffold."),
            _assistant_message("Which language and framework should I use?"),
            _user_message(f"{prefix} should we structure the folders?"),
        ]
        assistant_message = _assistant_message("Done. Ready to ship.")

        replacement = apply_completion_guard(prior_messages, assistant_message)

        assert replacement == MISSING_CHECKS_MESSAGE
        assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_keeps_creation_flow_open_for_implement_section_followups() -> (
    None
):
    # Creation continuation phrased as "implement sections" must keep gating active.
    prior_messages = [
        _user_message("Create a new project scaffold."),
        _user_message("Implement the remaining sections."),
    ]
    assistant_message = _assistant_message("Done. Ready to ship.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_ignores_non_scaffolding_implement_app_requests() -> None:
    # Product implementation work should not be treated as project scaffolding.
    prior_messages = [
        _user_message("Implement app settings page and wire it to existing state."),
    ]
    assistant_message = _assistant_message("Done. Ready to ship.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done. Ready to ship."


def test_completion_guard_closes_creation_scope_for_unrelated_question_pivot() -> None:
    # Unrelated question pivots should close prior creation scope.
    prior_messages = [
        _user_message("Create a new project scaffold."),
        _user_message("What time is it in Tokyo?"),
    ]
    assistant_message = _assistant_message("Done. Ready to ship.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done. Ready to ship."


def test_completion_guard_uses_latest_explicit_verification_result() -> None:
    # A newer pass result should override older failed-check text.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("I ran tests and checks failed."),
        _assistant_message("I reran tests and verification passed cleanly."),
    ]
    assistant_message = _assistant_message("Done. Ready to ship.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done. Ready to ship."


def test_completion_guard_prefers_latest_verification_signal_in_single_message() -> (
    None
):
    # Mixed historical wording should resolve using the latest pass/fail signal.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("Tests failed before, but now tests passed cleanly."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_requires_explicit_status_when_latest_done_message_mentions_checks() -> (
    None
):
    # If the current completion message references checks without pass/fail, stale
    # older results must not be reused.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("Ran tests and checks passed."),
    ]
    assistant_message = _assistant_message(
        "Done. I referenced tests but have not rerun checks yet."
    )

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_ignores_non_verification_check_wording_in_done_message() -> (
    None
):
    # Generic "check the docs" prose should not override a prior explicit pass result.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("Ran tests and checks passed."),
    ]
    assistant_message = _assistant_message("Done. Check the docs for details.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done. Check the docs for details."


def test_completion_guard_treats_no_errors_found_as_passed_checks() -> None:
    # "no errors found" must not be misclassified as a failure.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("Verification passed with no errors found."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_treats_negated_failure_phrases_as_passed_checks() -> None:
    # Common "no failed/no failing/without failures" summaries must pass checks.
    pass_phrases = [
        "Ran tests with no failed tests.",
        "No failing checks remained after the rerun.",
        "Verification completed without failures.",
    ]
    for phrase in pass_phrases:
        prior_messages = [
            _user_message("Create a new project setup."),
            _assistant_message(phrase),
        ]
        assistant_message = _assistant_message("Done.")

        replacement = apply_completion_guard(prior_messages, assistant_message)

        assert replacement is None
        assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_treats_zero_failed_and_zero_errors_as_passed_checks() -> (
    None
):
    # Common zero-count summaries should be treated as passing verification.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("pytest: 5 passed, 0 failed in 1.2s"),
        _assistant_message("Ran lint: zero errors found."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_treats_no_error_checks_yet_as_missing() -> None:
    # Negated/incomplete check wording must not be treated as a passing signal.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("I did no error checks yet."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_treats_checks_not_run_with_no_failures_as_missing() -> None:
    # "no failures" must not pass verification when the same sentence says checks were not run.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("Checks were not run yet, no failures."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_treats_not_successfully_run_checks_as_missing() -> None:
    # "did not successfully run tests" must not be classified as a pass.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("I did not successfully run tests."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_keeps_creation_flow_open_for_verification_question_followups() -> (
    None
):
    # Verification follow-up questions should keep creation-flow gating active.
    prior_messages = [
        _user_message("Create a new project structure."),
        _user_message("What tests did you run?"),
    ]
    assistant_message = _assistant_message("All done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE


def test_completion_guard_ignores_older_creation_task_when_latest_user_is_non_creation() -> (
    None
):
    # A newer non-creation request should disable completion gating for old create work.
    prior_messages = [
        _user_message("Create a new project setup."),
        _assistant_message("I ran tests and verification passed cleanly."),
        _user_message("Can you explain what this helper does?"),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_closes_creation_scope_for_refactor_task_switch() -> None:
    # Refactor pivots should close prior creation gating scope.
    prior_messages = [
        _user_message("Create a new project scaffold."),
        _assistant_message("I ran tests and verification passed cleanly."),
        _user_message("Can you refactor the parser for readability?"),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_closes_creation_scope_for_imperative_fix_switch() -> None:
    # Imperative non-creation tasks should close prior creation gating scope.
    prior_messages = [
        _user_message("Create a new project scaffold."),
        _assistant_message("I ran tests and verification passed cleanly."),
        _user_message("Fix this helper function only."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_closes_creation_scope_for_optimize_task_switch() -> None:
    # Optimize pivots should close prior creation gating scope.
    prior_messages = [
        _user_message("Create a new project scaffold."),
        _assistant_message("I ran tests and verification passed cleanly."),
        _user_message("Please optimize the tokenizer hot path."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement is None
    assert _assistant_text(assistant_message) == "Done."


def test_completion_guard_does_not_use_stale_pass_results_from_older_creation_task() -> (
    None
):
    # A stale pass result from an old creation task must not satisfy a new task.
    prior_messages = [
        _user_message("Create the first project setup."),
        _assistant_message("I ran tests and verification passed cleanly."),
        _user_message("Create a second project setup in a new folder."),
    ]
    assistant_message = _assistant_message("Done.")

    replacement = apply_completion_guard(prior_messages, assistant_message)

    assert replacement == MISSING_CHECKS_MESSAGE
    assert _assistant_text(assistant_message) == MISSING_CHECKS_MESSAGE
