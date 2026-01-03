import unittest
from pathlib import Path
from types import SimpleNamespace

from setta.database.utils import create_new_id
from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
from setta.routers.share_deployments import (
    PublishShareDeploymentRequest,
    route_get_latest_share_deployment,
    route_list_share_deployment_versions,
    route_publish_share_deployment,
)
from setta.types.artifact import ArtifactType, DrawAreaLayer, DrawAreaLayerItem
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import (
    get_variant_base_and_effective_section_impl_with_type_guard,
)
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import (
    ChartSectionImpl,
    CodeFileAccessMode,
    CodeFileBinding,
    CodeSectionImpl,
    DictSectionImpl,
    DrawSectionImpl,
    ImageSectionImpl,
)
from setta.types.share_deployment import ShareDeploymentManifest, SharePolicy
from setta.utils.constants import C

from tests.utils.manager_fixture import real_project_manager, real_settings_manager


def _write_bytes(path: Path, content: bytes = b"data") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def _write_text(path: Path, content: str = "{}") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def _create_section(impl, *, variant_name: str | None = None):
    section_id = create_new_id()
    variant_id = create_new_id()
    variant = Variant(
        id=variant_id,
        name=variant_name or f"{section_id}_variant",
        impl=impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(impl),
    )
    core = Core(
        id=section_id,
        variants=[variant_id],
        defaultVariant=variant_id,
    )
    return section_id, core, variant


class ShareDeploymentPublishTests(unittest.IsolatedAsyncioTestCase):
    async def test_publish_share_deployment_writes_manifest_and_policy(self) -> None:
        try:
            async with (
                real_project_manager() as project_fixture,
                real_settings_manager() as settings_fixture,
            ):
                original_share_root = C.SHARE_DEPLOYMENTS_FOLDER
                C.SHARE_DEPLOYMENTS_FOLDER = (
                    project_fixture.setta_root / "share_deployments"
                )
                self.addCleanup(
                    setattr, C, "SHARE_DEPLOYMENTS_FOLDER", original_share_root
                )

                switcher = ProjectManagerSwitcher(
                    project_fixture.manager,
                    settings_fixture.manager,
                )
                state = SimpleNamespace(
                    dbe=project_fixture.dbe,
                    project_manager_switcher=switcher,
                )
                project_config_id = (
                    project_fixture.manager.project_state_backend.defaultProjectConfigId
                )
                if project_config_id is None:
                    self.fail("Expected a default project config id for publishing.")

                request = PublishShareDeploymentRequest(
                    projectConfigId=project_config_id
                )
                metadata = await route_publish_share_deployment(request, state)

                manifest_path = metadata.deploymentRoot / "manifest.json"
                policy_path = metadata.deploymentRoot / "share_policy.json"
                project_path = metadata.deploymentRoot / "project.json"

                self.assertTrue(manifest_path.exists())
                self.assertTrue(policy_path.exists())
                self.assertTrue(project_path.exists())

                manifest = ShareDeploymentManifest.model_validate(
                    project_fixture.dbe.read_json(manifest_path)
                )
                policy = SharePolicy.model_validate(
                    project_fixture.dbe.read_json(policy_path)
                )
                project_config = project_fixture.manager.project_state_backend.projectConfigs[
                    project_config_id
                ]

                self.assertEqual(1, manifest.version)
                self.assertEqual(project_config_id, manifest.projectConfigId)
                self.assertEqual(project_config.name, manifest.projectConfigName)
                self.assertEqual(metadata.projectConfigName, manifest.projectConfigName)
                self.assertEqual(
                    metadata.deploymentVersion, manifest.deploymentVersion
                )
                self.assertIsNone(manifest.listener)
                self.assertFalse(policy.allowRun)
                self.assertFalse(policy.allowLLM)
                self.assertFalse(policy.allowMCP)
                self.assertEqual(policy_path, metadata.sharePolicyPath)
        except RuntimeError as exc:
            self.skipTest(str(exc))

    async def test_publish_share_deployment_rebases_paths(self) -> None:
        try:
            async with (
                real_project_manager() as project_fixture,
                real_settings_manager() as settings_fixture,
            ):
                original_share_root = C.SHARE_DEPLOYMENTS_FOLDER
                C.SHARE_DEPLOYMENTS_FOLDER = (
                    project_fixture.setta_root / "share_deployments"
                )
                self.addCleanup(
                    setattr, C, "SHARE_DEPLOYMENTS_FOLDER", original_share_root
                )

                project_config_id = (
                    project_fixture.manager.project_state_backend.defaultProjectConfigId
                )
                if project_config_id is None:
                    self.fail("Expected a default project config id for publishing.")

                project_config = ProjectConfig(
                    id=project_config_id,
                    name="share_publish_project",
                )

                image_path = project_fixture.artifacts_folder / "image.png"
                chart_path = project_fixture.artifacts_folder / "chart.csv"
                draw_data_path = project_fixture.artifacts_folder / "draw_data.png"
                draw_transform_path = (
                    project_fixture.artifacts_folder / "draw_transform.json"
                )
                code_path = (
                    project_fixture.code_folder
                    / "sections"
                    / project_config.name
                    / "custom.py"
                )
                json_source_path = (
                    project_fixture.setta_root / "json_sources" / "source.json"
                )

                _write_bytes(image_path)
                _write_text(chart_path, "x,y\n1,2\n")
                _write_bytes(draw_data_path)
                _write_text(draw_transform_path, '{"transform":[1,0,0,1,0,0]}')
                _write_text(code_path, "print('hello')\n")
                _write_text(json_source_path, '{"root": {}}')

                image_impl = ImageSectionImpl(imagePath=str(image_path))
                image_section_id, image_core, image_variant = _create_section(
                    image_impl
                )

                chart_impl = ChartSectionImpl(dataPath=str(chart_path))
                chart_section_id, chart_core, chart_variant = _create_section(
                    chart_impl
                )

                draw_item = DrawAreaLayerItem(
                    type=ArtifactType.Image,
                    dataPath=str(draw_data_path),
                    transformId=str(draw_transform_path),
                )
                draw_impl = DrawSectionImpl(
                    layers=[DrawAreaLayer(name="Layer", elements=[draw_item])]
                )
                draw_section_id, draw_core, draw_variant = _create_section(draw_impl)

                code_binding = CodeFileBinding(
                    canonical_path=code_path,
                    access_mode=CodeFileAccessMode.read_write,
                )
                code_impl = CodeSectionImpl(codeFileBinding=code_binding)
                code_section_id, code_core, code_variant = _create_section(code_impl)

                dict_impl = DictSectionImpl(isJsonSource=True)
                dict_section_id, dict_core, dict_variant = _create_section(
                    dict_impl,
                    variant_name=str(json_source_path),
                )

                sections = {
                    image_section_id: image_core,
                    chart_section_id: chart_core,
                    draw_section_id: draw_core,
                    code_section_id: code_core,
                    dict_section_id: dict_core,
                }
                section_impls = {
                    image_impl.id: image_impl,
                    chart_impl.id: chart_impl,
                    draw_impl.id: draw_impl,
                    code_impl.id: code_impl,
                    dict_impl.id: dict_impl,
                }
                section_variants = {
                    image_variant.id: image_variant,
                    chart_variant.id: chart_variant,
                    draw_variant.id: draw_variant,
                    code_variant.id: code_variant,
                    dict_variant.id: dict_variant,
                }
                project_config.sectionVariantMap = {
                    image_section_id: image_variant.id,
                    chart_section_id: chart_variant.id,
                    draw_section_id: draw_variant.id,
                    code_section_id: code_variant.id,
                    dict_section_id: dict_variant.id,
                }
                project_config.topLevelSections = {
                    image_section_id: TopLevelSectionLayout(),
                    chart_section_id: TopLevelSectionLayout(),
                    draw_section_id: TopLevelSectionLayout(),
                    code_section_id: TopLevelSectionLayout(),
                    dict_section_id: TopLevelSectionLayout(),
                }

                project_state_backend = ProjectStateBackend(
                    projectConfigs={project_config_id: project_config},
                    defaultProjectConfigId=project_config_id,
                    sections=sections,
                    sectionImpls=section_impls,
                    sectionVariants=section_variants,
                )
                project_fixture.dbe.write_project(project_state_backend)

                switcher = ProjectManagerSwitcher(
                    project_fixture.manager,
                    settings_fixture.manager,
                )
                state = SimpleNamespace(
                    dbe=project_fixture.dbe,
                    project_manager_switcher=switcher,
                )
                request = PublishShareDeploymentRequest(
                    projectConfigId=project_config_id
                )
                metadata = await route_publish_share_deployment(request, state)

                deployment_root = metadata.deploymentRoot
                snapshot = ProjectStateBackend.model_validate(
                    project_fixture.dbe.read_json(deployment_root / "project.json")
                )

                self.assertIn(image_section_id, snapshot.sections)
                image_variant_id = snapshot.sections[image_section_id].variants[0]
                _, _, image_effective = (
                    get_variant_base_and_effective_section_impl_with_type_guard(
                        snapshot,
                        snapshot.sections[image_section_id],
                        image_variant_id,
                        ImageSectionImpl,
                    )
                )
                image_target = Path(image_effective.imagePath)
                self.assertFalse(image_target.is_absolute())
                resolved_image = (deployment_root / image_target).resolve()
                self.assertTrue(
                    resolved_image.is_relative_to(deployment_root / "artifacts")
                )
                self.assertTrue(resolved_image.exists())

                self.assertIn(chart_section_id, snapshot.sections)
                chart_variant_id = snapshot.sections[chart_section_id].variants[0]
                _, _, chart_effective = (
                    get_variant_base_and_effective_section_impl_with_type_guard(
                        snapshot,
                        snapshot.sections[chart_section_id],
                        chart_variant_id,
                        ChartSectionImpl,
                    )
                )
                chart_target = Path(chart_effective.dataPath)
                self.assertFalse(chart_target.is_absolute())
                resolved_chart = (deployment_root / chart_target).resolve()
                self.assertTrue(
                    resolved_chart.is_relative_to(deployment_root / "artifacts")
                )
                self.assertTrue(resolved_chart.exists())

                self.assertIn(draw_section_id, snapshot.sections)
                draw_variant_id = snapshot.sections[draw_section_id].variants[0]
                _, _, draw_effective = (
                    get_variant_base_and_effective_section_impl_with_type_guard(
                        snapshot,
                        snapshot.sections[draw_section_id],
                        draw_variant_id,
                        DrawSectionImpl,
                    )
                )
                draw_layer = draw_effective.layers[0]
                draw_element = draw_layer.elements[0]
                draw_data_target = Path(draw_element.dataPath)
                draw_transform_target = Path(draw_element.transformId)
                self.assertFalse(draw_data_target.is_absolute())
                self.assertFalse(draw_transform_target.is_absolute())
                resolved_draw_data = (deployment_root / draw_data_target).resolve()
                resolved_draw_transform = (
                    deployment_root / draw_transform_target
                ).resolve()
                self.assertTrue(
                    resolved_draw_data.is_relative_to(deployment_root / "artifacts")
                )
                self.assertTrue(
                    resolved_draw_transform.is_relative_to(deployment_root / "artifacts")
                )
                self.assertTrue(resolved_draw_data.exists())
                self.assertTrue(resolved_draw_transform.exists())

                self.assertIn(code_section_id, snapshot.sections)
                code_variant_id = snapshot.sections[code_section_id].variants[0]
                _, _, code_effective = (
                    get_variant_base_and_effective_section_impl_with_type_guard(
                        snapshot,
                        snapshot.sections[code_section_id],
                        code_variant_id,
                        CodeSectionImpl,
                    )
                )
                if code_effective.codeFileBinding is None:
                    self.fail("Expected code file binding in published snapshot.")
                code_target = Path(code_effective.codeFileBinding.canonical_path)
                self.assertFalse(code_target.is_absolute())
                resolved_code = (deployment_root / code_target).resolve()
                self.assertTrue(resolved_code.is_relative_to(deployment_root / "code"))
                self.assertTrue(resolved_code.exists())

                self.assertIn(dict_section_id, snapshot.sections)
                dict_variant_id = snapshot.sections[dict_section_id].variants[0]
                self.assertIn(dict_variant_id, snapshot.sectionVariants)
                dict_variant = snapshot.sectionVariants[dict_variant_id]
                dict_target = Path(dict_variant.name)
                self.assertFalse(dict_target.is_absolute())
                resolved_dict = (deployment_root / dict_target).resolve()
                self.assertTrue(
                    resolved_dict.is_relative_to(deployment_root / "json_sources")
                )
                self.assertTrue(resolved_dict.exists())
        except RuntimeError as exc:
            self.skipTest(str(exc))

    async def test_list_versions_and_latest(self) -> None:
        try:
            async with (
                real_project_manager() as project_fixture,
                real_settings_manager() as settings_fixture,
            ):
                original_share_root = C.SHARE_DEPLOYMENTS_FOLDER
                C.SHARE_DEPLOYMENTS_FOLDER = (
                    project_fixture.setta_root / "share_deployments"
                )
                self.addCleanup(
                    setattr, C, "SHARE_DEPLOYMENTS_FOLDER", original_share_root
                )

                switcher = ProjectManagerSwitcher(
                    project_fixture.manager,
                    settings_fixture.manager,
                )
                state = SimpleNamespace(
                    dbe=project_fixture.dbe,
                    project_manager_switcher=switcher,
                )
                project_config_id = (
                    project_fixture.manager.project_state_backend.defaultProjectConfigId
                )
                if project_config_id is None:
                    self.fail("Expected a default project config id for publishing.")
                project_config = (
                    project_fixture.manager.project_state_backend.projectConfigs[
                        project_config_id
                    ]
                )

                first = await route_publish_share_deployment(
                    PublishShareDeploymentRequest(projectConfigId=project_config_id),
                    state,
                )
                second = await route_publish_share_deployment(
                    PublishShareDeploymentRequest(projectConfigId=project_config_id),
                    state,
                )

                versions = route_list_share_deployment_versions(project_config.name)
                self.assertEqual(
                    [second.deploymentVersion, first.deploymentVersion],
                    [entry.deploymentVersion for entry in versions],
                )
                self.assertTrue(
                    all(
                        entry.projectConfigName == project_config.name
                        for entry in versions
                    )
                )

                latest = route_get_latest_share_deployment(project_config.name)
                self.assertEqual(second.deploymentVersion, latest.deploymentVersion)
                self.assertEqual(project_config.name, latest.projectConfigName)
        except RuntimeError as exc:
            self.skipTest(str(exc))
