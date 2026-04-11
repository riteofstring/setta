# AWS Remote Devbox

This guide is the phase-1 runbook for the AWS remote dev workflow described in
`docs/plans/aws-remote-dev-plan.md`.

It covers the reproducible box bootstrap, the repo-local operator script, and
the base daily workflow from a laptop. Phone access is intentionally deferred.

## Scope

This phase delivers:

- Terraform-managed EC2 + VPC + SSM instance profile under
  `infra/aws-devbox/terraform/`
- cloud-init bootstrap under `infra/aws-devbox/cloud-init.yaml`
- operator helper at `scripts/aws_devbox.py`
- SSM shell + tunnel entrypoints without public inbound ports

This phase does not yet automate:

- budget alerts
- idle-stop automation
- public browser IDE access
- multi-user access

## Prerequisites

Local machine:

- AWS account credentials with permission to create EC2, IAM, VPC, and SSM resources
- `terraform`
- AWS CLI v2 with Session Manager support
- repo dev env bootstrapped so `boto3` is available:

```sh
source activate.sh
uv sync --extra dev
```

- optional repo-local env file for the wrapper scripts:

```sh
cp infra/aws-devbox/aws-devbox.env.example infra/aws-devbox/aws-devbox.env
```

The wrapper scripts `./aws.sh`, `./remote.sh`, and `./remote-kill.sh` automatically load
`infra/aws-devbox/aws-devbox.env` when it exists. The most useful default in
that file is usually `AWS_PROFILE=...`. For the one-command SSH workflow, also set
the local SSH key paths there so Terraform can authorize the matching public
key and `remote.sh` can use the same identity for SSH-over-SSM:

```sh
AWS_PROFILE=setta-admin
SETTA_AWS_DEVBOX_SSH_IDENTITY_FILE=$HOME/.ssh/setta-devbox-login
SETTA_AWS_DEVBOX_SSH_PUBLIC_KEY_FILE=$HOME/.ssh/setta-devbox-login.pub
SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE=$HOME/.ssh/macgitkey
```

Use `./aws-infra.sh` for Terraform operations when you want those env defaults
applied automatically. With no args, `./aws-infra.sh` defaults to `plan`.

With no subcommand, `./aws.sh` defaults to `status`.

If that configured profile uses AWS IAM Identity Center / AWS SSO and the local
login has expired, the wrapper flow automatically runs `aws sso login --profile
...` once before retrying. Set `SETTA_AWS_DEVBOX_AUTO_SSO_LOGIN=0` to disable
that behavior.

`./remote.sh` is the main day-to-day entry point.
By default it opens the selector-driven remote dev runtime flow.
Use `./remote.sh --nochrome` for the older shell-only attach path.

The devbox bootstrap also installs the OpenAI Codex CLI (`codex`) and configures
it to use file-based credential storage under `~/.codex/`. That matches
OpenAI's documented headless fallback of copying `~/.codex/auth.json` to a
remote machine when browser login is inconvenient.

Recommended split:

- use a dedicated local key only for devbox login
- keep your Yubi-backed GitHub key as `SETTA_AWS_DEVBOX_GIT_IDENTITY_FILE`
- `remote.sh` uses the dedicated login key to enter the box
- remote `git push` / `git pull` use the forwarded local Git identity instead
- `remote.sh` starts a dedicated per-session `ssh-agent` for the configured Git
  identity so forwarded auth does not depend on the macOS launchd agent state
- when local `~/.codex/auth.json` exists, `remote.sh` copies it to the remote
  `~/.codex/auth.json` before attaching so `codex` is usually ready immediately
- when a remote Git command needs the Yubi-backed key, touch the YubiKey on the
  laptop even if the remote shell does not print an explicit prompt
- the devbox SSH client config forces `PubkeyAuthentication unbound` for
  `github.com` so forwarded security-key auth uses the compatible unbound path
- `remote.sh` defaults to selector mode, so you do not need a matching local
  worktree just to reconnect to an existing remote worktree
- selector mode lists remote git worktrees first, then adds sibling repo
  entrypoint folders under the remote checkout parent (for example
  `/home/ubuntu/dev/setta`) when they match the same repo origin
- when the selected remote target is not `main`, `remote.sh` also starts or
  reuses the sibling `main` checkout runtime by default so side-by-side
  worktree vs `main` checks are immediately available
- `./remote.sh worktree <branch>` creates or reuses a named remote worktree
- `./remote.sh select` explicitly opens the selector menu; plain `./remote.sh`
  already does this by default
- `./remote.sh local` uses the current local worktree as the selector when you
  want the remote runtime that matches the current checkout explicitly
- `./remote.sh reset ...` runs the same selector flow but restarts the selected
  remote worktree with `./aireset.sh`
- `./remote.sh --nochrome` is the shell-only SSH-over-SSM path
- in shell-only mode, `remote.sh` automatically resolves the local repo's
  `origin` URL and current branch, then repairs the remote checkout `origin`
  before attaching
- in shell-only mode, `remote.sh` maps your current local repo subdirectory to
  the same remote subdirectory
- `./remote.sh --nochrome --root` forces the remote repo checkout root instead
- `SETTA_AWS_DEVBOX_REMOTE_START_MODE=working|repo_root` lets you change the
  default behavior in `infra/aws-devbox/aws-devbox.env`
- `SETTA_AWS_DEVBOX_REPO_REMOTE_URL` and `SETTA_AWS_DEVBOX_REPO_BRANCH` exist
  if you need to override the auto-detected repo context explicitly
- remote worktree lifecycles default to `--browser-mode headless`; override
  with `--browser-mode headed` or `SETTA_AWS_DEVBOX_REMOTE_BROWSER_MODE=headed`

Remote machine bootstrap assumptions:

- Ubuntu 24.04 x86_64
- default Setta port `8000`
- default Chrome CDP port `9222`

## First-Time Setup

1. Copy the example Terraform vars and set the repo clone URL you want the box
   to use:

```sh
cd infra/aws-devbox/terraform
cp terraform.tfvars.example terraform.tfvars
```

2. Review and edit at least:

- `repo_clone_url`
- `repo_checkout_path`
- `owner_tag`
- `cost_center`

3. Initialize and apply Terraform:

```sh
./aws-infra.sh init
./aws-infra.sh apply
```

4. Wait for cloud-init to finish on first boot, then inspect status from the
   repo root:

```sh
cd /path/to/setta.pixijs-graph
./aws.sh status
```

5. Open an SSM shell and finish the repo install on the box:

```sh
./aws.sh ssm-shell
sudo -iu ubuntu
tmux new -As setta
# clone or copy the repo into /home/ubuntu/dev/setta.pixijs-graph first if
# repo_clone_url was left blank in terraform.tfvars
setta-devbox-install-repo
```

The bootstrap already installs OS packages, Node, `uv`, Chrome, `Xvfb`, and the
OpenAI Codex CLI.
`setta-devbox-install-repo` handles repo-local `dev_install.sh` plus the
Playwright browser install.

6. Re-run `./aws-infra.sh apply` after adding the SSH public key env/file so the
   cloud-init template authorizes your laptop key for the one-command SSH path.

## Daily Laptop Workflow

Preferred selector-driven dev-runtime path:

```sh
./remote.sh
```

Create or reuse a named remote worktree:

```sh
./remote.sh worktree feature-auth
```

Use the current local worktree explicitly:

```sh
./remote.sh local
```

Reset and restart a selected remote worktree:

```sh
./remote.sh reset
```

Shell-only attach path:

```sh
./remote.sh --nochrome
```

What `./remote.sh` does by default:

- starts the instance if it is stopped
- waits for SSM readiness
- shows a selector menu of existing remote worktrees unless you explicitly
  passed `worktree <branch>` or another selector mode
- augments that selector with sibling repo entrypoint folders under the remote
  checkout parent when they match the same repo origin
- also starts or reuses the remote `main` reference runtime when the selected
  target is not already `main`
- waits briefly for that `main` reference to become healthy, then continues
  attaching even if the reference is still bootstrapping in tmux
- creates or reuses a named remote worktree when you passed
  `worktree <branch>`
- starts or reuses `./ai.sh --browser-mode headless` in that remote worktree
- forwards the selected runtime ports locally and, when present, also forwards
  the remote `main` reference frontend/backend/CDP ports
- asks the remote worktree for its authoritative frontend/backend/debug ports
- forwards those exact ports back to the laptop
- prints the remote tmux session name for the selected runtime and, when
  applicable, the separate `main` reference tmux session name
- opens the forwarded frontend URL in a fresh local browser window
- attaches you to the per-worktree remote tmux shell

That means local browser access is already live while the shell is open, using
the same per-worktree ports that local `./ai.sh` would normally pick.

- frontend: worktree-derived port, for example `http://127.0.0.1:3045`
- backend: matching worktree-derived port, for example `http://127.0.0.1:8045`
- Chrome CDP: matching worktree-derived port, for example `http://127.0.0.1:9267/json/version`
- main reference frontend/backend/CDP: forwarded too when the selected target
  is not already `main`

Browser-open defaults:

- `./remote.sh` opens Setta automatically in a fresh local Chrome instance by default
- `--no-open` disables that behavior for one run
- `--open` forces it back on for one run
- `SETTA_AWS_DEVBOX_OPEN_BROWSER=0|1` changes the repo-local default
- `SETTA_AWS_DEVBOX_BROWSER_APP` overrides the browser app name used with `open -na ...`
- `SETTA_AWS_DEVBOX_BROWSER_PROFILE_DIR` overrides the dedicated local browser profile dir
- `SETTA_AWS_DEVBOX_LOCAL_FRONTEND_PORT` can override the locally forwarded frontend port
- `SETTA_AWS_DEVBOX_LOCAL_MAIN_FRONTEND_PORT`,
  `SETTA_AWS_DEVBOX_LOCAL_MAIN_SETTA_PORT`, and
  `SETTA_AWS_DEVBOX_LOCAL_MAIN_CDP_PORT` override the forwarded `main`
  reference ports when needed
- `SETTA_AWS_DEVBOX_SYNC_CODEX_AUTH=0|1` disables or enables the remote Codex auth sync
- `SETTA_AWS_DEVBOX_CODEX_AUTH_FILE` overrides the local `auth.json` path used for that sync
- `SETTA_AWS_DEVBOX_REMOTE_MAIN_REFERENCE_BRANCH` changes which branch is
  treated as the default reference checkout (defaults to `main`)
- `SETTA_AWS_DEVBOX_REMOTE_MAIN_REFERENCE_ROOT` overrides the remote path used
  for that default reference checkout
- `SETTA_AWS_DEVBOX_REMOTE_MAIN_REFERENCE_WAIT_SECONDS` controls how long
  `remote.sh` waits for the default `main` reference runtime before it continues
  without forwarding the reference ports yet (defaults to `30`)

Codex auth sync notes:

- OpenAI documents remote/headless Codex login via `codex login --device-auth`
  or by copying `~/.codex/auth.json` from a machine where browser login already
  worked
- `./remote.sh` uses that second path automatically when the local auth file exists
- if your local Codex login is stored only in keychain/keyring and
  `~/.codex/auth.json` does not exist, automatic sync will skip; in that case
  either switch local Codex to file-based credential storage or run
  `codex login --device-auth` on the remote box

Fallback/admin path:

```sh
./aws.sh ssm-shell
```

Legacy standalone tunnel commands still exist if you intentionally want them:

```sh
./aws.sh tunnel-setta
./aws.sh tunnel-cdp
```

When you want to close all active port-forward sessions for this devbox and the
current AWS caller:

```sh
./remote-kill.sh
```

`./remote-kill.sh` now stops the devbox instance, which is the only
consistently meaningful "kill" action in the integrated SSH runtime flow.

## Recovery

If the instance exists but feels stale:

1. Check the current state:

```sh
./aws.sh status
```

2. Stop it cleanly:

```sh
./remote-kill.sh
```

3. Start it again and wait for SSM online:

```sh
./aws.sh up
```

4. Reattach the `tmux` session and restart only the pieces you need.

If cloud-init or package installs failed, inspect:

- `/var/log/cloud-init-output.log`
- `/var/log/cloud-init.log`

## Rotate Or Recreate

When the box should be replaced instead of repaired:

```sh
./aws-infra.sh destroy
./aws-infra.sh apply
```

This intentionally treats the instance as disposable. Durable state should live
in git or separately managed storage, not only on the instance disk.

## Safe Stop

Before stopping the instance:

1. Exit any long-running remote commands you care about.
2. Detach or close the SSH/tmux client you do not need.
3. Stop the EC2 instance:

```sh
./remote-kill.sh
```

Stopping preserves the EBS root volume and avoids compute charges.
