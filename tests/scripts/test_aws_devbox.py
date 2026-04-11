import importlib.util
import json
from types import SimpleNamespace
from pathlib import Path
import sys

import pytest


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "aws_devbox.py"
SPEC = importlib.util.spec_from_file_location("aws_devbox_script", SCRIPT_PATH)
assert SPEC is not None
assert SPEC.loader is not None
aws_devbox = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = aws_devbox
SPEC.loader.exec_module(aws_devbox)


def test_parse_terraform_outputs_reads_expected_values() -> None:
    raw_outputs = json.dumps(
        {
            "default_ports": {"value": {"cdp": 9222, "setta": 8000}},
            "discovery_tags": {
                "value": {
                    "ManagedBy": "terraform",
                    "Name": "setta-devbox",
                    "Project": "setta",
                    "Service": "aws-devbox",
                }
            },
            "instance_id": {"value": "i-0123456789abcdef0"},
            "instance_name": {"value": "setta-devbox"},
            "repo_checkout_path": {
                "value": "/home/ubuntu/dev/setta.pixijs-graph"
            },
            "region": {"value": "us-east-1"},
        }
    )

    parsed = aws_devbox.parse_terraform_outputs(raw_outputs)

    assert parsed.region == "us-east-1"
    assert parsed.instance_id == "i-0123456789abcdef0"
    assert parsed.instance_name == "setta-devbox"
    assert parsed.repo_checkout_path == "/home/ubuntu/dev/setta.pixijs-graph"
    assert parsed.discovery_tags["Project"] == "setta"
    assert parsed.default_ports == {"cdp": 9222, "setta": 8000}


def test_build_port_forward_command_uses_ssm_remote_host_document() -> None:
    command = aws_devbox.build_port_forward_command(
        instance_id="i-0123456789abcdef0",
        local_port=9333,
        profile="devbox",
        region="us-east-1",
        remote_host="127.0.0.1",
        remote_port=9222,
    )

    assert command[:6] == [
        "aws",
        "--profile",
        "devbox",
        "--region",
        "us-east-1",
        "ssm",
    ]
    assert "AWS-StartPortForwardingSessionToRemoteHost" in command
    parameters = json.loads(command[-1])
    assert parameters == {
        "host": ["127.0.0.1"],
        "localPortNumber": ["9333"],
        "portNumber": ["9222"],
    }


def test_build_interactive_command_session_uses_interactive_document() -> None:
    command = aws_devbox.build_interactive_command_session(
        instance_id="i-0123456789abcdef0",
        region="us-east-1",
        profile="devbox",
        command="sudo -iu ubuntu bash -lc 'tmux new -As setta'",
    )

    assert command[:6] == [
        "aws",
        "--profile",
        "devbox",
        "--region",
        "us-east-1",
        "ssm",
    ]
    interactive_document = aws_devbox.INTERACTIVE_COMMAND_SSM_DOCUMENT_NAME
    assert interactive_document in command
    parameters = json.loads(command[-1])
    assert parameters == {
        "command": ["sudo -iu ubuntu bash -lc 'tmux new -As setta'"],
    }


def test_select_single_instance_id_rejects_ambiguous_matches() -> None:
    reservations = [
        {"Instances": [{"InstanceId": "i-aaa"}]},
        {"Instances": [{"InstanceId": "i-bbb"}]},
    ]

    with pytest.raises(SystemExit) as exc_info:
        aws_devbox.select_single_instance_id(reservations, "Name=setta-devbox")

    assert "matched multiple instances" in str(exc_info.value)


def test_select_single_instance_id_rejects_empty_discovery() -> None:
    with pytest.raises(SystemExit) as exc_info:
        aws_devbox.select_single_instance_id([], "Name=setta-devbox")

    assert "Could not resolve an EC2 instance" in str(exc_info.value)


def test_format_status_text_includes_ports_and_ssm() -> None:
    payload = aws_devbox.StatusPayload(
        availability_zone="us-east-1a",
        cdp_port=9222,
        instance_id="i-0123456789abcdef0",
        instance_name="setta-devbox",
        private_ip="10.70.1.23",
        public_ip="3.80.10.20",
        repo_checkout_path="/home/ubuntu/dev/setta.pixijs-graph",
        region="us-east-1",
        setta_port=8000,
        ssm_ping_status="online",
        state="running",
    )

    rendered = aws_devbox.format_status_text(payload)

    assert "instance_id: i-0123456789abcdef0" in rendered
    assert "state: running" in rendered
    assert "ssm_ping_status: online" in rendered
    assert "repo_checkout_path: /home/ubuntu/dev/setta.pixijs-graph" in rendered
    assert "default_setta_port: 8000" in rendered
    assert "default_cdp_port: 9222" in rendered


def test_resolve_port_prefers_explicit_then_terraform() -> None:
    tf_outputs = aws_devbox.TerraformOutputs(
        default_ports={"cdp": 9222, "setta": 8000},
        discovery_tags={},
        instance_id=None,
        instance_name=None,
        repo_checkout_path="/home/ubuntu/dev/setta.pixijs-graph",
        region="us-east-1",
    )

    assert aws_devbox.resolve_port(7111, tf_outputs, "setta", 6000) == 7111
    assert aws_devbox.resolve_port(None, tf_outputs, "setta", 6000) == 8000
    assert aws_devbox.resolve_port(None, None, "setta", 6000) == 6000


def test_resolve_profile_prefers_cli_then_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SETTA_AWS_DEVBOX_PROFILE", "env-devbox")
    args = SimpleNamespace(profile="cli-devbox")

    assert aws_devbox.resolve_profile(args) == "cli-devbox"

    args = SimpleNamespace(profile=None)
    assert aws_devbox.resolve_profile(args) == "env-devbox"

    monkeypatch.delenv("SETTA_AWS_DEVBOX_PROFILE")
    monkeypatch.setenv("AWS_PROFILE", "aws-profile-devbox")
    assert aws_devbox.resolve_profile(args) == "aws-profile-devbox"


def test_profile_uses_sso_detects_modern_and_legacy_profile_config(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    config_dir = tmp_path / ".aws"
    config_dir.mkdir(parents=True, exist_ok=True)
    (config_dir / "config").write_text(
        "\n".join(
            [
                "[profile modern-sso]",
                "sso_session = devbox",
                "",
                "[profile legacy-sso]",
                "sso_start_url = https://example.awsapps.com/start",
                "",
                "[profile static-creds]",
                "region = us-east-1",
            ]
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("HOME", str(tmp_path))

    assert aws_devbox.profile_uses_sso("modern-sso") is True
    assert aws_devbox.profile_uses_sso("legacy-sso") is True
    assert aws_devbox.profile_uses_sso("static-creds") is False
    assert aws_devbox.profile_uses_sso("missing") is False


def test_resolve_remote_shell_command_prefers_cli_then_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "SETTA_AWS_DEVBOX_REMOTE_COMMAND",
        "sudo -iu ubuntu bash -lc 'echo env'",
    )
    args = SimpleNamespace(command="sudo -iu ubuntu bash -lc 'echo cli'")

    assert (
        aws_devbox.resolve_remote_shell_command(args)
        == "sudo -iu ubuntu bash -lc 'echo cli'"
    )

    args = SimpleNamespace(command=None)
    assert (
        aws_devbox.resolve_remote_shell_command(args)
        == "sudo -iu ubuntu bash -lc 'echo env'"
    )


def test_select_port_forward_session_ids_filters_by_instance_and_owner() -> None:
    sessions = [
        {
            "DocumentName": aws_devbox.PORT_FORWARD_SSM_DOCUMENT_NAME,
            "Owner": "arn:aws:sts::123:assumed-role/devbox/me",
            "SessionId": "session-1",
            "Target": "i-devbox",
        },
        {
            "DocumentName": aws_devbox.PORT_FORWARD_SSM_DOCUMENT_NAME,
            "Owner": "arn:aws:sts::123:assumed-role/devbox/other",
            "SessionId": "session-2",
            "Target": "i-devbox",
        },
        {
            "DocumentName": "AWS-StartInteractiveCommand",
            "Owner": "arn:aws:sts::123:assumed-role/devbox/me",
            "SessionId": "session-3",
            "Target": "i-devbox",
        },
        {
            "DocumentName": aws_devbox.PORT_FORWARD_SSM_DOCUMENT_NAME,
            "Owner": "arn:aws:sts::123:assumed-role/devbox/me",
            "SessionId": "session-4",
            "Target": "i-other",
        },
    ]

    assert aws_devbox.select_port_forward_session_ids(
        sessions,
        instance_id="i-devbox",
        owner_arn="arn:aws:sts::123:assumed-role/devbox/me",
    ) == ["session-1"]

    assert aws_devbox.select_port_forward_session_ids(
        sessions,
        instance_id="i-devbox",
        owner_arn=None,
    ) == ["session-1", "session-2"]


def test_format_aws_auth_error_mentions_profile_login_for_missing_credentials() -> None:
    from botocore.exceptions import NoCredentialsError

    message = aws_devbox.format_aws_auth_error(
        NoCredentialsError(),
        "setta-admin",
    )

    assert message is not None
    assert "aws sso login --profile setta-admin" in message


def test_format_aws_auth_error_mentions_env_file_when_profile_is_unknown() -> None:
    from botocore.exceptions import NoCredentialsError

    message = aws_devbox.format_aws_auth_error(
        NoCredentialsError(),
        None,
    )

    assert message is not None
    assert "infra/aws-devbox/aws-devbox.env" in message


def test_should_attempt_aws_sso_login_requires_sso_profile_and_auth_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from botocore.exceptions import NoCredentialsError

    def always_uses_sso(_: str) -> bool:
        return True

    def fake_which(_: str) -> str:
        return "/usr/bin/aws"

    monkeypatch.setattr(aws_devbox, "profile_uses_sso", always_uses_sso)
    monkeypatch.setattr(aws_devbox.shutil, "which", fake_which)

    assert (
        aws_devbox.should_attempt_aws_sso_login(
            NoCredentialsError(),
            "setta-admin",
        )
        is True
    )

    monkeypatch.setenv("SETTA_AWS_DEVBOX_AUTO_SSO_LOGIN", "0")
    assert (
        aws_devbox.should_attempt_aws_sso_login(
            NoCredentialsError(),
            "setta-admin",
        )
        is False
    )


def test_main_retries_once_after_successful_sso_login(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    def handler(_: object) -> int:
        calls.append("handler")
        if len(calls) == 1:
            from botocore.exceptions import NoCredentialsError

            raise NoCredentialsError()
        return 0

    args = SimpleNamespace(handler=handler)
    monkeypatch.setattr(aws_devbox, "parse_args", lambda: args)
    monkeypatch.setattr(aws_devbox, "resolve_profile", lambda _: "setta-admin")

    def always_retry_sso(_: Exception, __: str | None) -> bool:
        return True

    def successful_login(_: str) -> int:
        return 0

    monkeypatch.setattr(
        aws_devbox,
        "should_attempt_aws_sso_login",
        always_retry_sso,
    )
    monkeypatch.setattr(aws_devbox, "run_aws_sso_login", successful_login)

    assert aws_devbox.main() == 0
    assert calls == ["handler", "handler"]
