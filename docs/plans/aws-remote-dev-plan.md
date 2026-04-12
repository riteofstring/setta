# AWS Remote Dev Plan

Date: 2026-04-08
Status: draft
Owner: Codex + Jeff

## Goal

Create one reproducible AWS remote dev environment that:

- runs Codex on the remote machine
- runs Setta, Playwright, and Chrome DevTools MCP from that same machine
- is accessible from Jeff's laptop for daily work
- can later accept prompt input from Jeff's phone
- stays cheap, secure, and simple to operate

## Non-goals

- multi-user shared dev infrastructure
- Kubernetes, ECS, or autoscaling
- public internet exposure of Setta, CDP, or browser tooling
- GPU instances
- Docker-first architecture
- mobile-first workflow before the laptop workflow is stable

## Core decisions

- Use one EC2 instance as the primary remote dev box.
- Run Codex, the repo, Setta, Playwright, and Chrome/Chromium on that same host.
- Use Ubuntu x86_64 for the first version to minimize browser/tooling surprises.
- Use AWS Systems Manager Session Manager as the default access path.
- Keep inbound security-group rules empty unless a later phase proves a real need.
- Put the instance in a public subnet with no inbound rules rather than adding NAT and extra network cost.
- Use Terraform as the source of truth for infrastructure.
- Use cloud-init as the source of truth for first-boot machine bootstrap.
- Use one small boto3 helper for day-to-day lifecycle and tunneling commands.
- Use `tmux` for persistent remote terminals and Codex sessions.
- Keep Playwright headless by default; add `Xvfb` only for headed Chrome/CDP workflows.
- Defer Tailscale and phone access until the base laptop workflow is working.

## Baseline machine shape

Initial default:

- region: `us-east-1`
- instance family: `t3a.xlarge`
- root volume: `gp3`, `100 GB`
- architecture: `x86_64`
- lifecycle: stop when idle, restart when needed

Rationale:

- `4 vCPU / 16 GiB` is a safer starting point for Codex + dev servers + browser tooling than smaller burstable sizes
- `gp3` is the cheapest sensible default EBS option for this use case
- stopping the instance preserves disk state while avoiding compute charges when not in use

This is a starting point, not a permanent commitment. Resize only after real usage shows it is needed.

## Target operator workflow

Daily use from laptop:

1. Run one local helper to start the dev box if needed.
2. Open an SSM shell or SSM-backed tunnel to the box.
3. Reattach the remote `tmux` session.
4. Run Codex on the remote host.
5. Reach Setta and CDP through local tunnels instead of public ports.
6. Stop the instance when done.

Later phone workflow:

1. Connect to the same box from the phone.
2. Reattach the same `tmux` session.
3. Type prompts from the phone into the running remote Codex workflow.

The first phone version should be terminal-only. Do not introduce a public browser IDE in phase 1.

## Deliverables

### 1. Infrastructure

Create `infra/aws-devbox/terraform/` with:

- EC2 instance
- IAM role + instance profile for SSM
- security group with no inbound app ports
- EBS root volume settings
- tags for cost tracking and discovery
- outputs for instance id, region, and connection metadata

### 2. Bootstrap

Create `infra/aws-devbox/cloud-init.yaml` to install and configure:

- system packages required for Playwright/Chrome
- `git`, `tmux`, `curl`, `jq`, `unzip`
- Node
- Python + `uv`
- Chrome or Chromium
- `Xvfb`
- repo checkout location
- any required shell/profile defaults

Bootstrap should leave the machine ready for:

- repo install
- Playwright browser install
- Setta startup
- Chrome/CDP startup

### 3. Operator script

Create one repo-local boto3 helper, likely `scripts/aws_devbox.py`, with commands:

- `up`
- `down`
- `status`
- `ssm-shell`
- `tunnel-setta`
- `tunnel-cdp`

This script should be the default operator entrypoint instead of the AWS console.

### 4. Runbook

Document:

- first-time setup
- daily laptop workflow
- how to recover a broken instance
- how to rotate/recreate the box cleanly
- how to stop the box safely

## Security rules

- Do not expose Setta, CDP, Playwright, or browser ports to the public internet.
- Prefer SSM access over exposed SSH.
- Keep secrets out of Terraform state when possible.
- Treat the instance as disposable; durable state should live in git or explicitly managed storage.
- Add least-privilege IAM only for what the instance/operator flow actually needs.

## Cost rules

- One instance only.
- No NAT gateway.
- No load balancer.
- No always-on secondary services.
- Stop the instance when not in use.
- Add a budget alert early.
- Add optional idle-stop automation after the basic flow works.

## Phase plan

### Phase 1: Base remote dev box

Success criteria:

- Terraform can create and destroy the dev box.
- cloud-init brings the machine to a usable baseline.
- boto3 helper can start, stop, inspect, and open an SSM shell.
- Jeff can reconnect to a persistent `tmux` session from the laptop.

### Phase 2: Setta + browser tooling

Success criteria:

- Setta runs on the remote host.
- Playwright runs on the remote host.
- Chrome/Chromium runs on the remote host with CDP.
- laptop tunnels can reach Setta and CDP cleanly.
- chrome-devtools-mcp can operate against the tunneled remote browser.

### Phase 3: Cheap/day-to-day operations

Success criteria:

- start/stop is one command each
- status is one command
- the runbook is enough to recreate the box without memory of prior steps
- budget alert is active

### Phase 4: Phone access

Success criteria:

- Jeff can connect from the phone to the same remote shell session
- phone access does not require exposing a public browser IDE

Recommended default for this phase:

- add Tailscale only if the base path is already stable and phone access still feels awkward over the existing shell path

## Explicit simplifications

To keep this cheap and maintainable, the initial implementation should not include:

- Dockerized full-dev environment
- private subnet + NAT
- image baking/Packer
- autoscaling
- Spot instances
- multiple environments
- browser streaming / remote desktop stack

## Risks to watch

- Chrome/Chromium package choice may affect MCP stability; use the simplest working option and pin the install path in docs.
- Burstable CPU credits may become annoying under sustained browser + build load; only revisit the instance family after actual usage.
- Remote browser workflows can become fragile if Chrome and MCP are split across machines; keep them colocated.
- Phone access can easily create security and complexity creep; keep the first mobile path to terminal access only.

## Acceptance checklist

This plan is complete only when all of the following are true:

- infra can be recreated from repository-managed configuration
- the dev box can be operated without opening the AWS console
- Codex runs on the remote box
- Playwright runs on the remote box
- Chrome DevTools MCP works against the remote browser through the supported connection path
- the default path is secure without public app ports
- the running cost is bounded by one stoppable EC2 instance plus EBS

## Next implementation step

Implement Phase 1 first:

- add Terraform scaffold
- add cloud-init scaffold
- add boto3 operator scaffold
- add a short runbook

Do not implement phone access until the laptop workflow is proven end to end.
