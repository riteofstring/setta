import unittest
from pathlib import Path

from setta.code_gen.utils import sanitize_slug
from setta.share.deployment_utils import rewrite_project_state_paths
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout
from setta.types.project_state import ProjectStateSingleConfig, SingletonSections
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    DrawSectionImpl,
    GenPythonCodeSectionImpl,
)


class ShareDeploymentUtilsTests(unittest.TestCase):
    def test_rewrite_project_state_paths_updates_gen_code_binding(self) -> None:
        project_config = ProjectConfig(name="Share Project")
        project_slug = sanitize_slug(project_config.name)
        code_root = Path("code") / "sections" / project_slug
        gen_binding = CodeFileBinding(
            canonical_path=code_root / "setta_gen.py",
            access_mode=CodeFileAccessMode.write_only,
        )
        gen_impl = GenPythonCodeSectionImpl(
            id=ID("gen-impl"),
            name="Generated",
            codeFileBinding=gen_binding,
        )
        gen_variant = Variant(
            id=ID("gen-variant"),
            name="Generated",
            impl=gen_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(gen_impl),
        )
        gen_section_id = ID("gen-section")
        gen_section = Core(
            id=gen_section_id,
            name="Generated",
            variants=[gen_variant.id],
            defaultVariant=gen_variant.id,
        )
        project_config.sectionVariantMap = {gen_section_id: gen_variant.id}

        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={gen_section_id: gen_section},
            sectionImpls={gen_impl.id: gen_impl},
            sectionVariants={gen_variant.id: gen_variant},
            singletonSections=SingletonSections(GenPythonCode=gen_section_id),
            genCodeBinding=gen_binding,
        )

        rebased_root = Path("rebased")

        def resolve_code_binding(binding: CodeFileBinding) -> CodeFileBinding:
            return CodeFileBinding(
                canonical_path=rebased_root / binding.canonical_path.name,
                access_mode=binding.access_mode,
            )

        rewrite_project_state_paths(
            project_state,
            resolve_artifact_path=lambda path_str: path_str,
            resolve_code_binding=resolve_code_binding,
            resolve_json_source_name=lambda path_str: path_str,
        )

        self.assertEqual(
            rebased_root / "setta_gen.py",
            project_state.genCodeBinding.canonical_path,
        )
        updated_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            gen_section_id,
            GenPythonCodeSectionImpl,
        )
        self.assertEqual(
            rebased_root / "setta_gen.py",
            updated_impl.codeFileBinding.canonical_path,
        )

    def test_rewrite_project_state_paths_updates_draw_snapshot_path(self) -> None:
        draw_impl = DrawSectionImpl(
            id=ID("draw-impl"),
            name="Draw",
            renderedImagePath="artifacts/draw.png",
        )
        draw_variant = Variant(
            id=ID("draw-variant"),
            name="Draw",
            impl=draw_impl.id,
            nonPresetImpls=compute_initial_nonPresetImpls(draw_impl),
        )
        draw_section_id = ID("draw-section")
        draw_section = Core(
            id=draw_section_id,
            name="Draw",
            variants=[draw_variant.id],
            defaultVariant=draw_variant.id,
        )
        project_config = ProjectConfig(
            name="Draw Project",
            sectionVariantMap={draw_section_id: draw_variant.id},
            topLevelSections={draw_section_id: TopLevelSectionLayout()},
        )
        project_state = ProjectStateSingleConfig(
            projectConfig=project_config,
            sections={draw_section_id: draw_section},
            sectionImpls={draw_impl.id: draw_impl},
            sectionVariants={draw_variant.id: draw_variant},
        )

        def resolve_artifact_path(path_str: str) -> str:
            return f"rebased/{path_str}"

        rewrite_project_state_paths(
            project_state,
            resolve_artifact_path=resolve_artifact_path,
            resolve_code_binding=lambda binding: binding,
            resolve_json_source_name=lambda path_str: path_str,
        )

        updated_impl = get_curr_effective_section_impl_with_type_guard(
            project_state,
            draw_section_id,
            DrawSectionImpl,
        )
        self.assertEqual(
            "rebased/artifacts/draw.png",
            updated_impl.renderedImagePath,
        )


if __name__ == "__main__":
    unittest.main()
