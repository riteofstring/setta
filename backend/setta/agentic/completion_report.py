from enum import Enum

from pydantic import BaseModel, Field, field_validator

from setta.mcp.namespacing import SETTA_MCP_SERVER_ID, split_namespaced_tool_name

REPORT_COMPLETION_STATUS_TOOL_NAME = "report_completion_status"


class VerificationStatus(str, Enum):
    passed = "passed"
    failed = "failed"
    missing = "missing"


class CheckStatus(str, Enum):
    passed = "passed"
    failed = "failed"
    not_run = "not_run"


class CheckResult(BaseModel):
    checkName: str
    required: bool = True
    status: CheckStatus
    details: str | None = None
    source: str | None = None

    @field_validator("checkName")
    @classmethod
    def _validate_check_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("checkName must be non-empty")
        return normalized

    @field_validator("details")
    @classmethod
    def _normalize_details(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized if normalized else None

    @field_validator("source")
    @classmethod
    def _normalize_source(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized if normalized else None


class CompletionStatusReportInput(BaseModel):
    taskId: str | None = None
    completionIntent: bool
    requiresVerification: bool
    checkResults: list[CheckResult] = Field(default_factory=list)

    @field_validator("taskId")
    @classmethod
    def _normalize_task_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized if normalized else None


class CompletionStatusReport(BaseModel):
    taskId: str | None = None
    completionIntent: bool
    requiresVerification: bool
    checkResults: list[CheckResult] = Field(default_factory=list)
    verificationStatus: VerificationStatus


def resolve_verification_status(
    *,
    requires_verification: bool,
    check_results: list[CheckResult],
) -> VerificationStatus:
    if not requires_verification:
        return VerificationStatus.passed
    required_checks = [check for check in check_results if check.required]
    if not required_checks:
        return VerificationStatus.missing
    for check in required_checks:
        if check.status == CheckStatus.failed:
            return VerificationStatus.failed
    for check in required_checks:
        if check.status != CheckStatus.passed:
            return VerificationStatus.missing
    return VerificationStatus.passed


def build_completion_status_report(
    *,
    task_id: str | None,
    completion_intent: bool,
    requires_verification: bool,
    check_results: list[CheckResult],
) -> CompletionStatusReport:
    return CompletionStatusReport(
        taskId=task_id,
        completionIntent=completion_intent,
        requiresVerification=requires_verification,
        checkResults=check_results,
        verificationStatus=resolve_verification_status(
            requires_verification=requires_verification,
            check_results=check_results,
        ),
    )


def coerce_completion_status_report(
    payload: object,
) -> CompletionStatusReport | None:
    if not isinstance(payload, dict):
        return None
    if "completionIntent" not in payload or "requiresVerification" not in payload:
        return None
    input_payload = CompletionStatusReportInput.model_validate(payload)
    return build_completion_status_report(
        task_id=input_payload.taskId,
        completion_intent=input_payload.completionIntent,
        requires_verification=input_payload.requiresVerification,
        check_results=input_payload.checkResults,
    )


def is_report_completion_status_tool(tool_name: str | None) -> bool:
    if not isinstance(tool_name, str):
        return False
    normalized = tool_name.strip()
    if not normalized:
        return False
    if normalized.startswith("mcp__"):
        normalized = normalized[len("mcp__") :]
    server_id, tool_basename = split_namespaced_tool_name(normalized)
    if tool_basename != REPORT_COMPLETION_STATUS_TOOL_NAME:
        return False
    return server_id in (None, SETTA_MCP_SERVER_ID)
