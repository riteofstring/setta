from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING

from setta.types.code_obj_impls import DropzoneParamCodeObjImpl
from setta.types.dropzone import rewrite_dropzone_attachment_paths
from setta.types.generated.effective_impls import set_effective_impl_value
from setta.types.helpers_lvl1 import (
    get_variant_base_and_effective_code_obj_impl,
    get_variant_base_and_effective_section_impl,
)
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BaseDictSectionImpl,
    BaseSectionWithParamsImpl,
    ChartSectionImpl,
    CodeFileBinding,
    DrawSectionImpl,
    ImageSectionImpl,
    MetaControlSectionImpl,
)

if TYPE_CHECKING:
    from setta.types.project_state import ProjectStateCore


def parse_share_deployment_version(value: str) -> int | None:
    if not value.startswith("v"):
        return None
    suffix = value[1:]
    if not suffix.isdigit():
        return None
    return int(suffix)


def iter_share_deployment_versions(project_root: Path) -> list[tuple[int, Path]]:
    versions: list[tuple[int, Path]] = []
    if not project_root.exists():
        return versions
    for entry in project_root.iterdir():
        if not entry.is_dir():
            continue
        version_number = parse_share_deployment_version(entry.name)
        if version_number is None:
            continue
        versions.append((version_number, entry))
    return versions


ArtifactPathResolver = Callable[[str], str]
CodeBindingResolver = Callable[[CodeFileBinding], CodeFileBinding]
JsonSourceResolver = Callable[[str], str]


def rewrite_project_state_paths(
    project_state: "ProjectStateCore",
    *,
    resolve_artifact_path: ArtifactPathResolver,
    resolve_code_binding: CodeBindingResolver,
    resolve_json_source_name: JsonSourceResolver,
) -> None:
    for section in project_state.sections.values():
        for variant_id in section.variants:
            variant, base_impl, impl = get_variant_base_and_effective_section_impl(
                project_state, section, variant_id
            )

            if isinstance(impl, ImageSectionImpl) and impl.imagePath:
                new_path = resolve_artifact_path(impl.imagePath)
                if new_path != impl.imagePath:
                    set_effective_impl_value(
                        base_impl, section, variant, {"imagePath": new_path}
                    )

            if isinstance(impl, ChartSectionImpl) and impl.dataPath:
                new_path = resolve_artifact_path(impl.dataPath)
                if new_path != impl.dataPath:
                    set_effective_impl_value(
                        base_impl, section, variant, {"dataPath": new_path}
                    )

            if isinstance(impl, DrawSectionImpl):
                if impl.renderedImagePath:
                    new_path = resolve_artifact_path(impl.renderedImagePath)
                    if new_path != impl.renderedImagePath:
                        set_effective_impl_value(
                            base_impl,
                            section,
                            variant,
                            {"renderedImagePath": new_path},
                        )
                if impl.layers:
                    updated_layers = []
                    layers_changed = False
                    for layer in impl.layers:
                        updated_elements = []
                        layer_changed = False
                        for element in layer.elements:
                            new_data_path = resolve_artifact_path(element.dataPath)
                            new_transform_id = resolve_artifact_path(
                                element.transformId
                            )
                            if (
                                new_data_path != element.dataPath
                                or new_transform_id != element.transformId
                            ):
                                layer_changed = True
                                updated_elements.append(
                                    element.model_copy(
                                        update={
                                            "dataPath": new_data_path,
                                            "transformId": new_transform_id,
                                        }
                                    )
                                )
                            else:
                                updated_elements.append(element)
                        if layer_changed:
                            layers_changed = True
                            updated_layers.append(
                                layer.model_copy(update={"elements": updated_elements})
                            )
                        else:
                            updated_layers.append(layer)
                    if layers_changed:
                        set_effective_impl_value(
                            base_impl, section, variant, {"layers": updated_layers}
                        )

            if isinstance(impl, BaseCodeSectionImpl) and impl.codeFileBinding:
                updated_binding = resolve_code_binding(impl.codeFileBinding)
                if updated_binding != impl.codeFileBinding:
                    set_effective_impl_value(
                        base_impl,
                        section,
                        variant,
                        {"codeFileBinding": updated_binding},
                    )

            if isinstance(impl, BaseDictSectionImpl) and impl.isJsonSource:
                new_name = resolve_json_source_name(variant.name)
                if new_name != variant.name:
                    variant.name = new_name

            if isinstance(impl, BaseSectionWithParamsImpl) or isinstance(
                impl, MetaControlSectionImpl
            ):
                for code_obj_id, code_obj_variant_id in impl.codeObjVariantMap.items():
                    if code_obj_id not in project_state.codeObjs:
                        raise KeyError(f"Unknown code object id {code_obj_id}")
                    if code_obj_variant_id not in project_state.codeObjVariants:
                        raise KeyError(
                            f"Unknown code object variant id {code_obj_variant_id}"
                        )
                    code_obj_core = project_state.codeObjs[code_obj_id]
                    (
                        code_obj_variant,
                        base_code_obj_impl,
                        effective_code_obj_impl,
                    ) = get_variant_base_and_effective_code_obj_impl(
                        project_state, code_obj_core, code_obj_variant_id
                    )
                    if isinstance(effective_code_obj_impl, DropzoneParamCodeObjImpl):
                        updated_value = rewrite_dropzone_attachment_paths(
                            effective_code_obj_impl.value, resolve_artifact_path
                        )
                        if updated_value != effective_code_obj_impl.value:
                            set_effective_impl_value(
                                base_code_obj_impl,
                                code_obj_core,
                                code_obj_variant,
                                {"value": updated_value},
                            )

    gen_binding = getattr(project_state, "genCodeBinding", None)
    if gen_binding is not None:
        updated_binding = resolve_code_binding(gen_binding)
        if updated_binding != gen_binding:
            project_state.genCodeBinding = updated_binding
