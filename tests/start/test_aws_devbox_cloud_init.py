from pathlib import Path


def test_cloud_init_syncs_forwarded_ssh_agent_into_tmux_session() -> None:
    # The remote shell runs inside tmux, so the bootstrap must refresh the
    # session's SSH_AUTH_SOCK on each attach. Otherwise git in tmux can keep a
    # stale forwarded-agent socket from an older SSH session.
    cloud_init = (
        Path(__file__).resolve().parents[2]
        / "infra"
        / "aws-devbox"
        / "cloud-init.yaml"
    ).read_text(encoding="utf-8")

    assert 'tmux set-environment -t setta SSH_AUTH_SOCK "$${SSH_AUTH_SOCK}"' in cloud_init
    assert 'tmux set-environment -t setta -r SSH_AUTH_SOCK' in cloud_init


def test_cloud_init_configures_github_ssh_for_forwarded_agent_security_keys() -> None:
    # Remote git operations should use the forwarded laptop agent for github.com
    # and force unbound pubkey auth so Yubi-backed SK keys do not hit the
    # host-bound agent-signing path.
    cloud_init = (
        Path(__file__).resolve().parents[2]
        / "infra"
        / "aws-devbox"
        / "cloud-init.yaml"
    ).read_text(encoding="utf-8")

    assert "Host github.com" in cloud_init
    assert "PubkeyAuthentication unbound" in cloud_init
    assert "IdentityAgent SSH_AUTH_SOCK" in cloud_init


def test_cloud_init_installs_codex_cli_with_file_based_auth_storage() -> None:
    # The devbox should recreate with Codex ready on PATH, and headless auth
    # sync should land in ~/.codex/auth.json instead of depending on keyring
    # availability on the remote Ubuntu box.
    cloud_init = (
        Path(__file__).resolve().parents[2]
        / "infra"
        / "aws-devbox"
        / "cloud-init.yaml"
    ).read_text(encoding="utf-8")

    assert "npm install -g @openai/codex@latest" in cloud_init
    assert 'install -d -m 0700 "$HOME/.codex"' in cloud_init
    assert 'cli_auth_credentials_store = "file"' in cloud_init


def test_cloud_init_installs_ghostty_terminfo_and_enables_tmux_extended_keys() -> None:
    # Ghostty sends modified keys such as Shift+Enter via its own terminfo and
    # tmux needs extended-key support enabled to pass them through to apps on
    # the devbox.
    cloud_init = (
        Path(__file__).resolve().parents[2]
        / "infra"
        / "aws-devbox"
        / "cloud-init.yaml"
    ).read_text(encoding="utf-8")

    assert "/usr/local/share/setta-devbox/terminfo/xterm-ghostty.terminfo" in cloud_init
    assert (
        "tic -x -o /home/ubuntu/.terminfo "
        "/usr/local/share/setta-devbox/terminfo/xterm-ghostty.terminfo"
    ) in cloud_init
    assert 'set -s extended-keys on' in cloud_init
    assert 'set -s extended-keys-format csi-u' in cloud_init
    assert "xterm-ghostty:extkeys,RGB" in cloud_init
    assert (
        'bind c new-window -c "#{?pane_current_path,#{pane_current_path},/home/ubuntu/dev}"'
        in cloud_init
    )
    assert (
        'bind \'"\' split-window -v -c "#{?pane_current_path,#{pane_current_path},/home/ubuntu/dev}"'
        in cloud_init
    )
    assert (
        'bind % split-window -h -c "#{?pane_current_path,#{pane_current_path},/home/ubuntu/dev}"'
        in cloud_init
    )
    assert 'tmux source-file "$${HOME}/.tmux.conf"' in cloud_init
