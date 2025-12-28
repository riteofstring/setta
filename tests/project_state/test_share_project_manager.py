import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.project_state.share_project_manager import ShareProjectManager
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest


def _write_project(
    root: Path,
    project_configs: list[ProjectConfig],
    default_id: str | None,
) -> DBE:
    dbe = DBE(root)
    project_state = ProjectStateBackend(
        projectConfigs={config.id: config for config in project_configs},
        defaultProjectConfigId=default_id,
    )
    dbe.write_project(project_state)
    return dbe


class ShareProjectManagerTests(unittest.TestCase):
    def test_manifest_project_config_selection(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config_a = ProjectConfig(name="alpha")
            config_b = ProjectConfig(name="beta")
            dbe = _write_project(root, [config_a, config_b], config_a.id)
            manifest = ShareDeploymentManifest(
                version=1,
                projectConfigId=config_b.id,
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            manager = ShareProjectManager(dbe, root)
            self.assertEqual(config_b.id, manager.project_config_id)

            session_state = manager.create_session_state("session-a")
            self.assertEqual(config_b.id, session_state.projectConfig.id)

    def test_manifest_missing_project_config_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = ProjectConfig(name="alpha")
            dbe = _write_project(root, [config], config.id)
            manifest = ShareDeploymentManifest(
                version=1,
                projectConfigId=create_new_id(),
            )
            dbe.write_json(root / "manifest.json", manifest.model_dump())

            with self.assertRaises(KeyError):
                ShareProjectManager(dbe, root)

    def test_missing_project_configs_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            dbe = DBE(root)
            dbe.write_project(ProjectStateBackend())

            with self.assertRaises(KeyError):
                ShareProjectManager(dbe, root)

    def test_session_state_isolation(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = ProjectConfig(name="alpha")
            dbe = _write_project(root, [config], config.id)
            manager = ShareProjectManager(dbe, root)

            session_a = manager.create_session_state("session-a")
            session_b = manager.create_session_state("session-b")
            original_name = session_b.projectConfig.name

            session_a.projectConfig.name = "changed"

            self.assertEqual(original_name, session_b.projectConfig.name)
            self.assertNotEqual(session_a.projectConfig.name, session_b.projectConfig.name)

    def test_unknown_session_state_raises(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            config = ProjectConfig(name="alpha")
            dbe = _write_project(root, [config], config.id)
            manager = ShareProjectManager(dbe, root)
            existing_state = manager.create_session_state("session-a")

            with self.assertRaises(KeyError):
                manager.get_session_state("missing")
            with self.assertRaises(KeyError):
                manager.update_session_state("missing", existing_state)
            with self.assertRaises(KeyError):
                manager.delete_session_state("missing")
            with self.assertRaises(KeyError):
                manager.create_session_state("session-a")


if __name__ == "__main__":
    unittest.main()
