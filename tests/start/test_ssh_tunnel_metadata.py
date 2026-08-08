import json
from pathlib import Path

from setta import ssh_connect


def test_write_tunnel_metadata_excludes_sensitive_connection_fields(tmp_path: Path) -> None:
    metadata = ssh_connect.SshTunnelMetadata(
        keyHash="0" * 64,
        remoteHost="example.com",
        remotePort=8000,
        localPort=61000,
        pid=123,
        pidCreateTime=1.23,
        createdAt="2025-01-01T00:00:00+00:00",
        lastUsedAt="2025-01-01T00:00:00+00:00",
    )
    path = tmp_path / "tunnel.json"
    ssh_connect._write_tunnel_metadata(path, metadata)

    payload = json.loads(path.read_text(encoding="utf-8"))

    assert "sshTarget" not in payload
    assert "sshArgs" not in payload
    assert "key" not in payload
    assert payload["keyHash"] == "0" * 64
