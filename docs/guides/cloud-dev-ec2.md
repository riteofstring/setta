# EC2 Cloud Dev Setup

This repo now includes an automated EC2 + containerized dev workflow for long-running Setta work.

## Default shape

- Instance: `m7i-flex.2xlarge`
- Disk: `500 GB` encrypted `gp3`
- OS: `Ubuntu 24.04 x86_64`
- Remote access: `SSM` first, no inbound ports required
- Remote desktop: `Amazon DCV` enabled by default
- Remote browser: host-installed `Google Chrome` enabled by default
- Dev runtime: repo-owned Docker/devcontainer based on Playwright Linux

The defaults intentionally bias toward a remote workstation that can handle long tests, multiple Codex sessions, and headed browser work. If you later decide this is oversized, stop the instance and change the type.

## What Gets Automated

- EC2 launch with the latest Ubuntu 24.04 AMI using Canonical's public SSM parameter
- IAM role + instance profile for `AmazonSSMManagedInstanceCore`
- Security group with no inbound rules by default
- Root volume sizing and encryption
- Host bootstrap for Docker, Docker Compose, git-lfs, DCV, and Chrome
- DCV virtual session creation for the `ubuntu` user
- Local helper scripts for SSH-over-SSM config output and port forwarding
- Dev container wired so containerized Codex can reach Chrome running on the host via `host.docker.internal`

## Local Prereqs

- `aws`
- `session-manager-plugin`
- a configured AWS profile/region
- an SSH public key at `~/.ssh/id_ed25519.pub` or `~/.ssh/id_rsa.pub` if you want VS Code Remote-SSH over SSM

## Launch

From the repo root:

```bash
./scripts/cloud/launch-ec2.sh
```

Useful overrides:

```bash
INSTANCE_TYPE=m7i-flex.xlarge DISK_GB=300 ./scripts/cloud/launch-ec2.sh
INSTANCE_NAME=setta-remote ENABLE_DCV=0 ENABLE_REMOTE_CHROME=0 ./scripts/cloud/launch-ec2.sh
./scripts/cloud/launch-ec2.sh --allow-dcv-cidr 203.0.113.0/24
```

The script writes the active instance metadata to `setta_files/cloud/ec2.current.env`.

## Connect Securely

### SSM shell

```bash
./scripts/cloud/ssm-shell.sh
```

### VS Code Remote-SSH over SSM

Print the SSH config snippet:

```bash
./scripts/cloud/print-ssh-config.sh
```

Add the output to `~/.ssh/config`, then connect to `setta-ec2` from VS Code Remote-SSH. This still uses SSM as the transport; the security group can remain inbound-closed.

## Clone The Repo On The Host

Once connected to the instance:

```bash
git clone <your-repo-url> ~/src/setta
cd ~/src/setta
```

## Start The Dev Container

On the EC2 host:

```bash
cd ~/src/setta
SETTA_CONTAINER_UID=$(id -u) SETTA_CONTAINER_GID=$(id -g) docker compose up -d setta-dev
```

Then either:

- open the folder in VS Code and choose `Reopen in Container`, or
- use the container directly:

```bash
docker compose exec setta-dev bash
docker compose exec setta-dev bash -lc './dev_install.sh'
```

The devcontainer runs `./dev_install.sh` on first creation, which uses the repo's existing setup path:

- [dev_install.sh](/Users/jeff/Documents/_projects/setta.frontend-performance-11/dev_install.sh)
- [init_env.sh](/Users/jeff/Documents/_projects/setta.frontend-performance-11/init_env.sh)

## Remote Chrome Workflow

This is the preferred path when Codex itself is running inside the devcontainer.

1. Connect to the EC2 box.
2. Open the DCV web client locally:

```bash
./scripts/cloud/start-port-forwards.sh --dcv
```

Then visit `https://127.0.0.1:8443`.

Log in with:

- user: `ubuntu`
- password: `STATE_DCV_PASSWORD` from `setta_files/cloud/ec2.current.env`

3. Inside the DCV desktop, open a terminal in the repo and start Chrome with the repo's CDP workflow:

```bash
./scripts/cloud/start-remote-chrome.sh
```

Because the container uses `CDP_HOST=host.docker.internal`, containerized Codex can reach the host Chrome CDP endpoint without changing the existing repo MCP flow.

## Local Chrome Fallback

If you want to keep browsing on your laptop instead:

```bash
./scripts/cloud/start-port-forwards.sh --app --backend
```

Then open:

- `http://127.0.0.1:3000`
- `http://127.0.0.1:8000`

This is the simpler path for manual local browsing. The remote-Chrome path is still better if Codex is running on the EC2 host or inside the devcontainer and needs `chrome-devtools-mcp`.

## Optional CDP Port Forward

If you need the remote host CDP port on your laptop:

```bash
./scripts/cloud/start-port-forwards.sh --cdp
```

That forwards `9222 -> 9222`.

## Stop Local Port Forwards

```bash
./scripts/cloud/stop-port-forwards.sh
```

## Why The Container Is Separate From Host Chrome

- Headless Playwright and long-running test/agent workloads fit a container well.
- The repo's headed Chrome + MCP workflow assumes a real browser instance, and this is cleaner on the host than inside a nested desktop container.
- The devcontainer is set up so the container can talk to the host Chrome CDP port without patching the local-only workflow.

Relevant repo references:

- [frontend/playwright.config.ts](/Users/jeff/Documents/_projects/setta.frontend-performance-11/frontend/playwright.config.ts#L3)
- [docs/guides/browser-mcp-quickstart.md](/Users/jeff/Documents/_projects/setta.frontend-performance-11/docs/guides/browser-mcp-quickstart.md#L13)
- [.codex/config.toml](/Users/jeff/Documents/_projects/setta.frontend-performance-11/.codex/config.toml#L1)
