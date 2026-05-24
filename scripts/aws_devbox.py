#!/usr/bin/env python3

import argparse
import json
import shlex
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from aws_devbox_config import (
    DEFAULT_CDP_PORT,
    DEFAULT_REMOTE_HOST,
    DEFAULT_SETTA_PORT,
    DEFAULT_SSM_WAIT_TIMEOUT_SECONDS,
    DEFAULT_TERRAFORM_DIR,
    TerraformOutputs,
    auto_sso_login_enabled,
    build_aws_sso_login_command,
    getenv_nonempty,
    load_terraform_outputs,
    profile_uses_sso,
    resolve_discovery_tags,
    resolve_port,
    resolve_profile,
    resolve_region,
    resolve_remote_shell_command,
    resolve_repo_checkout_path,
    resolve_terraform_dir,
)
INTERACTIVE_COMMAND_SSM_DOCUMENT_NAME = "AWS-StartInteractiveCommand"
PORT_FORWARD_SSM_DOCUMENT_NAME = "AWS-StartPortForwardingSessionToRemoteHost"
RETRYABLE_AWS_AUTH_ERROR_CODES = {
    "AuthFailure",
    "ExpiredToken",
    "ExpiredTokenException",
    "InvalidClientTokenId",
    "UnrecognizedClientException",
}


@dataclass(frozen=True)
class StatusPayload:
    availability_zone: str | None
    cdp_port: int
    instance_id: str
    instance_name: str | None
    private_ip: str | None
    public_ip: str | None
    repo_checkout_path: str | None
    region: str
    setta_port: int
    ssm_ping_status: str
    state: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Operate the AWS-hosted Setta remote dev box over EC2 + SSM."
    )
    parser.add_argument(
        "--region",
        default=None,
        help="AWS region override. Falls back to env, Terraform outputs, then us-east-1.",
    )
    parser.add_argument(
        "--profile",
        default=None,
        help="AWS profile name to pass to boto3 and the AWS CLI.",
    )
    parser.add_argument(
        "--instance-id",
        default=None,
        help="Explicit EC2 instance id. Skips Terraform/tag-based discovery when set.",
    )
    parser.add_argument(
        "--name",
        default=None,
        help="Name tag to use for EC2 discovery when instance id is not known.",
    )
    parser.add_argument(
        "--terraform-dir",
        type=Path,
        default=None,
        help=f"Terraform directory with outputs (default: {DEFAULT_TERRAFORM_DIR}).",
    )
    parser.add_argument(
        "--remote-host",
        default=DEFAULT_REMOTE_HOST,
        help="Remote host for SSM port forwarding. Keep the default loopback unless you know otherwise.",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    up = subparsers.add_parser("up", help="Start the EC2 dev box.")
    up.add_argument(
        "--no-wait",
        action="store_true",
        help="Return after the start request instead of waiting for running + SSM online.",
    )
    up.add_argument(
        "--wait-timeout",
        type=int,
        default=DEFAULT_SSM_WAIT_TIMEOUT_SECONDS,
        help="Seconds to wait for SSM online status when waiting.",
    )
    up.set_defaults(handler=handle_up)

    down = subparsers.add_parser("down", help="Stop the EC2 dev box.")
    down.add_argument(
        "--no-wait",
        action="store_true",
        help="Return after the stop request instead of waiting for the stopped state.",
    )
    down.set_defaults(handler=handle_down)

    status = subparsers.add_parser("status", help="Print EC2 + SSM status.")
    status.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable status JSON.",
    )
    status.set_defaults(handler=handle_status)

    shell = subparsers.add_parser(
        "ssm-shell", help="Open an interactive Session Manager shell."
    )
    shell.set_defaults(handler=handle_ssm_shell)

    remote_shell = subparsers.add_parser(
        "remote-shell",
        help="Jump straight into the ubuntu tmux session on the devbox.",
    )
    remote_shell.add_argument(
        "--command",
        default=None,
        help="Explicit interactive command override. Defaults to sudo -> ubuntu -> tmux.",
    )
    remote_shell.set_defaults(handler=handle_remote_shell)

    tunnel_setta = subparsers.add_parser(
        "tunnel-setta",
        help="Open an SSM local tunnel to the remote Setta port.",
    )
    tunnel_setta.add_argument(
        "--remote-port",
        type=int,
        default=None,
        help="Remote Setta port. Defaults to the Terraform standard port when available.",
    )
    tunnel_setta.add_argument(
        "--local-port",
        type=int,
        default=None,
        help="Local port for the forwarded Setta tunnel. Defaults to the same value as the remote port.",
    )
    tunnel_setta.set_defaults(handler=handle_tunnel_setta)

    tunnel_cdp = subparsers.add_parser(
        "tunnel-cdp",
        help="Open an SSM local tunnel to the remote Chrome CDP port.",
    )
    tunnel_cdp.add_argument(
        "--remote-port",
        type=int,
        default=None,
        help="Remote CDP port. Defaults to the Terraform standard port when available.",
    )
    tunnel_cdp.add_argument(
        "--local-port",
        type=int,
        default=None,
        help="Local port for the forwarded CDP tunnel. Defaults to the same value as the remote port.",
    )
    tunnel_cdp.set_defaults(handler=handle_tunnel_cdp)

    kill_tunnels = subparsers.add_parser(
        "kill-tunnels",
        help="Terminate active SSM port-forward sessions for this devbox.",
    )
    kill_tunnels.add_argument(
        "--all-owners",
        action="store_true",
        help="Terminate matching port-forward sessions regardless of the AWS session owner.",
    )
    kill_tunnels.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON with the terminated session ids.",
    )
    kill_tunnels.set_defaults(handler=handle_kill_tunnels)

    return parser.parse_args()


def create_boto3_session(region: str, profile: str | None):
    try:
        import boto3
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "boto3 is not installed. Run `./init_env.sh` to sync the repo Python environment."
        ) from exc

    return boto3.session.Session(region_name=region, profile_name=profile)


def format_aws_auth_error(exc: Exception, profile: str | None) -> str | None:
    try:
        from botocore.exceptions import (  # type: ignore[import-not-found]
            ClientError,
            NoCredentialsError,
            PartialCredentialsError,
            ProfileNotFound,
            TokenRetrievalError,
            UnauthorizedSSOTokenError,
        )
    except ModuleNotFoundError:
        return None

    profile_hint = ""
    if profile is not None:
        profile_hint = (
            f" Run `aws sso login --profile {profile}` and retry."
        )
    else:
        profile_hint = (
            " Set `AWS_PROFILE`, `SETTA_AWS_DEVBOX_PROFILE`, or create "
            "`infra/aws-devbox/aws-devbox.env`, then run "
            "`aws sso login --profile <name>`."
        )

    if isinstance(exc, ProfileNotFound):
        if profile is not None:
            return (
                f"AWS profile `{profile}` was not found.{profile_hint}"
            )
        return (
            "AWS credentials are not configured for the devbox helper."
            f"{profile_hint}"
        )

    if isinstance(
        exc,
        (
            NoCredentialsError,
            PartialCredentialsError,
            TokenRetrievalError,
            UnauthorizedSSOTokenError,
        ),
    ):
        return f"AWS credentials are not available.{profile_hint}"

    if isinstance(exc, ClientError):
        error = exc.response.get("Error")
        if isinstance(error, dict):
            code = error.get("Code")
            if code in RETRYABLE_AWS_AUTH_ERROR_CODES:
                return f"AWS credentials are not valid for this request.{profile_hint}"

    return None


def aws_sso_login_preconditions_met(profile: str | None) -> bool:
    if profile is None:
        return False
    if not auto_sso_login_enabled():
        return False
    if shutil.which("aws") is None:
        return False
    if not profile_uses_sso(profile):
        return False
    return True


def client_error_code(exc: Exception) -> object | None:
    response = getattr(exc, "response", None)
    if not isinstance(response, dict):
        return None
    error = response.get("Error")
    if not isinstance(error, dict):
        return None
    return error.get("Code")


def should_attempt_aws_sso_login(exc: Exception, profile: str | None) -> bool:
    if not aws_sso_login_preconditions_met(profile):
        return False
    try:
        from botocore.exceptions import (  # type: ignore[import-not-found]
            ClientError,
            NoCredentialsError,
            PartialCredentialsError,
            TokenRetrievalError,
            UnauthorizedSSOTokenError,
        )
    except ModuleNotFoundError:
        return False

    credential_errors = (
        NoCredentialsError,
        PartialCredentialsError,
        TokenRetrievalError,
        UnauthorizedSSOTokenError,
    )
    if isinstance(exc, credential_errors):
        return True
    return (
        isinstance(exc, ClientError)
        and client_error_code(exc) in RETRYABLE_AWS_AUTH_ERROR_CODES
    )


def run_aws_sso_login(profile: str) -> int:
    command = build_aws_sso_login_command(profile)
    print(
        f"AWS credentials are stale for profile `{profile}`. "
        f"Running `{shlex.join(command)}`...",
        file=sys.stderr,
    )
    result = subprocess.run(
        command,
        check=False,
    )
    return result.returncode


def resolve_instance_id(
    args: argparse.Namespace,
    tf_outputs: TerraformOutputs | None,
    ec2_client,
) -> str:
    if args.instance_id:
        return args.instance_id

    env_instance_id = getenv_nonempty("SETTA_AWS_DEVBOX_INSTANCE_ID")
    if env_instance_id is not None:
        return env_instance_id

    if tf_outputs is not None and tf_outputs.instance_id is not None:
        return tf_outputs.instance_id

    discovery_tags = resolve_discovery_tags(args, tf_outputs)
    reservations = discover_instances_by_tags(ec2_client, discovery_tags)
    description = ", ".join(
        f"{key}={value}" for key, value in sorted(discovery_tags.items())
    )
    return select_single_instance_id(reservations, description)


def build_filters_from_tags(tags: dict[str, str]) -> list[dict[str, object]]:
    filters: list[dict[str, object]] = []
    for key, value in sorted(tags.items()):
        filters.append({"Name": f"tag:{key}", "Values": [value]})
    filters.append(
        {
            "Name": "instance-state-name",
            "Values": ["pending", "running", "stopped", "stopping"],
        }
    )
    return filters


def discover_instances_by_tags(
    ec2_client, tags: dict[str, str]
) -> list[dict[str, object]]:
    response = ec2_client.describe_instances(Filters=build_filters_from_tags(tags))
    reservations = response.get("Reservations")
    if not isinstance(reservations, list):
        return []
    return reservations


def select_single_instance_id(
    reservations: list[dict[str, object]], description: str
) -> str:
    instance_ids: list[str] = []
    for reservation in reservations:
        instances = reservation.get("Instances")
        if not isinstance(instances, list):
            continue
        for instance in instances:
            if not isinstance(instance, dict):
                continue
            instance_id = instance.get("InstanceId")
            if isinstance(instance_id, str):
                instance_ids.append(instance_id)

    if len(instance_ids) == 1:
        return instance_ids[0]
    if not instance_ids:
        raise SystemExit(
            f"Could not resolve an EC2 instance from discovery tags ({description}). Apply Terraform first or pass --instance-id."
        )
    raise SystemExit(
        f"Discovery tags ({description}) matched multiple instances: {', '.join(sorted(instance_ids))}. Pass --instance-id."
    )


def describe_instance(ec2_client, instance_id: str) -> dict[str, object]:
    response = ec2_client.describe_instances(InstanceIds=[instance_id])
    reservations = response.get("Reservations")
    if not isinstance(reservations, list) or len(reservations) != 1:
        raise SystemExit(f"Could not load instance details for {instance_id}.")
    instances = reservations[0].get("Instances")
    if not isinstance(instances, list) or len(instances) != 1:
        raise SystemExit(f"Could not load instance details for {instance_id}.")
    instance = instances[0]
    if not isinstance(instance, dict):
        raise SystemExit(f"Could not load instance details for {instance_id}.")
    return instance


def extract_instance_state(instance: dict[str, object]) -> str:
    state = instance.get("State")
    if not isinstance(state, dict):
        raise SystemExit("EC2 instance payload did not include a usable state.")
    name = state.get("Name")
    if not isinstance(name, str):
        raise SystemExit("EC2 instance payload did not include a usable state name.")
    return name


def extract_instance_name(instance: dict[str, object]) -> str | None:
    raw_tags = instance.get("Tags")
    if not isinstance(raw_tags, list):
        return None
    for tag in raw_tags:
        if not isinstance(tag, dict):
            continue
        if tag.get("Key") != "Name":
            continue
        value = tag.get("Value")
        if isinstance(value, str) and value:
            return value
    return None


def get_ssm_ping_status(ssm_client, instance_id: str) -> str:
    response = ssm_client.describe_instance_information(
        Filters=[{"Key": "InstanceIds", "Values": [instance_id]}],
        MaxResults=5,
    )
    raw_info_list = response.get("InstanceInformationList")
    if not isinstance(raw_info_list, list) or len(raw_info_list) == 0:
        return "offline"
    first = raw_info_list[0]
    if not isinstance(first, dict):
        return "offline"
    ping_status = first.get("PingStatus")
    if isinstance(ping_status, str) and ping_status:
        return ping_status.lower()
    return "offline"


def wait_for_ssm_online(ssm_client, instance_id: str, timeout_seconds: int) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        ping_status = get_ssm_ping_status(ssm_client, instance_id)
        if ping_status == "online":
            return
        time.sleep(5)
    raise SystemExit(
        f"Instance {instance_id} is running but SSM did not report online within {timeout_seconds} seconds."
    )


def build_status_payload(
    instance: dict[str, object],
    *,
    instance_id: str,
    region: str,
    repo_checkout_path: str | None,
    ssm_ping_status: str,
    setta_port: int,
    cdp_port: int,
) -> StatusPayload:
    placement = instance.get("Placement")
    availability_zone = None
    if isinstance(placement, dict):
        raw_az = placement.get("AvailabilityZone")
        if isinstance(raw_az, str) and raw_az:
            availability_zone = raw_az

    private_ip = instance.get("PrivateIpAddress")
    public_ip = instance.get("PublicIpAddress")

    return StatusPayload(
        availability_zone=availability_zone,
        cdp_port=cdp_port,
        instance_id=instance_id,
        instance_name=extract_instance_name(instance),
        private_ip=private_ip if isinstance(private_ip, str) else None,
        public_ip=public_ip if isinstance(public_ip, str) else None,
        repo_checkout_path=repo_checkout_path,
        region=region,
        setta_port=setta_port,
        ssm_ping_status=ssm_ping_status,
        state=extract_instance_state(instance),
    )


def format_status_text(payload: StatusPayload) -> str:
    lines = [
        f"instance_id: {payload.instance_id}",
        f"name: {payload.instance_name or '-'}",
        f"region: {payload.region}",
        f"availability_zone: {payload.availability_zone or '-'}",
        f"state: {payload.state}",
        f"ssm_ping_status: {payload.ssm_ping_status}",
        f"private_ip: {payload.private_ip or '-'}",
        f"public_ip: {payload.public_ip or '-'}",
        f"repo_checkout_path: {payload.repo_checkout_path or '-'}",
        f"default_setta_port: {payload.setta_port}",
        f"default_cdp_port: {payload.cdp_port}",
    ]
    return "\n".join(lines)


def print_status(payload: StatusPayload, emit_json: bool) -> None:
    if emit_json:
        print(
            json.dumps(
                {
                    "availability_zone": payload.availability_zone,
                    "cdp_port": payload.cdp_port,
                    "instance_id": payload.instance_id,
                    "instance_name": payload.instance_name,
                    "private_ip": payload.private_ip,
                    "public_ip": payload.public_ip,
                    "repo_checkout_path": payload.repo_checkout_path,
                    "region": payload.region,
                    "setta_port": payload.setta_port,
                    "ssm_ping_status": payload.ssm_ping_status,
                    "state": payload.state,
                },
                indent=2,
                sort_keys=True,
            )
        )
        return
    print(format_status_text(payload))


def ensure_aws_cli() -> None:
    if shutil.which("aws") is not None:
        return
    raise SystemExit("The AWS CLI is required for SSM shell/tunnel commands.")


def build_aws_cli_prefix(region: str, profile: str | None) -> list[str]:
    prefix = ["aws"]
    if profile:
        prefix.extend(["--profile", profile])
    prefix.extend(["--region", region])
    return prefix


def build_ssm_shell_command(
    instance_id: str, region: str, profile: str | None
) -> list[str]:
    return build_aws_cli_prefix(region, profile) + [
        "ssm",
        "start-session",
        "--target",
        instance_id,
    ]


def build_port_forward_command(
    *,
    instance_id: str,
    region: str,
    profile: str | None,
    remote_host: str,
    remote_port: int,
    local_port: int,
) -> list[str]:
    parameters = json.dumps(
        {
            "host": [remote_host],
            "localPortNumber": [str(local_port)],
            "portNumber": [str(remote_port)],
        }
    )
    return build_aws_cli_prefix(region, profile) + [
        "ssm",
        "start-session",
        "--target",
        instance_id,
        "--document-name",
        PORT_FORWARD_SSM_DOCUMENT_NAME,
        "--parameters",
        parameters,
    ]


def build_interactive_command_session(
    *,
    instance_id: str,
    region: str,
    profile: str | None,
    command: str,
) -> list[str]:
    parameters = json.dumps({"command": [command]})
    return build_aws_cli_prefix(region, profile) + [
        "ssm",
        "start-session",
        "--target",
        instance_id,
        "--document-name",
        INTERACTIVE_COMMAND_SSM_DOCUMENT_NAME,
        "--parameters",
        parameters,
    ]


def run_cli_command(command: list[str]) -> int:
    result = subprocess.run(command, check=False)
    return result.returncode


def describe_active_sessions(ssm_client) -> list[dict[str, object]]:
    sessions: list[dict[str, object]] = []
    next_token: str | None = None

    while True:
        kwargs: dict[str, object] = {"State": "Active", "MaxResults": 50}
        if next_token is not None:
            kwargs["NextToken"] = next_token
        response = ssm_client.describe_sessions(**kwargs)
        raw_sessions = response.get("Sessions")
        if isinstance(raw_sessions, list):
            for session in raw_sessions:
                if isinstance(session, dict):
                    sessions.append(session)
        raw_next_token = response.get("NextToken")
        if not isinstance(raw_next_token, str) or raw_next_token == "":
            return sessions
        next_token = raw_next_token


def select_port_forward_session_ids(
    sessions: list[dict[str, object]],
    *,
    instance_id: str,
    owner_arn: str | None,
) -> list[str]:
    session_ids: list[str] = []
    for session in sessions:
        target = session.get("Target")
        if target != instance_id:
            continue
        if session.get("DocumentName") != PORT_FORWARD_SSM_DOCUMENT_NAME:
            continue
        if owner_arn is not None and session.get("Owner") != owner_arn:
            continue
        session_id = session.get("SessionId")
        if isinstance(session_id, str) and session_id:
            session_ids.append(session_id)
    return sorted(session_ids)


def handle_up(args: argparse.Namespace) -> int:
    tf_outputs = load_terraform_outputs(resolve_terraform_dir(args))
    region = resolve_region(args, tf_outputs)
    profile = resolve_profile(args)
    session = create_boto3_session(region, profile)
    ec2_client = session.client("ec2")
    ssm_client = session.client("ssm")
    instance_id = resolve_instance_id(args, tf_outputs, ec2_client)
    instance = describe_instance(ec2_client, instance_id)
    state = extract_instance_state(instance)

    if state in {"shutting-down", "terminated"}:
        raise SystemExit(
            f"Instance {instance_id} cannot be started from state {state}."
        )

    if state == "stopping":
        ec2_client.get_waiter("instance_stopped").wait(InstanceIds=[instance_id])
        instance = describe_instance(ec2_client, instance_id)
        state = extract_instance_state(instance)

    if state == "stopped":
        ec2_client.start_instances(InstanceIds=[instance_id])
        if not args.no_wait:
            ec2_client.get_waiter("instance_running").wait(InstanceIds=[instance_id])
            wait_for_ssm_online(ssm_client, instance_id, args.wait_timeout)

    if state in {"pending", "running"} and not args.no_wait:
        ec2_client.get_waiter("instance_running").wait(InstanceIds=[instance_id])
        wait_for_ssm_online(ssm_client, instance_id, args.wait_timeout)

    refreshed = describe_instance(ec2_client, instance_id)
    payload = build_status_payload(
        refreshed,
        instance_id=instance_id,
        region=region,
        repo_checkout_path=resolve_repo_checkout_path(tf_outputs),
        ssm_ping_status=get_ssm_ping_status(ssm_client, instance_id),
        setta_port=resolve_port(None, tf_outputs, "setta", DEFAULT_SETTA_PORT),
        cdp_port=resolve_port(None, tf_outputs, "cdp", DEFAULT_CDP_PORT),
    )
    print_status(payload, emit_json=False)
    return 0


def handle_down(args: argparse.Namespace) -> int:
    tf_outputs = load_terraform_outputs(resolve_terraform_dir(args))
    region = resolve_region(args, tf_outputs)
    profile = resolve_profile(args)
    session = create_boto3_session(region, profile)
    ec2_client = session.client("ec2")
    instance_id = resolve_instance_id(args, tf_outputs, ec2_client)
    instance = describe_instance(ec2_client, instance_id)
    state = extract_instance_state(instance)

    if state in {"shutting-down", "terminated"}:
        raise SystemExit(
            f"Instance {instance_id} cannot be stopped from state {state}."
        )

    if state in {"running", "pending"}:
        ec2_client.stop_instances(InstanceIds=[instance_id])
        if not args.no_wait:
            ec2_client.get_waiter("instance_stopped").wait(InstanceIds=[instance_id])

    refreshed = describe_instance(ec2_client, instance_id)
    payload = build_status_payload(
        refreshed,
        instance_id=instance_id,
        region=region,
        repo_checkout_path=resolve_repo_checkout_path(tf_outputs),
        ssm_ping_status="offline",
        setta_port=resolve_port(None, tf_outputs, "setta", DEFAULT_SETTA_PORT),
        cdp_port=resolve_port(None, tf_outputs, "cdp", DEFAULT_CDP_PORT),
    )
    print_status(payload, emit_json=False)
    return 0


def handle_status(args: argparse.Namespace) -> int:
    tf_outputs = load_terraform_outputs(resolve_terraform_dir(args))
    region = resolve_region(args, tf_outputs)
    profile = resolve_profile(args)
    session = create_boto3_session(region, profile)
    ec2_client = session.client("ec2")
    ssm_client = session.client("ssm")
    instance_id = resolve_instance_id(args, tf_outputs, ec2_client)
    instance = describe_instance(ec2_client, instance_id)
    payload = build_status_payload(
        instance,
        instance_id=instance_id,
        region=region,
        repo_checkout_path=resolve_repo_checkout_path(tf_outputs),
        ssm_ping_status=get_ssm_ping_status(ssm_client, instance_id),
        setta_port=resolve_port(None, tf_outputs, "setta", DEFAULT_SETTA_PORT),
        cdp_port=resolve_port(None, tf_outputs, "cdp", DEFAULT_CDP_PORT),
    )
    print_status(payload, emit_json=args.json)
    return 0


def ensure_running_instance(instance: dict[str, object], instance_id: str) -> None:
    state = extract_instance_state(instance)
    if state != "running":
        raise SystemExit(
            f"Instance {instance_id} is {state}. Start it first with `python scripts/aws_devbox.py up`."
        )


def handle_ssm_shell(args: argparse.Namespace) -> int:
    ensure_aws_cli()
    tf_outputs = load_terraform_outputs(resolve_terraform_dir(args))
    region = resolve_region(args, tf_outputs)
    profile = resolve_profile(args)
    session = create_boto3_session(region, profile)
    ec2_client = session.client("ec2")
    instance_id = resolve_instance_id(args, tf_outputs, ec2_client)
    instance = describe_instance(ec2_client, instance_id)
    ensure_running_instance(instance, instance_id)
    return run_cli_command(build_ssm_shell_command(instance_id, region, profile))


def handle_remote_shell(args: argparse.Namespace) -> int:
    ensure_aws_cli()
    tf_outputs = load_terraform_outputs(resolve_terraform_dir(args))
    region = resolve_region(args, tf_outputs)
    profile = resolve_profile(args)
    session = create_boto3_session(region, profile)
    ec2_client = session.client("ec2")
    instance_id = resolve_instance_id(args, tf_outputs, ec2_client)
    instance = describe_instance(ec2_client, instance_id)
    ensure_running_instance(instance, instance_id)
    command = build_interactive_command_session(
        instance_id=instance_id,
        region=region,
        profile=profile,
        command=resolve_remote_shell_command(args),
    )
    return run_cli_command(command)


def handle_tunnel_setta(args: argparse.Namespace) -> int:
    ensure_aws_cli()
    tf_outputs = load_terraform_outputs(resolve_terraform_dir(args))
    region = resolve_region(args, tf_outputs)
    profile = resolve_profile(args)
    session = create_boto3_session(region, profile)
    ec2_client = session.client("ec2")
    instance_id = resolve_instance_id(args, tf_outputs, ec2_client)
    instance = describe_instance(ec2_client, instance_id)
    ensure_running_instance(instance, instance_id)
    remote_port = resolve_port(
        args.remote_port, tf_outputs, "setta", DEFAULT_SETTA_PORT
    )
    local_port = args.local_port if args.local_port is not None else remote_port
    command = build_port_forward_command(
        instance_id=instance_id,
        local_port=local_port,
        profile=profile,
        region=region,
        remote_host=args.remote_host,
        remote_port=remote_port,
    )
    return run_cli_command(command)


def handle_tunnel_cdp(args: argparse.Namespace) -> int:
    ensure_aws_cli()
    tf_outputs = load_terraform_outputs(resolve_terraform_dir(args))
    region = resolve_region(args, tf_outputs)
    profile = resolve_profile(args)
    session = create_boto3_session(region, profile)
    ec2_client = session.client("ec2")
    instance_id = resolve_instance_id(args, tf_outputs, ec2_client)
    instance = describe_instance(ec2_client, instance_id)
    ensure_running_instance(instance, instance_id)
    remote_port = resolve_port(args.remote_port, tf_outputs, "cdp", DEFAULT_CDP_PORT)
    local_port = args.local_port if args.local_port is not None else remote_port
    command = build_port_forward_command(
        instance_id=instance_id,
        local_port=local_port,
        profile=profile,
        region=region,
        remote_host=args.remote_host,
        remote_port=remote_port,
    )
    return run_cli_command(command)


def handle_kill_tunnels(args: argparse.Namespace) -> int:
    tf_outputs = load_terraform_outputs(resolve_terraform_dir(args))
    region = resolve_region(args, tf_outputs)
    profile = resolve_profile(args)
    session = create_boto3_session(region, profile)
    ec2_client = session.client("ec2")
    ssm_client = session.client("ssm")
    instance_id = resolve_instance_id(args, tf_outputs, ec2_client)

    owner_arn: str | None = None
    if not args.all_owners:
        sts_client = session.client("sts")
        response = sts_client.get_caller_identity()
        raw_arn = response.get("Arn")
        if not isinstance(raw_arn, str) or raw_arn == "":
            raise SystemExit("Could not resolve the current AWS caller ARN.")
        owner_arn = raw_arn

    session_ids = select_port_forward_session_ids(
        describe_active_sessions(ssm_client),
        instance_id=instance_id,
        owner_arn=owner_arn,
    )

    for session_id in session_ids:
        ssm_client.terminate_session(SessionId=session_id)

    if args.json:
        print(
            json.dumps(
                {
                    "instance_id": instance_id,
                    "terminated_session_ids": session_ids,
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0

    if not session_ids:
        print(f"No active port-forward sessions found for {instance_id}.")
        return 0

    print(f"Terminated port-forward sessions for {instance_id}:")
    for session_id in session_ids:
        print(f"- {session_id}")
    return 0


def main() -> int:
    args = parse_args()
    profile = resolve_profile(args)
    try:
        return args.handler(args)
    except SystemExit:
        raise
    except Exception as exc:
        if should_attempt_aws_sso_login(exc, profile):
            login_returncode = run_aws_sso_login(profile)
            if login_returncode != 0:
                raise SystemExit(
                    f"AWS SSO login failed for profile `{profile}`."
                ) from None
            try:
                return args.handler(args)
            except SystemExit:
                raise
            except Exception as retry_exc:
                aws_error = format_aws_auth_error(retry_exc, profile)
                if aws_error is not None:
                    raise SystemExit(aws_error) from None
                raise

        aws_error = format_aws_auth_error(exc, profile)
        if aws_error is not None:
            raise SystemExit(aws_error) from None
        raise


if __name__ == "__main__":
    raise SystemExit(main())
