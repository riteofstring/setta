from setta.agentic.completion_report import (
    VerificationStatus,
    coerce_completion_status_report,
    is_report_completion_status_tool,
)


def test_coerce_completion_status_report_returns_none_for_invalid_payload() -> None:
    # Invalid schema should fail soft rather than raising during guard evaluation.
    payload = {
        "completionIntent": "yes",
        "requiresVerification": True,
        "checkResults": "not-a-list",
    }

    report = coerce_completion_status_report(payload)

    assert report is None


def test_coerce_completion_status_report_builds_report_for_valid_payload() -> None:
    payload = {
        "completionIntent": True,
        "requiresVerification": True,
        "checkResults": [
            {"checkName": "pytest", "required": True, "status": "passed"},
        ],
    }

    report = coerce_completion_status_report(payload)

    assert report is not None
    assert report.completionIntent is True
    assert report.verificationStatus == VerificationStatus.passed


def test_report_completion_status_tool_requires_setta_namespace() -> None:
    assert is_report_completion_status_tool("setta__report_completion_status")
    assert is_report_completion_status_tool("mcp__setta__report_completion_status")
    assert is_report_completion_status_tool("setta_report_completion_status")
    assert is_report_completion_status_tool("mcp__setta_report_completion_status")
    assert not is_report_completion_status_tool("report_completion_status")
    assert not is_report_completion_status_tool("other__report_completion_status")
