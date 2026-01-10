import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import HTTPException, status

from setta.share.policy import ensure_share_deployment_path


class SharePathGuardTests(unittest.TestCase):
    def test_relative_path_resolves_under_deployment_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "share_deployment"
            (root / "artifacts").mkdir(parents=True, exist_ok=True)
            resolved = ensure_share_deployment_path(
                "artifacts/example.png",
                root,
            )
            self.assertEqual(
                (root / "artifacts" / "example.png").resolve(),
                resolved,
            )

    def test_absolute_path_resolves_under_deployment_root(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "share_deployment"
            artifact_path = root / "artifacts" / "example.png"
            artifact_path.parent.mkdir(parents=True, exist_ok=True)
            resolved = ensure_share_deployment_path(
                str(artifact_path),
                root,
            )
            self.assertEqual(artifact_path.resolve(), resolved)

    def test_path_outside_deployment_root_is_forbidden(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "share_deployment"
            root.mkdir(parents=True, exist_ok=True)
            with self.assertRaises(HTTPException) as ctx:
                ensure_share_deployment_path("../secrets.txt", root)
            self.assertEqual(
                status.HTTP_403_FORBIDDEN,
                ctx.exception.status_code,
            )


if __name__ == "__main__":
    unittest.main()
