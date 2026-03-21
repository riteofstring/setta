import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock


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

    def test_seed_setta_files_fixture_converts_go_payload_for_python_target(
        self,
    ) -> None:
        harness = load_harness_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            fixture_path = (
                repo_root() / "scripts" / "parity-fixtures" / "empty-callable-project.json"
            )
            scenario = harness.ScenarioConfig(
                name="fixture_scenario",
                kind="latest_state_empty_callable_shown_param_ids",
                seed="fixture",
                fixture=fixture_path,
                description=None,
            )
            target_root = root / "baseline"
            target_root.mkdir(parents=True)
            setta_files_root = root / "workspace" / "setta_files"

            harness.seed_setta_files(
                setta_files_root=setta_files_root,
                scenario=scenario,
                target=harness.RefTarget(label="baseline:main", root=target_root),
            )

            payload = json.loads(
                (setta_files_root / harness.PROJECT_FILE_NAME).read_text(
                    encoding="utf-8"
                )
            )

            self.assertEqual(payload["defaultProjectConfigId"], "project-alpha")
            self.assertNotIn("defaultProjectId", payload)
            self.assertNotIn("projects", payload)
            self.assertNotIn("schemaVersion", payload)
            self.assertEqual(
                payload["projectChatWindowingByProjectConfigId"]["project-alpha"],
                {"instancesById": {}, "order": []},
            )
            self.assertEqual(
                payload["projectConfigs"]["project-alpha"],
                {
                    "allowJsonSourceKeyEdits": True,
                    "id": "project-alpha",
                    "name": "Project Alpha",
                    "sectionVariantMap": {
                        "empty-callable-section": "empty-callable-variant"
                    },
                },
            )
            self.assertEqual(
                payload["sectionImpls"]["empty-callable-impl"],
                {
                    "callable": None,
                    "codeObjVariantMap": {},
                    "id": "empty-callable-impl",
                    "type": "Callable",
                },
            )
            self.assertEqual(
                payload["sectionVariants"]["empty-callable-variant"],
                {
                    "id": "empty-callable-variant",
                    "impl": "empty-callable-impl",
                    "name": "Empty Callable Variant",
                    "nonPresetImpls": ["empty-callable-impl"],
                },
            )
            self.assertEqual(
                payload["sections"]["empty-callable-section"],
                {
                    "defaultVariant": "empty-callable-variant",
                    "id": "empty-callable-section",
                    "name": "Empty Callable Section",
                    "variants": ["empty-callable-variant"],
                },
            )

    def test_seed_setta_files_fixture_preserves_go_payload_for_go_target(self) -> None:
        harness = load_harness_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            fixture_path = (
                repo_root() / "scripts" / "parity-fixtures" / "empty-callable-project.json"
            )
            scenario = harness.ScenarioConfig(
                name="fixture_scenario",
                kind="latest_state_empty_callable_shown_param_ids",
                seed="fixture",
                fixture=fixture_path,
                description=None,
            )
            target_root = root / "current"
            go_entrypoint = target_root / "cmd" / "setta" / "main.go"
            go_entrypoint.parent.mkdir(parents=True)
            go_entrypoint.write_text("package main\n", encoding="utf-8")
            setta_files_root = root / "workspace" / "setta_files"

            harness.seed_setta_files(
                setta_files_root=setta_files_root,
                scenario=scenario,
                target=harness.RefTarget(label="current", root=target_root),
            )

            payload = json.loads(
                (setta_files_root / harness.PROJECT_FILE_NAME).read_text(
                    encoding="utf-8"
                )
            )

            self.assertEqual(payload["defaultProjectId"], "project-alpha")
            self.assertEqual(
                payload["projects"]["project-alpha"]["sectionVariants"][
                    "empty-callable-variant"
                ],
                {
                    "id": "empty-callable-variant",
                    "implId": "empty-callable-impl",
                    "name": "Empty Callable Variant",
                },
            )
            self.assertNotIn("defaultProjectConfigId", payload)

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

    def test_open_backend_session_passes_workspace_root_flag(self) -> None:
        harness = load_harness_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            target_root = temp_root / "target"
            target_root.mkdir(parents=True)
            workspace_root = temp_root / "workspace"
            setta_home = temp_root / ".setta-home"
            setta_files_root = workspace_root / "setta_files"
            log_path = temp_root / "backend.log"

            fake_process = mock.Mock()
            fake_session = mock.Mock()

            with (
                mock.patch.object(harness, "find_free_port", side_effect=[8123, 3123]),
                mock.patch.object(
                    harness,
                    "resolve_frontend_websocket_route",
                    return_value="/ws/frontend",
                ),
                mock.patch.object(harness, "build_backend_env", return_value={}),
                mock.patch.object(
                    harness,
                    "wait_for_bootstrap_token",
                    return_value="bootstrap-token",
                ),
                mock.patch.object(
                    harness,
                    "bootstrap_session",
                    return_value=fake_session,
                ),
                mock.patch.object(harness, "wait_for_backend_ready"),
                mock.patch.object(
                    harness.subprocess,
                    "Popen",
                    return_value=fake_process,
                ) as popen_mock,
            ):
                session = harness.open_backend_session(
                    target=harness.RefTarget(label="current", root=target_root),
                    temp_root=temp_root,
                    workspace_root=workspace_root,
                    setta_home=setta_home,
                    setta_files_root=setta_files_root,
                    log_path=log_path,
                )

            self.assertIs(session.session, fake_session)
            self.assertEqual(session.workspace_root, workspace_root)
            self.assertEqual(session.base_url, "http://127.0.0.1:8123")
            self.assertEqual(session.websocket_url, "ws://127.0.0.1:8123/ws/frontend")

            command = popen_mock.call_args.args[0]
            self.assertEqual(
                command,
                [
                    "bash",
                    "./frontend/backendStart.sh",
                    "--no-open",
                    "--workspace",
                    str(workspace_root),
                ],
            )

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
                "windowSpaces": {},
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
                "windowSpacesObjectPresent": True,
                "shownParamEntryCount": 0,
            },
        )

    def test_summarize_settings_project_shell_detects_expected_contract(self) -> None:
        harness = load_harness_module()
        workspace_root = "/tmp/workspace"
        shared_settings_path = (
            f"{workspace_root}/setta_files/setta-settings.json"
        )

        sections = {
            "section-a": {"name": "shortcuts", "displayName": "Shortcuts"},
            "section-b": {"name": "gui", "displayName": ""},
            "section-c": {"name": "backend", "displayName": "Backend"},
            "section-d": {
                "name": "sectionSizingPolicy",
                "displayName": "Section Sizing Policy",
            },
            "section-e": {"name": "languageServer", "displayName": ""},
            "section-f": {
                "name": "buttonParamCodeObjDefault",
                "displayName": "Button Param Code Obj Default",
            },
            "section-g": {
                "name": "codeCallableCodeObjDefault",
                "displayName": "Code Callable Code Obj Default",
            },
            "section-h": {
                "name": "codeParamCodeObjDefault",
                "displayName": "Code Param Code Obj Default",
            },
            "section-i": {
                "name": "stateMachineStartSectionDefault",
                "displayName": "State Machine Start Section Default",
            },
            "section-j": {
                "name": "stateMachineGateSectionDefault",
                "displayName": "State Machine Gate Section Default",
            },
            "section-k": {
                "name": "stateMachineEndSectionDefault",
                "displayName": "State Machine End Section Default",
            },
            "section-l": {
                "name": "browserSectionDefault",
                "displayName": "Browser Section Default",
            },
            "section-m": {
                "name": "callableSectionDefault",
                "displayName": "Callable Section Default",
            },
            "section-n": {"name": "chatWindowing", "displayName": "Chat Windowing"},
            "section-o": {
                "name": "iFrameSectionDefault",
                "displayName": "",
            },
            "section-p": {
                "name": "genPythonCodeSectionDefault",
                "displayName": "",
            },
        }
        section_variant_map = {
            section_id: f"{section_id}-variant" for section_id in sections
        }
        section_variants = {
            variant_id: {
                "id": variant_id,
                "name": shared_settings_path,
                "impl": f"{section_id}-impl",
            }
            for section_id, variant_id in section_variant_map.items()
        }
        section_impls = {
            f"{section_id}-impl": {
                "id": f"{section_id}-impl",
                "type": "Dict",
                "configLanguage": "json",
                "isJsonSource": True,
                "jsonSourceKeys": [section["name"]],
                "size": {"width": 550.0},
            }
            for section_id, section in sections.items()
        }
        code_objs = {
            "code-obj-gui": {"name": "gui", "displayName": "GUI"},
            "code-obj-language-server": {
                "name": "languageServer",
                "displayName": "Language Server",
            },
            "code-obj-iframe": {
                "name": "iFrameSectionDefault",
                "displayName": "IFrame Section Default",
            },
            "code-obj-generated-python": {
                "name": "genPythonCodeSectionDefault",
                "displayName": "Generated Python Code Section Default",
            },
        }
        payload = {
            "projectConfig": {
                "id": "settings",
                "name": "settings",
                "activeViewModeId": "settings-core",
                "showParamDisplayNames": True,
                "allowJsonSourceKeyEdits": False,
                "sectionVariantMap": section_variant_map,
                "viewModes": {
                    "settings-core": {
                        "id": "settings-core",
                        "name": "Core",
                        "sortIndex": 0,
                        "viewport": None,
                        "viewportInitialized": False,
                        "visibilityBySectionId": {
                            "section-a": True,
                            "section-b": True,
                            "section-c": True,
                            "section-d": True,
                            "section-e": True,
                            "section-f": False,
                        },
                        "topLevelSections": {
                            "section-a": {"x": 0, "y": 0},
                            "section-b": {"x": 600, "y": 0},
                            "section-c": {"x": 1200, "y": 0},
                            "section-d": {"x": 0, "y": 600},
                            "section-e": {"x": 600, "y": 600},
                        },
                    },
                    "settings-structure-and-code": {
                        "id": "settings-structure-and-code",
                        "name": "Section Defaults Structure and Code",
                        "sortIndex": 1,
                        "viewport": None,
                        "viewportInitialized": False,
                        "visibilityBySectionId": {
                            "section-i": True,
                            "section-j": True,
                            "section-k": True,
                        },
                        "topLevelSections": {
                            "section-i": {"x": 0, "y": 1800},
                            "section-j": {"x": 600, "y": 1800},
                            "section-k": {"x": 1200, "y": 1800},
                        },
                    },
                    "settings-content-and-media": {
                        "id": "settings-content-and-media",
                        "name": "Section Defaults Content and Media",
                        "sortIndex": 2,
                        "viewport": None,
                        "viewportInitialized": False,
                        "visibilityBySectionId": {},
                        "topLevelSections": {},
                    },
                    "settings-param-defaults": {
                        "id": "settings-param-defaults",
                        "name": "Param Defaults",
                        "sortIndex": 3,
                        "viewport": None,
                        "viewportInitialized": False,
                        "visibilityBySectionId": {
                            "section-f": True,
                            "section-g": True,
                            "section-h": True,
                        },
                        "topLevelSections": {
                            "section-f": {"x": 0, "y": 0},
                            "section-g": {"x": 600, "y": 0},
                            "section-h": {"x": 1200, "y": 0},
                        },
                    },
                    "settings-all": {
                        "id": "settings-all",
                        "name": "All Settings",
                        "sortIndex": 4,
                        "viewport": None,
                        "viewportInitialized": False,
                        "visibilityBySectionId": {
                            "section-a": True,
                            "section-b": True,
                            "section-c": True,
                            "section-n": True,
                        },
                        "topLevelSections": {
                            "section-a": {"x": 0, "y": 0},
                            "section-b": {"x": 600, "y": 0},
                            "section-c": {"x": 1200, "y": 0},
                            "section-n": {"x": 0, "y": 600},
                        },
                    },
                },
            },
            "sections": sections,
            "sectionVariants": section_variants,
            "sectionImpls": section_impls,
            "codeObjs": code_objs,
            "projectChatWindowing": {
                "instancesById": {},
                "nextInstanceNumber": 1,
                "order": [],
            },
        }
        latest_payload = {"projectState": payload}

        summary = harness.summarize_settings_project_shell(
            http_status=200,
            payload=payload,
            latest_http_status=200,
            latest_payload=latest_payload,
            workspace_root=workspace_root,
        )

        self.assertEqual(
            summary,
            {
                "httpStatus": 200,
                "latestHttpStatus": 200,
                "projectName": "settings",
                "sectionCount": 16,
                "sectionNames": [
                    "backend",
                    "browserSectionDefault",
                    "buttonParamCodeObjDefault",
                    "callableSectionDefault",
                    "chatWindowing",
                    "codeCallableCodeObjDefault",
                    "codeParamCodeObjDefault",
                    "genPythonCodeSectionDefault",
                    "gui",
                    "iFrameSectionDefault",
                    "languageServer",
                    "sectionSizingPolicy",
                    "shortcuts",
                    "stateMachineEndSectionDefault",
                    "stateMachineGateSectionDefault",
                    "stateMachineStartSectionDefault",
                ],
                "viewModeCount": 5,
                "viewModeNames": [
                    "Core",
                    "Section Defaults Structure and Code",
                    "Section Defaults Content and Media",
                    "Param Defaults",
                    "All Settings",
                ],
                "activeViewModeName": "Core",
                "countsByView": {
                    "Core": 5,
                    "Section Defaults Structure and Code": 3,
                    "Section Defaults Content and Media": 0,
                    "Param Defaults": 3,
                    "All Settings": 4,
                },
                "fixedWidthSectionCount": 16,
                "jsonSourceVariantNameSamples": {
                    "gui": "setta_files/setta-settings.json",
                    "languageServer": "setta_files/setta-settings.json",
                    "iFrameSectionDefault": "setta_files/setta-settings.json",
                    "genPythonCodeSectionDefault": "setta_files/setta-settings.json",
                },
                "jsonSourceConfigLanguageSamples": {
                    "gui": "json",
                    "languageServer": "json",
                    "iFrameSectionDefault": "json",
                    "genPythonCodeSectionDefault": "json",
                },
                "sectionWidthSamples": {
                    "gui": 550.0,
                    "languageServer": 550.0,
                    "iFrameSectionDefault": 550.0,
                    "genPythonCodeSectionDefault": 550.0,
                },
                "sectionDisplayNameSamples": {
                    "gui": "",
                    "languageServer": "",
                    "iFrameSectionDefault": "",
                    "genPythonCodeSectionDefault": "",
                },
                "rootCodeObjDisplayNameSamples": {
                    "gui": "GUI",
                    "languageServer": "Language Server",
                    "iFrameSectionDefault": "IFrame Section Default",
                    "genPythonCodeSectionDefault": "Generated Python Code Section Default",
                },
                "viewModeViewportDefaults": {
                    "Core": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                    "Section Defaults Structure and Code": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                    "Section Defaults Content and Media": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                    "Param Defaults": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                    "All Settings": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                },
                "coreLayoutSentinels": {
                    "shortcuts": {"x": 0.0, "y": 0.0},
                    "gui": {"x": 600.0, "y": 0.0},
                    "backend": {"x": 1200.0, "y": 0.0},
                    "sectionSizingPolicy": {"x": 0.0, "y": 600.0},
                    "languageServer": {"x": 600.0, "y": 600.0},
                },
                "paramLayoutSentinels": {
                    "buttonParamCodeObjDefault": {"x": 0.0, "y": 0.0},
                    "codeCallableCodeObjDefault": {"x": 600.0, "y": 0.0},
                    "codeParamCodeObjDefault": {"x": 1200.0, "y": 0.0},
                },
                "structureWorkflowLayoutSentinels": {
                    "stateMachineStartSectionDefault": {"x": 0.0, "y": 1800.0},
                    "stateMachineGateSectionDefault": {"x": 600.0, "y": 1800.0},
                    "stateMachineEndSectionDefault": {"x": 1200.0, "y": 1800.0},
                },
                "allSettingsLeadLayoutSentinels": {
                    "shortcuts": {"x": 0.0, "y": 0.0},
                    "gui": {"x": 600.0, "y": 0.0},
                    "backend": {"x": 1200.0, "y": 0.0},
                    "chatWindowing": {"x": 0.0, "y": 600.0},
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
                "latestViewModeNames": [
                    "Core",
                    "Section Defaults Structure and Code",
                    "Section Defaults Content and Media",
                    "Param Defaults",
                    "All Settings",
                ],
                "latestFixedWidthSectionCount": 16,
                "latestJSONSourceVariantNameSamples": {
                    "gui": "setta_files/setta-settings.json",
                    "languageServer": "setta_files/setta-settings.json",
                    "iFrameSectionDefault": "setta_files/setta-settings.json",
                    "genPythonCodeSectionDefault": "setta_files/setta-settings.json",
                },
                "latestJSONSourceConfigLanguageSamples": {
                    "gui": "json",
                    "languageServer": "json",
                    "iFrameSectionDefault": "json",
                    "genPythonCodeSectionDefault": "json",
                },
                "latestSectionWidthSamples": {
                    "gui": 550.0,
                    "languageServer": 550.0,
                    "iFrameSectionDefault": 550.0,
                    "genPythonCodeSectionDefault": 550.0,
                },
                "latestSectionDisplayNameSamples": {
                    "gui": "",
                    "languageServer": "",
                    "iFrameSectionDefault": "",
                    "genPythonCodeSectionDefault": "",
                },
                "latestRootCodeObjDisplayNameSamples": {
                    "gui": "GUI",
                    "languageServer": "Language Server",
                    "iFrameSectionDefault": "IFrame Section Default",
                    "genPythonCodeSectionDefault": "Generated Python Code Section Default",
                },
                "latestViewModeViewportDefaults": {
                    "Core": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                    "Section Defaults Structure and Code": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                    "Section Defaults Content and Media": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                    "Param Defaults": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                    "All Settings": {
                        "viewportIsNone": True,
                        "viewportInitialized": False,
                    },
                },
                "latestCoreLayoutSentinels": {
                    "shortcuts": {"x": 0.0, "y": 0.0},
                    "gui": {"x": 600.0, "y": 0.0},
                    "backend": {"x": 1200.0, "y": 0.0},
                    "sectionSizingPolicy": {"x": 0.0, "y": 600.0},
                    "languageServer": {"x": 600.0, "y": 600.0},
                },
                "latestParamLayoutSentinels": {
                    "buttonParamCodeObjDefault": {"x": 0.0, "y": 0.0},
                    "codeCallableCodeObjDefault": {"x": 600.0, "y": 0.0},
                    "codeParamCodeObjDefault": {"x": 1200.0, "y": 0.0},
                },
                "latestStructureWorkflowLayoutSentinels": {
                    "stateMachineStartSectionDefault": {"x": 0.0, "y": 1800.0},
                    "stateMachineGateSectionDefault": {"x": 600.0, "y": 1800.0},
                    "stateMachineEndSectionDefault": {"x": 1200.0, "y": 1800.0},
                },
                "latestAllSettingsLeadLayoutSentinels": {
                    "shortcuts": {"x": 0.0, "y": 0.0},
                    "gui": {"x": 600.0, "y": 0.0},
                    "backend": {"x": 1200.0, "y": 0.0},
                    "chatWindowing": {"x": 0.0, "y": 600.0},
                },
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

    def test_summarize_settings_project_reserved_name_save_update_detects_reserved_name_persistence(
        self,
    ) -> None:
        harness = load_harness_module()

        restart_load_payload = {
            "projectConfig": {
                "name": "settings",
                "activeViewModeId": "settings-all",
                "viewModes": {
                    "settings-core": {
                        "id": "settings-core",
                        "name": "Core",
                        "sortIndex": 0,
                    },
                    "settings-all": {
                        "id": "settings-all",
                        "name": "All Settings",
                        "sortIndex": 4,
                    },
                },
            }
        }
        restart_latest_payload = {
            "projectState": restart_load_payload,
        }
        persisted_payload = {
            "projects": {
                "settings": {
                    "name": "settings",
                    "activeViewModeId": "settings-all",
                    "viewModes": {
                        "settings-core": {
                            "id": "settings-core",
                            "name": "Core",
                            "sortIndex": 0,
                        },
                        "settings-all": {
                            "id": "settings-all",
                            "name": "All Settings",
                            "sortIndex": 4,
                        },
                    },
                }
            }
        }

        summary = harness.summarize_settings_project_reserved_name_save_update(
            initial_load_http_status=200,
            save_http_status=200,
            restart_load_http_status=200,
            restart_load_payload=restart_load_payload,
            restart_latest_http_status=200,
            restart_latest_payload=restart_latest_payload,
            persisted_after_payload=persisted_payload,
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "saveProjectHttpStatus": 200,
                "restartLoadHttpStatus": 200,
                "restartLatestHttpStatus": 200,
                "restartLoadProjectName": "settings",
                "restartLoadActiveViewModeName": "All Settings",
                "restartLatestProjectName": "settings",
                "restartLatestActiveViewModeName": "All Settings",
                "persistedProjectName": "settings",
                "persistedActiveViewModeName": "All Settings",
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

    def test_settings_store_view_mode_names_supports_python_store_shape(self) -> None:
        harness = load_harness_module()

        payload = {
            "projects": {
                "settings": {
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
            }
        }

        self.assertEqual(
            harness.settings_store_view_mode_names(payload),
            ["Core", "All Settings"],
        )

    def test_settings_store_active_view_mode_name_supports_python_store_shape(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projects": {
                "settings": {
                    "projectConfig": {
                        "activeViewModeId": "settings-all",
                        "viewModes": {
                            "settings-core": {
                                "id": "settings-core",
                                "name": "Core",
                                "sortIndex": 0,
                            },
                            "settings-all": {
                                "id": "settings-all",
                                "name": "All Settings",
                                "sortIndex": 4,
                            },
                        },
                    }
                }
            }
        }

        self.assertEqual(
            harness.settings_store_active_view_mode_name(payload),
            "All Settings",
        )

    def test_summarize_settings_project_valid_view_mode_noop_detects_no_rewrite(
        self,
    ) -> None:
        harness = load_harness_module()

        persisted_payload = {
            "projects": {
                "settings": {
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
            }
        }
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
        restart_latest_payload = {"projectState": restart_load_payload}

        summary = harness.summarize_settings_project_valid_view_mode_noop(
            initial_load_http_status=200,
            restart_load_http_status=200,
            restart_load_payload=restart_load_payload,
            restart_latest_http_status=200,
            restart_latest_payload=restart_latest_payload,
            persisted_before_payload=persisted_payload,
            persisted_after_payload=persisted_payload,
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "restartLoadHttpStatus": 200,
                "restartLatestHttpStatus": 200,
                "persistedDocumentUnchanged": True,
                "restartLoadViewModeCount": 2,
                "restartLoadHasAllSettings": True,
                "restartLatestViewModeCount": 2,
                "restartLatestHasAllSettings": True,
                "persistedViewModeCount": 2,
                "persistedHasAllSettings": True,
            },
        )

    def test_clear_settings_top_level_layouts_from_store_payload_supports_python_store_shape(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projects": {
                "settings": {
                    "projectConfig": {
                        "topLevelSections": {"section-a": {}, "section-b": {}},
                        "viewModes": {
                            "settings-core": {
                                "topLevelSections": {"section-a": {}},
                            },
                            "settings-all": {
                                "topLevelSections": {"section-a": {}, "section-b": {}},
                            },
                        },
                    }
                }
            }
        }

        cleared = harness.clear_settings_top_level_layouts_from_store_payload(payload)
        project_config = cleared["projects"]["settings"]["projectConfig"]

        self.assertEqual(project_config["topLevelSections"], {})
        self.assertEqual(
            project_config["viewModes"]["settings-core"]["topLevelSections"],
            {},
        )
        self.assertEqual(
            project_config["viewModes"]["settings-all"]["topLevelSections"],
            {},
        )

    def test_delete_settings_view_mode_from_store_payload_marks_deleted_active_id(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projects": {
                "settings": {
                    "projectConfig": {
                        "activeViewModeId": "settings-core",
                        "isEditingViewMode": False,
                        "viewModes": {
                            "settings-core": {
                                "id": "settings-core",
                                "name": "Core",
                                "sortIndex": 0,
                            },
                            "settings-all": {
                                "id": "settings-all",
                                "name": "All Settings",
                                "sortIndex": 4,
                            },
                        },
                    }
                }
            }
        }

        updated = harness.delete_settings_view_mode_from_store_payload(
            payload,
            view_mode_name="Core",
        )
        project_config = updated["projects"]["settings"]["projectConfig"]

        self.assertNotIn("settings-core", project_config["viewModes"])
        self.assertEqual(project_config["activeViewModeId"], "settings-core")
        self.assertTrue(project_config["isEditingViewMode"])
        self.assertEqual(project_config["viewport"], {"x": 80, "y": 40, "zoom": 1.3})
        self.assertTrue(project_config["viewportInitialized"])

    def test_remove_settings_view_mode_layout_entry_from_store_payload_supports_python_store_shape(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projects": {
                "settings": {
                    "projectConfig": {
                        "viewModes": {
                            "settings-param-defaults": {
                                "id": "settings-param-defaults",
                                "name": "Param Defaults",
                                "topLevelSections": {
                                    "section-a": {},
                                    "section-b": {},
                                },
                            }
                        }
                    },
                    "sections": {
                        "section-a": {"name": "buttonParamCodeObjDefault"},
                        "section-b": {"name": "codeCallableCodeObjDefault"},
                    },
                }
            }
        }

        updated = harness.remove_settings_view_mode_layout_entry_from_store_payload(
            payload,
            view_mode_name="Param Defaults",
            section_name="buttonParamCodeObjDefault",
        )
        top_level_sections = updated["projects"]["settings"]["projectConfig"]["viewModes"][
            "settings-param-defaults"
        ]["topLevelSections"]

        self.assertNotIn("section-a", top_level_sections)
        self.assertIn("section-b", top_level_sections)

    def test_summarize_settings_project_top_level_layout_repair_detects_rebuild(
        self,
    ) -> None:
        harness = load_harness_module()

        restart_load_payload = {
            "projectConfig": {
                "topLevelSections": {"section-a": {}, "section-b": {}},
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
                },
            }
        }
        restart_latest_payload = {"projectState": restart_load_payload}
        persisted_payload = {
            "projects": {
                "settings": {
                    "projectConfig": {
                        "topLevelSections": {"section-a": {}, "section-b": {}},
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
                        },
                    }
                }
            }
        }

        summary = harness.summarize_settings_project_top_level_layout_repair(
            initial_load_http_status=200,
            restart_load_http_status=200,
            restart_load_payload=restart_load_payload,
            restart_latest_http_status=200,
            restart_latest_payload=restart_latest_payload,
            persisted_after_payload=persisted_payload,
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "restartLoadHttpStatus": 200,
                "restartLatestHttpStatus": 200,
                "restartLoadViewModeCount": 2,
                "restartLoadTopLevelSectionCount": 2,
                "restartLatestViewModeCount": 2,
                "restartLatestTopLevelSectionCount": 2,
                "persistedViewModeCount": 2,
                "persistedTopLevelSectionCount": 2,
            },
        )

    def test_summarize_settings_project_missing_visible_layout_repair_detects_restore(
        self,
    ) -> None:
        harness = load_harness_module()

        restart_load_payload = {
            "projectConfig": {
                "viewModes": {
                    "settings-param-defaults": {
                        "id": "settings-param-defaults",
                        "name": "Param Defaults",
                        "visibilityBySectionId": {
                            "section-a": True,
                            "section-b": True,
                        },
                        "topLevelSections": {
                            "section-a": {"x": 0, "y": 0},
                            "section-b": {"x": 600, "y": 0},
                        },
                    }
                },
            },
            "sections": {
                "section-a": {"name": "buttonParamCodeObjDefault"},
                "section-b": {"name": "codeCallableCodeObjDefault"},
            },
        }
        restart_latest_payload = {"projectState": restart_load_payload}
        summary = harness.summarize_settings_project_missing_visible_layout_repair(
            initial_load_http_status=200,
            restart_load_http_status=200,
            restart_load_payload=restart_load_payload,
            restart_latest_http_status=200,
            restart_latest_payload=restart_latest_payload,
            persisted_after_payload={
                "projectConfig": {
                    "viewModes": {
                        "settings-param-defaults": {
                            "id": "settings-param-defaults",
                            "name": "Param Defaults",
                            "visibilityBySectionId": {
                                "section-a": True,
                                "section-b": True,
                            },
                            "topLevelSections": {
                                "section-b": {"x": 600, "y": 0},
                            },
                        }
                    },
                },
                "sections": {
                    "section-a": {"name": "buttonParamCodeObjDefault"},
                    "section-b": {"name": "codeCallableCodeObjDefault"},
                },
            },
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "persistedParamLayoutPresent": False,
                "restartLoadHttpStatus": 200,
                "restartLatestHttpStatus": 200,
                "restartLoadParamLayoutPresent": True,
                "restartLatestParamLayoutPresent": True,
            },
        )

    def test_summarize_latest_state_prunes_stale_active_ids_detects_pruning(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projectState": {
                "projectConfig": {
                    "activeIds": ["section-a"],
                }
            }
        }

        summary = harness.summarize_latest_state_prunes_stale_active_ids(
            http_status=200,
            payload=payload,
            valid_section_id="section-a",
        )

        self.assertEqual(
            summary,
            {
                "httpStatus": 200,
                "activeIDCount": 1,
                "retainedValidSectionID": True,
                "hasDeletedSectionID": False,
            },
        )

    def test_summarize_settings_project_deleted_active_view_mode_repair_detects_stable_projection(
        self,
    ) -> None:
        harness = load_harness_module()

        project_config = {
            "activeViewModeId": "settings-all",
            "isEditingViewMode": False,
            "viewport": None,
            "viewportInitialized": False,
            "topLevelSections": {"section-a": {}, "section-b": {}},
            "viewModes": {
                "settings-all": {
                    "id": "settings-all",
                    "name": "All Settings",
                    "sortIndex": 4,
                    "viewport": None,
                    "viewportInitialized": False,
                    "topLevelSections": {"section-a": {}, "section-b": {}},
                },
                "settings-core": {
                    "id": "settings-core",
                    "name": "Core",
                    "sortIndex": 0,
                    "viewport": None,
                    "viewportInitialized": False,
                    "topLevelSections": {"section-a": {}, "section-b": {}},
                },
            },
        }
        restart_load_payload = {"projectConfig": project_config}
        restart_latest_payload = {"projectState": restart_load_payload}
        persisted_payload = {
            "projects": {
                "settings": {
                    "projectConfig": project_config,
                }
            }
        }

        summary = harness.summarize_settings_project_deleted_active_view_mode_repair(
            initial_load_http_status=200,
            restart_load_http_status=200,
            restart_load_payload=restart_load_payload,
            restart_latest_http_status=200,
            restart_latest_payload=restart_latest_payload,
            persisted_after_payload=persisted_payload,
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "restartLoadHttpStatus": 200,
                "restartLatestHttpStatus": 200,
                "restartLoadViewModeCount": 2,
                "restartLoadIsEditingViewMode": False,
                "restartLoadActiveViewModeIdPresent": True,
                "restartLoadActiveViewModePresentInMap": True,
                "restartLoadProjectLayoutMatchesActiveViewMode": True,
                "restartLoadProjectViewportMatchesActiveViewMode": True,
                "restartLoadProjectViewportInitializedMatchesActiveViewMode": True,
                "restartLatestViewModeCount": 2,
                "restartLatestIsEditingViewMode": False,
                "restartLatestActiveViewModeIdPresent": True,
                "restartLatestActiveViewModePresentInMap": True,
                "restartLatestProjectLayoutMatchesActiveViewMode": True,
                "restartLatestProjectViewportMatchesActiveViewMode": True,
                "restartLatestProjectViewportInitializedMatchesActiveViewMode": True,
                "persistedViewModeCount": 2,
                "persistedIsEditingViewMode": False,
                "persistedActiveViewModeIdPresent": True,
                "persistedActiveViewModePresentInMap": True,
                "persistedProjectLayoutMatchesActiveViewMode": True,
                "persistedProjectViewportMatchesActiveViewMode": True,
                "persistedProjectViewportInitializedMatchesActiveViewMode": True,
            },
        )

    def test_remove_settings_section_from_store_payload_supports_go_store_shape(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projects": {
                "settings": {
                    "topLevelSectionIds": ["section-a", "section-b"],
                    "topLevelSections": {"section-a": {}, "section-b": {}},
                    "sectionVariantMap": {
                        "section-a": "variant-a",
                        "section-b": "variant-b",
                    },
                    "sections": {
                        "section-a": {"name": "backend"},
                        "section-b": {"name": "spreadsheetSectionDefault"},
                    },
                    "sectionVariants": {
                        "variant-a": {"impl": "impl-a"},
                        "variant-b": {"impl": "impl-b"},
                    },
                    "sectionImpls": {
                        "impl-a": {},
                        "impl-b": {},
                    },
                    "viewModes": {
                        "settings-all": {
                            "visibilityBySectionId": {
                                "section-a": True,
                                "section-b": True,
                            },
                            "topLevelSections": {
                                "section-a": {},
                                "section-b": {},
                            },
                        }
                    },
                }
            }
        }

        removed = harness.remove_settings_section_from_store_payload(
            payload,
            section_name="spreadsheetSectionDefault",
        )
        settings_project = removed["projects"]["settings"]

        self.assertEqual(settings_project["topLevelSectionIds"], ["section-a"])
        self.assertEqual(set(settings_project["sections"].keys()), {"section-a"})
        self.assertEqual(set(settings_project["sectionVariantMap"].keys()), {"section-a"})
        self.assertEqual(set(settings_project["sectionVariants"].keys()), {"variant-a"})
        self.assertEqual(set(settings_project["sectionImpls"].keys()), {"impl-a"})
        self.assertNotIn(
            "section-b",
            settings_project["viewModes"]["settings-all"]["visibilityBySectionId"],
        )

    def test_remove_settings_section_from_store_payload_supports_single_config_shape(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projectConfig": {
                "topLevelSections": {"section-a": {}, "section-b": {}},
                "sectionVariantMap": {
                    "section-a": "variant-a",
                    "section-b": "variant-b",
                },
                "viewModes": {
                    "settings-all": {
                        "visibilityBySectionId": {
                            "section-a": True,
                            "section-b": True,
                        },
                        "topLevelSections": {
                            "section-a": {},
                            "section-b": {},
                        },
                    }
                },
            },
            "sections": {
                "section-a": {"name": "backend"},
                "section-b": {"name": "spreadsheetSectionDefault"},
            },
            "sectionVariants": {
                "variant-a": {"impl": "impl-a"},
                "variant-b": {"impl": "impl-b"},
            },
            "sectionImpls": {
                "impl-a": {},
                "impl-b": {},
            },
        }

        removed = harness.remove_settings_section_from_store_payload(
            payload,
            section_name="spreadsheetSectionDefault",
        )

        self.assertNotIn("topLevelSectionIds", removed["projectConfig"])
        self.assertEqual(set(removed["sections"].keys()), {"section-a"})
        self.assertEqual(
            set(removed["projectConfig"]["sectionVariantMap"].keys()),
            {"section-a"},
        )
        self.assertEqual(
            set(removed["projectConfig"]["topLevelSections"].keys()),
            {"section-a"},
        )
        self.assertEqual(set(removed["sectionVariants"].keys()), {"variant-a"})
        self.assertEqual(set(removed["sectionImpls"].keys()), {"impl-a"})
        self.assertNotIn(
            "section-b",
            removed["projectConfig"]["viewModes"]["settings-all"][
                "visibilityBySectionId"
            ],
        )

    def test_remove_settings_param_from_store_payload_supports_single_config_shape(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projectConfig": {
                "sectionVariantMap": {
                    "backend-section": "backend-section-variant",
                }
            },
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
                    "codeObjVariantMap": {
                        "backend-root": "backend-root-variant",
                        "rename-setting": "rename-setting-variant",
                    },
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
                    "value": "ALWAYS_ASK",
                },
            },
        }

        removed = harness.remove_settings_param_from_store_payload(
            payload,
            section_name="backend",
            param_path=["renameRefactorMode"],
        )

        self.assertEqual(
            removed["sectionImpls"]["backend-section-impl"]["codeObjVariantMap"],
            {"backend-root": "backend-root-variant"},
        )
        self.assertEqual(removed["codeObjImpls"]["backend-root-impl"]["children"], [])
        self.assertNotIn("rename-setting", removed["codeObjs"])
        self.assertNotIn("rename-setting-variant", removed["codeObjVariants"])
        self.assertNotIn("rename-setting-impl", removed["codeObjImpls"])

    def test_summarize_settings_project_missing_required_section_fails_closed_detects_error(
        self,
    ) -> None:
        harness = load_harness_module()

        summary = harness.summarize_settings_project_missing_required_section_fails_closed(
            initial_load_http_status=200,
            restart_startup_error=None,
            restart_load_http_status=500,
            restart_load_payload={"detail": "Internal Server Error"},
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "restartStartupStatus": "ready",
                "restartLoadHttpStatus": 500,
                "restartLoadErrorSummary": "Internal Server Error",
            },
        )

    def test_summarize_settings_project_missing_required_section_fails_closed_detects_startup_failure(
        self,
    ) -> None:
        harness = load_harness_module()

        summary = harness.summarize_settings_project_missing_required_section_fails_closed(
            initial_load_http_status=200,
            restart_startup_error=(
                "Backend exited before startup completed.\n\n"
                "setta.project_state.settings_project.MissingSettingsSectionError: "
                "'Missing settings section spreadsheetSectionDefault.'"
            ),
            restart_load_http_status=None,
            restart_load_payload=None,
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "restartStartupStatus": "failed",
            },
        )

    def test_summarize_settings_project_existing_section_code_obj_backfill_detects_repair(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projectConfig": {
                "sectionVariantMap": {
                    "backend-section": "backend-section-variant",
                    "gui-section": "gui-section-variant",
                    "section-sizing-policy-section": "section-sizing-policy-section-variant",
                }
            },
            "sections": {
                "backend-section": {
                    "name": "backend",
                    "defaultVariant": "backend-section-variant",
                },
                "gui-section": {
                    "name": "gui",
                    "defaultVariant": "gui-section-variant",
                },
                "section-sizing-policy-section": {
                    "name": "sectionSizingPolicy",
                    "defaultVariant": "section-sizing-policy-section-variant",
                },
            },
            "sectionVariants": {
                "backend-section-variant": {
                    "impl": "backend-section-impl",
                },
                "gui-section-variant": {
                    "impl": "gui-section-impl",
                },
                "section-sizing-policy-section-variant": {
                    "impl": "section-sizing-policy-section-impl",
                },
            },
            "sectionImpls": {
                "backend-section-impl": {
                    "topLevelParamId": "backend-root",
                },
                "gui-section-impl": {
                    "topLevelParamId": "gui-root",
                },
                "section-sizing-policy-section-impl": {
                    "topLevelParamId": "section-sizing-policy-root",
                },
            },
            "codeObjs": {
                "backend-root": {
                    "name": "backend",
                    "defaultVariant": "backend-root-variant",
                },
                "backend-autosave": {
                    "name": "autosave",
                    "defaultVariant": "backend-autosave-variant",
                },
                "rename-setting": {
                    "name": "renameRefactorMode",
                    "defaultVariant": "rename-setting-variant",
                },
                "gui-root": {
                    "name": "gui",
                    "defaultVariant": "gui-root-variant",
                },
                "gui-grid-color": {
                    "name": "gridColor",
                    "defaultVariant": "gui-grid-color-variant",
                },
                "section-sizing-policy-root": {
                    "name": "sectionSizingPolicy",
                    "defaultVariant": "section-sizing-policy-root-variant",
                },
                "section-sizing-policy-meta-control-by-type": {
                    "name": "metaControlByType",
                    "defaultVariant": "section-sizing-policy-meta-control-by-type-variant",
                },
            },
            "codeObjVariants": {
                "backend-root-variant": {
                    "impl": "backend-root-impl",
                },
                "backend-autosave-variant": {
                    "impl": "backend-autosave-impl",
                },
                "rename-setting-variant": {
                    "impl": "rename-setting-impl",
                },
                "gui-root-variant": {
                    "impl": "gui-root-impl",
                },
                "gui-grid-color-variant": {
                    "impl": "gui-grid-color-impl",
                },
                "section-sizing-policy-root-variant": {
                    "impl": "section-sizing-policy-root-impl",
                },
                "section-sizing-policy-meta-control-by-type-variant": {
                    "impl": "section-sizing-policy-meta-control-by-type-impl",
                },
            },
            "codeObjImpls": {
                "backend-root-impl": {
                    "type": "NestedParam",
                    "children": ["backend-autosave", "rename-setting"],
                },
                "backend-autosave-impl": {
                    "type": "SwitchParam",
                    "value": True,
                },
                "rename-setting-impl": {
                    "type": "DropdownParam",
                    "choices": ['"ALWAYS_ASK"', '"ALWAYS_RENAME"', '"NEVER_RENAME"'],
                    "value": "ALWAYS_ASK",
                },
                "gui-root-impl": {
                    "type": "NestedParam",
                    "children": ["gui-grid-color"],
                },
                "gui-grid-color-impl": {
                    "type": "ColorPickerParam",
                    "value": "#afbacf",
                },
                "section-sizing-policy-root-impl": {
                    "type": "NestedParam",
                    "children": ["section-sizing-policy-meta-control-by-type"],
                },
                "section-sizing-policy-meta-control-by-type-impl": {
                    "type": "NestedParam",
                    "children": [],
                },
            },
        }

        summary = harness.summarize_settings_project_existing_section_code_obj_backfill(
            initial_load_http_status=200,
            restart_startup_error=None,
            restart_startup_persisted_payload=payload,
            restart_load_http_status=200,
            restart_load_payload=payload,
            post_load_persisted_payload=payload,
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "restartStartupStatus": "ready",
                "restartStartupParamImplTypes": {
                    "backend.autosave": "SwitchParam",
                    "backend.renameRefactorMode": "DropdownParam",
                    "gui.gridColor": "ColorPickerParam",
                    "sectionSizingPolicy.metaControlByType": "NestedParam",
                },
                "restartStartupDropdownChoices": {
                    "backend.renameRefactorMode": [
                        '"ALWAYS_ASK"',
                        '"ALWAYS_RENAME"',
                        '"NEVER_RENAME"',
                    ]
                },
                "restartLoadHttpStatus": 200,
                "restartLoadParamImplTypes": {
                    "backend.autosave": "SwitchParam",
                    "backend.renameRefactorMode": "DropdownParam",
                    "gui.gridColor": "ColorPickerParam",
                    "sectionSizingPolicy.metaControlByType": "NestedParam",
                },
                "restartLoadDropdownChoices": {
                    "backend.renameRefactorMode": [
                        '"ALWAYS_ASK"',
                        '"ALWAYS_RENAME"',
                        '"NEVER_RENAME"',
                    ]
                },
                "postLoadPersistedParamImplTypes": {
                    "backend.autosave": "SwitchParam",
                    "backend.renameRefactorMode": "DropdownParam",
                    "gui.gridColor": "ColorPickerParam",
                    "sectionSizingPolicy.metaControlByType": "NestedParam",
                },
                "postLoadPersistedDropdownChoices": {
                    "backend.renameRefactorMode": [
                        '"ALWAYS_ASK"',
                        '"ALWAYS_RENAME"',
                        '"NEVER_RENAME"',
                    ]
                },
            },
        )

    def test_summarize_settings_project_display_name_backfill_detects_repair(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "projectConfig": {},
            "codeObjs": {
                "gui-code-obj": {
                    "name": "gui",
                    "displayName": "Custom GUI Label",
                },
                "language-server-code-obj": {
                    "name": "languageServer",
                    "displayName": "",
                },
                "rename-refactor-mode-code-obj": {
                    "name": "renameRefactorMode",
                    "displayName": "Rename Refactor Mode",
                },
            },
        }

        summary = harness.summarize_settings_project_display_name_backfill(
            initial_load_http_status=200,
            restart_load_http_status=200,
            restart_load_payload=payload,
            restart_latest_http_status=200,
            restart_latest_payload={"projectState": payload},
            persisted_after_payload=payload,
        )

        self.assertEqual(
            summary,
            {
                "initialLoadHttpStatus": 200,
                "restartLoadHttpStatus": 200,
                "restartLoadCodeObjDisplayNames": {
                    "gui": "Custom GUI Label",
                    "languageServer": "",
                    "renameRefactorMode": "Rename Refactor Mode",
                },
                "restartLatestHttpStatus": 200,
                "restartLatestCodeObjDisplayNames": {
                    "gui": "Custom GUI Label",
                    "languageServer": "",
                    "renameRefactorMode": "Rename Refactor Mode",
                },
                "persistedAfterRestartCodeObjDisplayNames": {
                    "gui": "Custom GUI Label",
                    "languageServer": "",
                    "renameRefactorMode": "Rename Refactor Mode",
                },
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

    def test_summarize_project_windowing_authoritative_presence_on_load_detects_ready_mismatch(
        self,
    ) -> None:
        harness = load_harness_module()

        persisted_payload = {
            "projects": {
                "project-1": {
                    "id": "project-1",
                    "name": "Example project",
                }
            }
        }

        summary = harness.summarize_project_windowing_authoritative_presence_on_load(
            restart_startup_error=None,
            restart_load_http_status=200,
            restart_load_payload={
                "projectConfig": {"id": "project-1"},
                "projectChatWindowing": {
                    "instancesById": {},
                    "order": [],
                    "nextInstanceNumber": 1,
                }
            },
            restart_latest_http_status=200,
            restart_latest_payload={
                "projectState": {
                    "projectConfig": {"id": "project-1"},
                    "projectChatWindowing": {
                        "instancesById": {},
                        "order": [],
                        "nextInstanceNumber": 1,
                    },
                }
            },
            persisted_after_payload=persisted_payload,
            project_id="project-1",
        )

        self.assertEqual(
            summary,
            {
                "persistedWindowingPresentAfterRestart": False,
                "restartStartupStatus": "ready",
                "restartLoadHttpStatus": 200,
                "restartLoadProjectChatWindowingPresent": True,
                "restartLatestHttpStatus": 200,
                "restartLatestProjectChatWindowingPresent": True,
            },
        )

    def test_summarize_project_windowing_authoritative_presence_on_load_detects_startup_failure(
        self,
    ) -> None:
        harness = load_harness_module()

        persisted_payload = {
            "projects": {
                "project-1": {
                    "id": "project-1",
                    "name": "Example project",
                }
            }
        }

        summary = harness.summarize_project_windowing_authoritative_presence_on_load(
            restart_startup_error="backend exited on startup",
            restart_load_http_status=None,
            restart_load_payload=None,
            restart_latest_http_status=None,
            restart_latest_payload=None,
            persisted_after_payload=persisted_payload,
            project_id="project-1",
        )

        self.assertEqual(
            summary,
            {
                "persistedWindowingPresentAfterRestart": False,
                "restartStartupStatus": "failed",
            },
        )

    def test_summarize_windowing_section_binding_dedup_and_title_clearing_on_load(
        self,
    ) -> None:
        harness = load_harness_module()

        single_config = {
            "projectChatWindowing": {
                "instancesById": {
                    "project-chat-window-1": {
                        "instanceId": "project-chat-window-1",
                        "title": None,
                    }
                }
            },
            "projectConfig": {
                "windowSpaces": {
                    "space-dedupe": {
                        "windowsById": {
                            "window-2": {
                                "title": None,
                            }
                        }
                    }
                }
            },
        }

        summary = harness.summarize_windowing_section_binding_dedup_and_title_clearing_on_load(
            restart_load_http_status=200,
            restart_load_payload=single_config,
            restart_latest_http_status=200,
            restart_latest_payload={"projectState": single_config},
        )

        self.assertEqual(
            summary,
            {
                "restartLoadHttpStatus": 200,
                "restartLatestHttpStatus": 200,
                "restartLoadProjectChatSectionWindowCount": 1,
                "restartLoadProjectChatSectionWindowIDs": [
                    "project-chat-window-1"
                ],
                "restartLoadProjectChatSectionWindowTitles": {
                    "project-chat-window-1": None
                },
                "restartLoadWindowSpaceSectionWindowCount": 1,
                "restartLoadWindowSpaceSectionWindowIDs": ["window-2"],
                "restartLoadWindowSpaceSectionWindowTitles": {"window-2": None},
                "restartLatestProjectChatSectionWindowCount": 1,
                "restartLatestProjectChatSectionWindowIDs": [
                    "project-chat-window-1"
                ],
                "restartLatestProjectChatSectionWindowTitles": {
                    "project-chat-window-1": None
                },
                "restartLatestWindowSpaceSectionWindowCount": 1,
                "restartLatestWindowSpaceSectionWindowIDs": ["window-2"],
                "restartLatestWindowSpaceSectionWindowTitles": {
                    "window-2": None
                },
            },
        )

    def test_summarize_project_chat_windowing_invalid_owner_mode_combos_on_load(
        self,
    ) -> None:
        harness = load_harness_module()

        self.assertEqual(
            harness.summarize_project_chat_windowing_invalid_owner_mode_combos_on_load(
                restart_startup_error="backend exited on startup",
                restart_load_http_status=None,
                restart_load_payload=None,
            ),
            {"restartStartupStatus": "failed"},
        )

        self.assertEqual(
            harness.summarize_project_chat_windowing_invalid_owner_mode_combos_on_load(
                restart_startup_error=None,
                restart_load_http_status=200,
                restart_load_payload={"projectConfig": {"id": "project-1"}},
            ),
            {
                "restartStartupStatus": "ready",
                "restartLoadHttpStatus": 200,
            },
        )

    def test_summarize_window_spaces_invalid_owner_mode_combos_on_load(
        self,
    ) -> None:
        harness = load_harness_module()

        self.assertEqual(
            harness.summarize_window_spaces_invalid_owner_mode_combos_on_load(
                restart_startup_error="backend exited on startup",
                restart_load_http_status=None,
                restart_load_payload=None,
            ),
            {"restartStartupStatus": "failed"},
        )

        self.assertEqual(
            harness.summarize_window_spaces_invalid_owner_mode_combos_on_load(
                restart_startup_error=None,
                restart_load_http_status=200,
                restart_load_payload={"projectConfig": {"id": "project-1"}},
            ),
            {
                "restartStartupStatus": "ready",
                "restartLoadHttpStatus": 200,
            },
        )

    def test_summarize_windowing_scoped_per_project_config(self) -> None:
        harness = load_harness_module()

        first_payload = {
            "projectChatWindowing": {
                "instancesById": {
                    "instance-alpha": {
                        "chatId": "chat-live-alpha",
                    }
                }
            },
            "projectConfig": {
                "windowSpaces": {
                    "space-alpha": {
                        "windowsById": {
                            "window-alpha": {}
                        }
                    }
                }
            },
        }
        second_payload = {
            "projectChatWindowing": {
                "instancesById": {
                    "instance-beta": {
                        "chatId": "chat-live-beta",
                    }
                }
            },
            "projectConfig": {
                "windowSpaces": {
                    "space-beta": {
                        "windowsById": {
                            "window-beta": {}
                        }
                    }
                }
            },
        }

        self.assertEqual(
            harness.summarize_windowing_scoped_per_project_config(
                first_load_http_status=200,
                first_load_payload=first_payload,
                first_latest_http_status=200,
                first_latest_payload={"projectState": first_payload},
                second_load_http_status=200,
                second_load_payload=second_payload,
                second_latest_http_status=200,
                second_latest_payload={"projectState": second_payload},
            ),
            {
                "firstLoadHttpStatus": 200,
                "firstLatestHttpStatus": 200,
                "secondLoadHttpStatus": 200,
                "secondLatestHttpStatus": 200,
                "firstLoadWindowSpaceIDs": ["space-alpha"],
                "firstLoadWindowSpaceWindowIDsBySpace": {
                    "space-alpha": ["window-alpha"]
                },
                "firstLoadProjectChatWindowIDs": ["instance-alpha"],
                "firstLoadProjectChatChatIDs": {
                    "instance-alpha": "chat-live-alpha"
                },
                "firstLatestWindowSpaceIDs": ["space-alpha"],
                "firstLatestWindowSpaceWindowIDsBySpace": {
                    "space-alpha": ["window-alpha"]
                },
                "firstLatestProjectChatWindowIDs": ["instance-alpha"],
                "firstLatestProjectChatChatIDs": {
                    "instance-alpha": "chat-live-alpha"
                },
                "secondLoadWindowSpaceIDs": ["space-beta"],
                "secondLoadWindowSpaceWindowIDsBySpace": {
                    "space-beta": ["window-beta"]
                },
                "secondLoadProjectChatWindowIDs": ["instance-beta"],
                "secondLoadProjectChatChatIDs": {
                    "instance-beta": "chat-live-beta"
                },
                "secondLatestWindowSpaceIDs": ["space-beta"],
                "secondLatestWindowSpaceWindowIDsBySpace": {
                    "space-beta": ["window-beta"]
                },
                "secondLatestProjectChatWindowIDs": ["instance-beta"],
                "secondLatestProjectChatChatIDs": {
                    "instance-beta": "chat-live-beta"
                },
            },
        )

    def test_summarize_project_chat_window_chat_id_route_contract(self) -> None:
        harness = load_harness_module()

        valid_bind_payload = {
            "instancesById": {
                "project-ai-window": {
                    "chatId": "chat-after",
                },
                "section-window": {
                    "chatId": None,
                },
            }
        }
        latest_payload = {
            "projectState": {
                "projectChatWindowing": valid_bind_payload,
            }
        }

        self.assertEqual(
            harness.summarize_project_chat_window_chat_id_route_contract(
                valid_bind_http_status=200,
                valid_bind_payload=valid_bind_payload,
                invalid_mode_http_status=422,
                invalid_mode_payload={
                    "detail": "Project chat window section-window must use project_ai_mode to bind chatId."
                },
                missing_window_http_status=404,
                missing_window_payload={
                    "detail": "Project chat window missing-window not found."
                },
                latest_http_status=200,
                latest_payload=latest_payload,
            ),
            {
                "validBindHttpStatus": 200,
                "invalidModeHttpStatus": 422,
                "missingWindowHttpStatus": 404,
                "latestHttpStatus": 200,
                "validBindChatID": "chat-after",
                "invalidModeErrorCode": "Project chat window section-window must use project_ai_mode to bind chatId.",
                "invalidModeErrorSummary": "Project chat window section-window must use project_ai_mode to bind chatId.",
                "missingWindowErrorCode": "Project chat window missing-window not found.",
                "missingWindowErrorSummary": "Project chat window missing-window not found.",
                "latestProjectAIChatID": "chat-after",
                "latestSectionModeChatID": None,
            },
        )

    def test_summarize_project_chat_windowing_state_invalid_owner_mode_write_contract(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "detail": "Project chat layout write rejected."
        }

        self.assertEqual(
            harness.summarize_project_chat_windowing_state_invalid_owner_mode_write_contract(
                section_mode_http_status=422,
                section_mode_payload=payload,
                git_graph_section_http_status=422,
                git_graph_section_payload=payload,
                git_graph_canvas_http_status=422,
                git_graph_canvas_payload=payload,
            ),
            {
                "sectionModeHttpStatus": 422,
                "sectionModeErrorCode": "Project chat layout write rejected.",
                "sectionModeErrorSummary": "Project chat layout write rejected.",
                "gitGraphSectionHttpStatus": 422,
                "gitGraphSectionErrorCode": "Project chat layout write rejected.",
                "gitGraphSectionErrorSummary": "Project chat layout write rejected.",
                "gitGraphCanvasHttpStatus": 422,
                "gitGraphCanvasErrorCode": "Project chat layout write rejected.",
                "gitGraphCanvasErrorSummary": "Project chat layout write rejected.",
            },
        )

    def test_summarize_window_space_create_invalid_owner_mode_write_contract(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "detail": "Window-space write rejected."
        }

        self.assertEqual(
            harness.summarize_window_space_create_invalid_owner_mode_write_contract(
                section_missing_http_status=422,
                section_missing_payload=payload,
                project_chat_section_http_status=422,
                project_chat_section_payload=payload,
                section_git_graph_http_status=422,
                section_git_graph_payload=payload,
                project_chat_section_mode_http_status=422,
                project_chat_section_mode_payload=payload,
                non_project_ai_chat_id_http_status=422,
                non_project_ai_chat_id_payload=payload,
            ),
            {
                "sectionMissingHttpStatus": 422,
                "sectionMissingErrorCode": "Window-space write rejected.",
                "sectionMissingErrorSummary": "Window-space write rejected.",
                "projectChatSectionHttpStatus": 422,
                "projectChatSectionErrorCode": "Window-space write rejected.",
                "projectChatSectionErrorSummary": "Window-space write rejected.",
                "sectionGitGraphHttpStatus": 422,
                "sectionGitGraphErrorCode": "Window-space write rejected.",
                "sectionGitGraphErrorSummary": "Window-space write rejected.",
                "projectChatSectionModeHttpStatus": 422,
                "projectChatSectionModeErrorCode": "Window-space write rejected.",
                "projectChatSectionModeErrorSummary": "Window-space write rejected.",
                "nonProjectAIChatIDHttpStatus": 422,
                "nonProjectAIChatIDErrorCode": "Window-space write rejected.",
                "nonProjectAIChatIDErrorSummary": "Window-space write rejected.",
            },
        )

    def test_summarize_prompt_template_link_rejects_non_prompt_sections(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "detail": "Section section-123 failed type guard",
        }

        self.assertEqual(
            harness.summarize_prompt_template_link_rejects_non_prompt_sections(
                link_http_status=422,
                link_payload=payload,
            ),
            {
                "linkHttpStatus": 422,
                "linkErrorCode": "failed type guard",
                "linkErrorSummary": "failed type guard",
            },
        )

    def test_normalize_python_validation_message_extracts_value_error_detail(
        self,
    ) -> None:
        harness = load_harness_module()

        payload = {
            "status_code": 10422,
            "message": (
                "[{'type': 'value_error', 'loc': ('body', 'state', 'windowsById', "
                "'section-missing-binding'), 'msg': 'Value error, Section "
                "window-space windows require sectionIdOrNull.', 'input': "
                "{'surfaceKind': 'section', 'mode': 'section_mode'}, 'ctx': "
                "{'error': ValueError('Section window-space windows require "
                "sectionIdOrNull.')}}]"
            ),
            "data": None,
        }

        self.assertEqual(
            harness.normalize_error_summary(payload),
            "Section window-space windows require sectionIdOrNull.",
        )
        self.assertEqual(
            harness.normalize_error_code(payload),
            "Section window-space windows require sectionIdOrNull.",
        )

    def test_summarize_window_space_duplicate_sort_indices_on_load(self) -> None:
        harness = load_harness_module()

        load_payload = {
            "projectConfig": {
                "windowSpaces": {
                    "space-zeta": {"name": "Zulu Layout", "sortIndex": 0},
                    "space-alpha": {"name": "Alpha Layout", "sortIndex": 1},
                    "space-beta": {"name": "Beta Layout", "sortIndex": 2},
                }
            }
        }
        latest_payload = {
            "projectState": {
                "projectConfig": {
                    "windowSpaces": {
                        "space-zeta": {"name": "Zulu Layout", "sortIndex": 0},
                        "space-alpha": {"name": "Alpha Layout", "sortIndex": 1},
                        "space-beta": {"name": "Beta Layout", "sortIndex": 2},
                    }
                }
            }
        }

        self.assertEqual(
            harness.summarize_window_space_duplicate_sort_indices_on_load(
                load_http_status=200,
                load_payload=load_payload,
                latest_http_status=200,
                latest_payload=latest_payload,
            ),
            {
                "loadHttpStatus": 200,
                "loadSortIndexByWindowSpaceName": {
                    "Zulu Layout": 0,
                    "Alpha Layout": 1,
                    "Beta Layout": 2,
                },
                "loadSortedWindowSpaceNames": [
                    "Zulu Layout",
                    "Alpha Layout",
                    "Beta Layout",
                ],
                "loadHasDuplicateSortIndices": False,
                "latestHttpStatus": 200,
                "latestSortIndexByWindowSpaceName": {
                    "Zulu Layout": 0,
                    "Alpha Layout": 1,
                    "Beta Layout": 2,
                },
                "latestSortedWindowSpaceNames": [
                    "Zulu Layout",
                    "Alpha Layout",
                    "Beta Layout",
                ],
                "latestHasDuplicateSortIndices": False,
            },
        )

    def test_summarize_workspace_launch_outdated_settings_error_detects_typed_failure(
        self,
    ) -> None:
        harness = load_harness_module()

        create_intent_payload = {
            "ok": True,
            "launchIntentToken": "launch-intent-token",
        }
        launch_payload = {
            "ok": False,
            "error": {
                "code": "OutdatedProjectSettings",
                "message": (
                    "This workspace uses an older Setta settings/project format "
                    "(missing settings section spreadsheetSectionDefault). "
                    "Please migrate the project metadata and try again."
                ),
            },
        }

        summary = harness.summarize_workspace_launch_outdated_settings_error(
            initial_settings_load_http_status=200,
            create_intent_http_status=200,
            create_intent_payload=create_intent_payload,
            launch_http_status=200,
            launch_payload=launch_payload,
        )

        self.assertEqual(
            summary,
            {
                "initialSettingsLoadHttpStatus": 200,
                "createIntentHttpStatus": 200,
                "launchHttpStatus": 200,
                "createIntentOk": True,
                "createIntentHasToken": True,
                "launchOk": False,
                "launchErrorCode": "OutdatedProjectSettings",
                "launchErrorHasMigrationCopy": True,
                "launchErrorHasSectionName": True,
            },
        )

    def test_summarize_json_source_save_restart_round_trip_canonical_storage(
        self,
    ) -> None:
        harness = load_harness_module()

        load_payload = {
            "projectConfig": {"id": "project-alpha"},
            "sections": {
                "json-section-a": {
                    "defaultVariant": "json-variant-a",
                }
            },
            "sectionVariants": {
                "json-variant-a": {
                    "impl": "json-impl-a",
                    "name": "data/source.json",
                }
            },
            "sectionImpls": {
                "json-impl-a": {
                    "type": "Dict",
                    "isJsonSource": True,
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamId": "old-root-a",
                    "codeObjVariantMap": {
                        "old-root-a": "old-root-a-variant",
                        "fresh-leaf": "fresh-leaf-variant",
                    },
                }
            },
            "codeObjs": {
                "old-root-a": {
                    "name": "alpha",
                    "defaultVariant": "old-root-a-variant",
                },
                "fresh-leaf": {
                    "name": "fresh",
                    "defaultVariant": "fresh-leaf-variant",
                },
            },
            "codeObjVariants": {
                "old-root-a-variant": {"impl": "old-root-a-impl"},
                "fresh-leaf-variant": {"impl": "fresh-leaf-impl"},
            },
            "codeObjImpls": {
                "old-root-a-impl": {
                    "type": "NestedParam",
                    "children": ["fresh-leaf"],
                },
                "fresh-leaf-impl": {
                    "type": "CodeParam",
                    "value": "2",
                },
            },
        }
        persisted_project = {
            "sections": load_payload["sections"],
            "sectionVariants": load_payload["sectionVariants"],
            "sectionImpls": {
                "json-impl-a": {
                    "type": "Dict",
                    "isJsonSource": True,
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamId": "old-root-a",
                    "codeObjVariantMap": {
                        "old-root-a": "old-root-a-variant",
                        "fresh-leaf": "fresh-leaf-variant",
                    },
                }
            },
            "codeObjs": load_payload["codeObjs"],
            "codeObjVariants": load_payload["codeObjVariants"],
            "codeObjImpls": {
                "old-root-a-impl": {
                    "type": "NestedParam",
                    "children": ["fresh-leaf"],
                },
                "fresh-leaf-impl": {
                    "type": "CodeParam",
                    "value": "",
                },
            },
        }

        summary = harness.summarize_json_source_save_restart_round_trip_canonical_storage(
            save_http_status=200,
            restart_startup_error=None,
            restart_load_http_status=200,
            restart_load_payload=load_payload,
            restart_latest_http_status=200,
            restart_latest_payload={"projectState": load_payload},
            persisted_project=persisted_project,
            saved_payload={"alpha": {"fresh": 2}},
        )

        self.assertEqual(
            summary,
            {
                "saveProjectStatus": 200,
                "restartStartupStatus": "ready",
                "restartLoadHttpStatus": 200,
                "restartLatestHttpStatus": 200,
                "restartLoadTarget": {
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamChanged": False,
                    "oldRootPresent": True,
                    "oldLeafPresent": False,
                    "codeObjVariantMapSize": 2,
                    "tree": {
                        "name": "alpha",
                        "type": "NestedParam",
                        "children": [
                            {
                                "name": "fresh",
                                "type": "CodeParam",
                                "value": "2",
                            }
                        ],
                    },
                },
                "restartLatestTarget": {
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamChanged": False,
                    "oldRootPresent": True,
                    "oldLeafPresent": False,
                    "codeObjVariantMapSize": 2,
                    "tree": {
                        "name": "alpha",
                        "type": "NestedParam",
                        "children": [
                            {
                                "name": "fresh",
                                "type": "CodeParam",
                                "value": "2",
                            }
                        ],
                    },
                },
                "persistedTarget": {
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamChanged": False,
                    "oldRootPresent": True,
                    "oldLeafPresent": False,
                    "codeObjVariantMapSize": 2,
                    "tree": {
                        "name": "alpha",
                        "type": "NestedParam",
                        "children": [
                            {
                                "name": "fresh",
                                "type": "CodeParam",
                                "value": "",
                            }
                        ],
                    },
                },
                "savedAlpha": {"fresh": 2},
            },
        )

    def test_summarize_json_source_watcher_live_reload(self) -> None:
        harness = load_harness_module()

        project_state = {
            "sectionImpls": {
                "json-impl-a": {
                    "type": "Dict",
                    "isJsonSource": True,
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamId": "old-root-a",
                    "codeObjVariantMap": {
                        "old-root-a": "old-root-a-variant",
                        "fresh-a": "fresh-a-variant",
                    },
                },
                "json-impl-b": {
                    "type": "Dict",
                    "isJsonSource": True,
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamId": "old-root-b",
                    "codeObjVariantMap": {
                        "old-root-b": "old-root-b-variant",
                        "fresh-b": "fresh-b-variant",
                    },
                },
            },
            "codeObjs": {
                "old-root-a": {"name": "alpha", "defaultVariant": "old-root-a-variant"},
                "old-root-b": {"name": "alpha", "defaultVariant": "old-root-b-variant"},
                "fresh-a": {"name": "fresh", "defaultVariant": "fresh-a-variant"},
                "fresh-b": {"name": "fresh", "defaultVariant": "fresh-b-variant"},
            },
            "codeObjVariants": {
                "old-root-a-variant": {"impl": "old-root-a-impl"},
                "old-root-b-variant": {"impl": "old-root-b-impl"},
                "fresh-a-variant": {"impl": "fresh-a-impl"},
                "fresh-b-variant": {"impl": "fresh-b-impl"},
            },
            "codeObjImpls": {
                "old-root-a-impl": {"type": "NestedParam", "children": ["fresh-a"]},
                "old-root-b-impl": {"type": "NestedParam", "children": ["fresh-b"]},
                "fresh-a-impl": {"type": "CodeParam", "value": "3"},
                "fresh-b-impl": {"type": "CodeParam", "value": "3"},
            },
        }

        summary = harness.summarize_json_source_watcher_live_reload(
            load_http_status=200,
            websocket_messages=[
                {
                    "messageType": "UpdateFrontendProjectState",
                    "content": {"projectState": project_state},
                }
            ],
            latest_http_status=200,
            latest_payload={"projectState": project_state},
        )

        self.assertEqual(
            summary,
            {
                "loadProjectConfigStatus": 200,
                "latestProjectStateStatus": 200,
                "websocketUpdateReceived": True,
                "websocketTarget": {
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamChanged": False,
                    "oldRootPresent": True,
                    "oldLeafPresent": False,
                    "codeObjVariantMapSize": 2,
                    "tree": {
                        "name": "alpha",
                        "type": "NestedParam",
                        "children": [
                            {
                                "name": "fresh",
                                "type": "CodeParam",
                                "value": "3",
                            }
                        ],
                    },
                },
                "websocketPeer": {
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamChanged": False,
                    "oldRootPresent": True,
                    "oldLeafPresent": False,
                    "codeObjVariantMapSize": 2,
                    "tree": {
                        "name": "alpha",
                        "type": "NestedParam",
                        "children": [
                            {
                                "name": "fresh",
                                "type": "CodeParam",
                                "value": "3",
                            }
                        ],
                    },
                },
                "latestTarget": {
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamChanged": False,
                    "oldRootPresent": True,
                    "oldLeafPresent": False,
                    "codeObjVariantMapSize": 2,
                    "tree": {
                        "name": "alpha",
                        "type": "NestedParam",
                        "children": [
                            {
                                "name": "fresh",
                                "type": "CodeParam",
                                "value": "3",
                            }
                        ],
                    },
                },
                "latestPeer": {
                    "jsonSourceKeys": ["alpha"],
                    "jsonSourceMissing": False,
                    "topLevelParamChanged": False,
                    "oldRootPresent": True,
                    "oldLeafPresent": False,
                    "codeObjVariantMapSize": 2,
                    "tree": {
                        "name": "alpha",
                        "type": "NestedParam",
                        "children": [
                            {
                                "name": "fresh",
                                "type": "CodeParam",
                                "value": "3",
                            }
                        ],
                    },
                },
            },
        )

    def test_summarize_json_source_save_restart_round_trip_canonical_storage_failure(
        self,
    ) -> None:
        harness = load_harness_module()

        summary = harness.summarize_json_source_save_restart_round_trip_canonical_storage(
            save_http_status=200,
            restart_startup_error="backend exited on startup",
            restart_load_http_status=None,
            restart_load_payload=None,
            restart_latest_http_status=None,
            restart_latest_payload=None,
            persisted_project=None,
            saved_payload=None,
        )

        self.assertEqual(
            summary,
            {
                "saveProjectStatus": 200,
                "restartStartupStatus": "failed",
                "restartStartupErrorSummary": "backend exited on startup",
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
