import importlib.util
import os
import tempfile
import unittest
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_harness_module():
    module_path = repo_root() / "scripts" / "backend_differential_parity.py"
    spec = importlib.util.spec_from_file_location(
        "backend_differential_parity", module_path
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BackendDifferentialParityTests(unittest.TestCase):
    def test_extract_bootstrap_token_prefers_token_line(self) -> None:
        harness = load_harness_module()

        log_text = """
        Setta running (session abc123)
        Bootstrap URL (recommended):
          http://127.0.0.1:61234/__setta__/bootstrap#token=url-token

        Manual token entry:
          http://127.0.0.1:61234/__setta__/bootstrap
          Token: manual-token
        """

        self.assertEqual(harness.extract_bootstrap_token(log_text), "manual-token")

    def test_load_manifest_resolves_relative_fixture_paths(self) -> None:
        harness = load_harness_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            fixtures_dir = root / "fixtures"
            fixtures_dir.mkdir(parents=True)
            fixture_path = fixtures_dir / "project.json"
            fixture_path.write_text(
                '{"schemaVersion":1,"projects":{}}', encoding="utf-8"
            )

            manifest_path = root / "manifest.yaml"
            manifest_path.write_text(
                """
scenarios:
  - name: fixture_scenario
    kind: latest_state_empty_callable_shown_param_ids
    seed: fixture
    fixture: fixtures/project.json
""".strip()
                + "\n",
                encoding="utf-8",
            )

            scenarios = harness.load_manifest(manifest_path)

            self.assertEqual(len(scenarios), 1)
            self.assertEqual(scenarios[0].fixture, fixture_path.resolve())

    def test_summarize_frontend_inventory_normalizes_connection_type_case(self) -> None:
        harness = load_harness_module()

        messages = [
            {
                "messageType": "FrontendIdentity",
                "content": {"frontendAffinityToken": "abc"},
            },
            {
                "messageType": "AllConnections",
                "content": [
                    {"id": "frontend-a", "connectionType": "frontend"},
                    {"id": "server-a", "connectionType": "SERVER"},
                ],
            },
        ]

        summary = harness.summarize_frontend_inventory(messages)

        self.assertEqual(
            summary,
            {
                "frontendIdentityReceived": True,
                "allConnectionsReceived": True,
                "connectionCount": 2,
                "connectionTypes": ["FRONTEND", "SERVER"],
                "hasServerConnection": True,
                "frontendConnectionCount": 1,
            },
        )

    def test_resolve_frontend_websocket_route_reads_go_route(self) -> None:
        harness = load_harness_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            routes_path = root / "internal" / "wsapi" / "routes.go"
            routes_path.parent.mkdir(parents=True)
            routes_path.write_text(
                """
package wsapi

const (
    RouteFrontend = "/ws/frontend"
)
""".strip()
                + "\n",
                encoding="utf-8",
            )

            self.assertEqual(
                harness.resolve_frontend_websocket_route(root),
                "/ws/frontend",
            )

    def test_resolve_frontend_websocket_route_reads_python_route(self) -> None:
        harness = load_harness_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            routes_path = root / "backend" / "setta" / "types" / "routes.py"
            routes_path.parent.mkdir(parents=True)
            routes_path.write_text(
                """
class Route:
    PREFIX = "/api"
    WEBSOCKET_FRONTEND = "/frontend"
""".strip()
                + "\n",
                encoding="utf-8",
            )

            self.assertEqual(
                harness.resolve_frontend_websocket_route(root),
                "/api/frontend",
            )

    def test_build_backend_env_uses_go_launcher_when_present(self) -> None:
        harness = load_harness_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            go_entrypoint = root / "cmd" / "setta" / "main.go"
            go_entrypoint.parent.mkdir(parents=True)
            go_entrypoint.write_text("package main\n", encoding="utf-8")
            original_setta_bin = os.environ.get("SETTA_BIN")
            original_setta_server_bin = os.environ.get("SETTA_SERVER_BIN")
            self.addCleanup(self._restore_env, "SETTA_BIN", original_setta_bin)
            self.addCleanup(
                self._restore_env,
                "SETTA_SERVER_BIN",
                original_setta_server_bin,
            )
            os.environ["SETTA_BIN"] = "/tmp/python-wrapper"
            os.environ["SETTA_SERVER_BIN"] = "/tmp/stale-setta-server"

            env = harness.build_backend_env(
                target_root=root,
                temp_root=root,
                host="127.0.0.1",
                port=8123,
                setta_home=root / ".setta-home",
                setta_files_root=root / "workspace" / "setta_files",
                frontend_port=3123,
            )

            self.assertNotIn("SETTA_BIN", env)
            self.assertNotIn("SETTA_SERVER_BIN", env)
            self.assertEqual(env["SETTA_HOST"], "127.0.0.1")
            self.assertEqual(env["SETTA_PORT"], "8123")
            self.assertEqual(env["SETTA_DEV_FRONTEND_PORT"], "3123")
            self.assertEqual(
                env["PYTHONPATH"],
                str(root / "backend"),
            )

    def test_build_backend_env_uses_python_wrapper_when_go_launcher_missing(self) -> None:
        harness = load_harness_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)

            env = harness.build_backend_env(
                target_root=root,
                temp_root=root,
                host="127.0.0.1",
                port=8123,
                setta_home=root / ".setta-home",
                setta_files_root=root / "workspace" / "setta_files",
                frontend_port=3123,
            )

            self.assertIn("SETTA_BIN", env)
            self.assertTrue(env["SETTA_BIN"].endswith("setta-wrapper.sh"))
            self.assertNotIn("SETTA_SERVER_BIN", env)

    def test_summarize_empty_callable_latest_state_detects_present_entry(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projectState": {
                "shownParamIds": {
                    "empty-callable-variant": {
                        "pinned": {
                            "topLevelParamIds": [],
                            "requiredParamIdsToPaths": {},
                        },
                        "unpinned": {
                            "topLevelParamIds": [],
                            "requiredParamIdsToPaths": {},
                        },
                    }
                }
            }
        }

        summary = harness.summarize_empty_callable_latest_state(
            http_status=200,
            payload=payload,
        )

        self.assertEqual(
            summary,
            {
                "httpStatus": 200,
                "shownParamEntryPresent": True,
                "pinnedTopLevelParamIds": [],
                "unpinnedTopLevelParamIds": [],
                "pinnedRequiredPathCount": 0,
                "unpinnedRequiredPathCount": 0,
            },
        )

    def test_summarize_latest_state_after_create_project_detects_defaults(self) -> None:
        harness = load_harness_module()

        payload = {
            "projectState": {
                "projectConfig": {
                    "id": "project-1",
                    "name": "Example project",
                    "viewModes": {"view-mode-1": {"id": "view-mode-1"}},
                    "activeViewModeId": "view-mode-1",
                    "isEditingViewMode": False,
                    "topLevelSections": {},
                },
                "shownParamIds": {},
            }
        }

        summary = harness.summarize_latest_state_after_create_project(
            http_status=200,
            payload=payload,
        )

        self.assertEqual(
            summary,
            {
                "httpStatus": 200,
                "projectIDPresent": True,
                "projectNamePresent": True,
                "viewModeCount": 1,
                "activeViewModeIdPresent": True,
                "activeViewModePresentInMap": True,
                "isEditingViewMode": False,
                "topLevelSectionCount": 0,
                "shownParamEntryCount": 0,
            },
        )

    def test_summarize_settings_project_shell_detects_expected_contract(self) -> None:
        harness = load_harness_module()

        payload = {
            "projectConfig": {
                "id": "settings",
                "name": "settings",
                "activeViewModeId": "settings-core",
                "showParamDisplayNames": True,
                "allowJsonSourceKeyEdits": False,
                "viewModes": {
                    "settings-all": {
                        "id": "settings-all",
                        "name": "All Settings",
                        "sortIndex": 4,
                        "visibilityBySectionId": {
                            "section-a": True,
                            "section-b": True,
                        },
                    },
                    "settings-core": {
                        "id": "settings-core",
                        "name": "Core",
                        "sortIndex": 0,
                        "visibilityBySectionId": {
                            "section-a": True,
                            "section-b": False,
                        },
                    },
                },
            },
            "sections": {
                "section-a": {"name": "backend"},
                "section-b": {"name": "gui"},
            },
            "projectChatWindowing": {
                "instancesById": {},
                "nextInstanceNumber": 1,
                "order": [],
            },
        }
        latest_payload = {
            "projectState": {
                "projectConfig": {
                    "id": "settings",
                    "name": "settings",
                }
            }
        }

        summary = harness.summarize_settings_project_shell(
            http_status=200,
            payload=payload,
            latest_http_status=200,
            latest_payload=latest_payload,
        )

        self.assertEqual(
            summary,
            {
                "httpStatus": 200,
                "latestHttpStatus": 200,
                "projectName": "settings",
                "sectionCount": 2,
                "sectionNames": ["backend", "gui"],
                "viewModeCount": 2,
                "viewModeNames": ["Core", "All Settings"],
                "activeViewModeName": "Core",
                "countsByView": {
                    "Core": 1,
                    "All Settings": 2,
                },
                "showParamDisplayNames": True,
                "allowJsonSourceKeyEdits": False,
                "projectChatWindowingKeys": [
                    "instancesById",
                    "nextInstanceNumber",
                    "order",
                ],
                "latestProjectName": "settings",
                "latestProjectIDMatchesLoadProjectID": True,
            },
        )

    def test_summarize_settings_project_live_hydration_detects_loaded_value(
        self,
    ) -> None:
        harness = load_harness_module()

        load_payload = {
            "sections": {
                "backend-section": {
                    "name": "backend",
                    "defaultVariant": "backend-section-variant",
                }
            },
            "sectionVariants": {
                "backend-section-variant": {
                    "impl": "backend-section-impl",
                }
            },
            "sectionImpls": {
                "backend-section-impl": {
                    "topLevelParamId": "backend-root",
                }
            },
            "codeObjs": {
                "backend-root": {
                    "name": "backend",
                    "defaultVariant": "backend-root-variant",
                },
                "rename-setting": {
                    "name": "renameRefactorMode",
                    "defaultVariant": "rename-setting-variant",
                },
            },
            "codeObjVariants": {
                "backend-root-variant": {
                    "impl": "backend-root-impl",
                },
                "rename-setting-variant": {
                    "impl": "rename-setting-impl",
                },
            },
            "codeObjImpls": {
                "backend-root-impl": {
                    "children": ["rename-setting"],
                },
                "rename-setting-impl": {
                    "value": "NEVER_RENAME",
                },
            },
        }
        latest_payload = {
            "projectState": load_payload,
        }

        summary = harness.summarize_settings_project_live_hydration(
            save_http_status=200,
            save_payload=None,
            load_http_status=200,
            load_payload=load_payload,
            latest_http_status=200,
            latest_payload=latest_payload,
        )

        self.assertEqual(
            summary,
            {
                "saveHttpStatus": 200,
                "loadHttpStatus": 200,
                "latestHttpStatus": 200,
                "loadedRenameRefactorMode": "NEVER_RENAME",
                "latestRenameRefactorMode": "NEVER_RENAME",
            },
        )

    def test_summarize_settings_project_live_hydration_supports_python_payload_shape(
        self,
    ) -> None:
        harness = load_harness_module()

        load_payload = {
            "sections": {
                "backend-section": {
                    "name": "backend",
                    "defaultVariant": "backend-section-variant",
                    "sharedModifier": {
                        "children": ["rename-setting"],
                    },
                }
            },
            "codeObjs": {
                "rename-setting": {
                    "name": "renameRefactorMode",
                    "defaultVariant": "rename-setting-variant",
                    "sharedModifier": {},
                },
            },
            "codeObjVariants": {
                "rename-setting-variant": {
                    "impl": "rename-setting-impl",
                    "modifier": {
                        "value": "\"NEVER_RENAME\"",
                    },
                },
            },
            "codeObjImpls": {
                "rename-setting-impl": {
                    "value": "",
                }
            },
        }

        summary = harness.summarize_settings_project_live_hydration(
            save_http_status=200,
            save_payload=None,
            load_http_status=200,
            load_payload=load_payload,
            latest_http_status=None,
            latest_payload=None,
        )

        self.assertEqual(
            summary,
            {
                "saveHttpStatus": 200,
                "loadHttpStatus": 200,
                "latestHttpStatus": None,
                "loadedRenameRefactorMode": "NEVER_RENAME",
            },
        )

    def test_settings_store_view_mode_names_supports_go_store_shape(self) -> None:
        harness = load_harness_module()

        payload = {
            "projects": {
                "settings": {
                    "viewModes": {
                        "settings-all": {
                            "id": "settings-all",
                            "name": "All Settings",
                            "sortIndex": 4,
                        },
                        "settings-core": {
                            "id": "settings-core",
                            "name": "Core",
                            "sortIndex": 0,
                        },
                    }
                }
            }
        }

        self.assertEqual(
            harness.settings_store_view_mode_names(payload),
            ["Core", "All Settings"],
        )

    def test_summarize_settings_project_required_view_mode_repair_detects_restored_tab(
        self,
    ) -> None:
        harness = load_harness_module()

        restart_load_payload = {
            "projectConfig": {
                "viewModes": {
                    "settings-all": {
                        "id": "settings-all",
                        "name": "All Settings",
                        "sortIndex": 4,
                    },
                    "settings-core": {
                        "id": "settings-core",
                        "name": "Core",
                        "sortIndex": 0,
                    },
                }
            }
        }
        restart_latest_payload = {
            "projectState": restart_load_payload,
        }
        persisted_payload = {
            "projects": {
                "settings": {
                    "viewModes": {
                        "settings-all": {
                            "id": "settings-all",
                            "name": "All Settings",
                            "sortIndex": 4,
                        },
                        "settings-core": {
                            "id": "settings-core",
                            "name": "Core",
                            "sortIndex": 0,
                        },
                    }
                }
            }
        }
        pre_restart_latest_payload = {
            "projectState": {
                "projectConfig": {
                    "viewModes": {
                        "settings-core": {
                            "id": "settings-core",
                            "name": "Core",
                            "sortIndex": 0,
                        }
                    }
                }
            }
        }

        summary = harness.summarize_settings_project_required_view_mode_repair(
            initial_load_http_status=200,
            delete_http_status=200,
            pre_restart_latest_http_status=200,
            pre_restart_latest_payload=pre_restart_latest_payload,
            restart_load_http_status=200,
            restart_load_payload=restart_load_payload,
            restart_latest_http_status=200,
            restart_latest_payload=restart_latest_payload,
            persisted_payload=persisted_payload,
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "deleteHttpStatus": 200,
                "restartLoadHttpStatus": 200,
                "restartLatestHttpStatus": 200,
                "restartLoadViewModeCount": 2,
                "restartLoadViewModeNames": ["Core", "All Settings"],
                "restartLoadHasAllSettings": True,
                "restartLatestViewModeCount": 2,
                "restartLatestViewModeNames": ["Core", "All Settings"],
                "restartLatestHasAllSettings": True,
                "persistedViewModeCount": 2,
                "persistedViewModeNames": ["Core", "All Settings"],
                "persistedHasAllSettings": True,
            },
        )

    def test_summarize_persisted_project_windowing_after_create_detects_defaults(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projects": {
                "project-1": {
                    "projectChatWindowing": {
                        "instancesById": {},
                        "order": [],
                        "nextInstanceNumber": 1,
                    }
                }
            }
        }

        summary = harness.summarize_persisted_project_windowing_after_create(
            project_id="project-1",
            payload=payload,
        )

        self.assertEqual(
            summary,
            {
                "projectPresent": True,
                "projectChatWindowingPresent": True,
                "projectChatWindowCount": 0,
                "projectChatWindowOrderCount": 0,
                "nextInstanceNumber": 1,
            },
        )

    def test_summarize_persisted_project_windowing_after_create_accepts_source_shape(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projectConfigs": {"project-1": {"name": "Example project"}},
            "projectChatWindowingByProjectConfigId": {
                "project-1": {
                    "instancesById": {},
                    "order": [],
                    "nextInstanceNumber": 1,
                }
            },
        }

        summary = harness.summarize_persisted_project_windowing_after_create(
            project_id="project-1",
            payload=payload,
        )

        self.assertEqual(
            summary,
            {
                "projectPresent": True,
                "projectChatWindowingPresent": True,
                "projectChatWindowCount": 0,
                "projectChatWindowOrderCount": 0,
                "nextInstanceNumber": 1,
            },
        )

    @staticmethod
    def _restore_env(key: str, value: str | None) -> None:
        if value is None:
            os.environ.pop(key, None)
            return
        os.environ[key] = value


if __name__ == "__main__":
    unittest.main()
