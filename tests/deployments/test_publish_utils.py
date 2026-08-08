from pathlib import Path

from fastapi import HTTPException
import pytest

from setta.deployments.publish_utils import (
    normalize_deployment_name,
    resolve_deployment_relative_path,
)


class TestPublishUtils:
    def test_normalize_deployment_name_rejects_dot_segments(self) -> None:
        with pytest.raises(HTTPException) as ctx:
            normalize_deployment_name(".")
        assert ctx.value.status_code == 400
        with pytest.raises(HTTPException) as ctx:
            normalize_deployment_name("..")
        assert ctx.value.status_code == 400

    def test_normalize_deployment_name_rejects_path_segments(self) -> None:
        with pytest.raises(HTTPException) as ctx:
            normalize_deployment_name("a/b")
        assert ctx.value.status_code == 400

    def test_resolve_deployment_relative_path_rejects_absolute(self, tmp_path: Path) -> None:
        deployment_root = tmp_path / "deployment"
        deployment_root.mkdir()
        with pytest.raises(HTTPException) as ctx:
            resolve_deployment_relative_path(Path("/tmp/abs.json"), deployment_root)
        assert ctx.value.status_code == 400

    def test_resolve_deployment_relative_path_rejects_escape(self, tmp_path: Path) -> None:
        deployment_root = tmp_path / "deployment"
        deployment_root.mkdir()
        with pytest.raises(HTTPException) as ctx:
            resolve_deployment_relative_path(Path("../outside.json"), deployment_root)
        assert ctx.value.status_code == 400

    def test_resolve_deployment_relative_path_allows_nested(self, tmp_path: Path) -> None:
        deployment_root = tmp_path / "deployment"
        deployment_root.mkdir()
        resolved = resolve_deployment_relative_path(
            Path("json_sources/source.json"), deployment_root
        )
        assert resolved == (deployment_root / "json_sources/source.json").resolve()

