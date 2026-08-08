import tempfile
from pathlib import Path

from setta.start import _render_startup_message
from setta.types.routes import Route


def test_startup_message_auto_open() -> None:
    message = _render_startup_message(
        session_id="abc123",
        host="127.0.0.1",
        port=61234,
        workspace_path=Path("/work/project"),
        bootstrap_url_fragment="http://127.0.0.1:61234/__setta__/bootstrap#token=tok",
        bootstrap_url_plain="http://127.0.0.1:61234/__setta__/bootstrap",
        token="tok",
        auto_open=True,
        is_remote_session=False,
    )

    assert "Setta running (session abc123)" in message
    assert "Bind: 127.0.0.1:61234 (remote only)" in message
    assert "Opening browser to:" in message
    assert "/__setta__/bootstrap#token=tok" in message
    assert "Manual tunnel" not in message


def test_startup_message_manual_tunnel() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        workspace = Path(temp_dir) / "my project"
        workspace.mkdir()

        message = _render_startup_message(
            session_id="def456",
            host="127.0.0.1",
            port=61234,
            workspace_path=workspace,
            bootstrap_url_fragment="http://127.0.0.1:61234/__setta__/bootstrap#token=tok2",
            bootstrap_url_plain="http://127.0.0.1:61234/__setta__/bootstrap",
            token="tok2",
            auto_open=False,
            is_remote_session=True,
        )

    assert "Manual tunnel" in message
    assert "LOCAL_PORT=61000" in message
    assert f"ssh -N -L ${'{'}LOCAL_PORT{'}'}:127.0.0.1:61234" in message
    assert f"{Route.BOOTSTRAP_PAGE.value}#token=tok2" in message
    assert f"{Route.BOOTSTRAP_PAGE.value}" in message
    assert "and paste:" in message
    assert "tok2" in message
    assert "--workspace '" in message
    assert "' --session def456" in message
