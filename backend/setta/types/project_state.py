import copy

from pydantic import (
    BaseModel,
    Field,
    PrivateAttr,
    model_validator,
)

from setta.code_gen.utils import sanitize_slug
from setta.types.app_definition import AppDefinition
from setta.types.artifact import ArtifactType
from setta.types.code_obj_impls import BaseParamCodeObjImpl
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import set_effective_impl_value
from setta.types.generated.unions import (
    BaseCodeObjImplUnionWithDiscriminator,
    BaseSectionImplUnionWithDiscriminator,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl,
    get_curr_effective_section_impl,
    get_variant_base_and_effective_section_impl,
)
from setta.types.helpers_lvl2 import (
    BaseCodeSectionImplArgsWithCallable,
    get_section_path_full_name,
)
from setta.types.id import ID
from setta.types.project_config import (
    ProjectCodegenLanguage,
    ProjectConfig,
    ViewModeConfig,
    get_python_codegen_target,
    project_config_has_codegen_language,
)
from setta.types.section_impls import (
    BaseCodeSectionImpl,
    BaseParentSectionImpl,
    BaseSectionWithParamsImpl,
    CodeFileAccessMode,
    CodeFileBinding,
    CodeLanguage,
    CodeLanguageKey,
    DrawSectionImpl,
    GenPythonCodeSectionImpl,
    GenPythonMetadataSectionImpl,
    MetaControlSectionImpl,
    SectionType,
    code_language_to_string,
    normalize_code_language,
)
from setta.types.shown_params import (
    ShownParamIds,
    get_param_ids_to_show,
)
from setta.utils.constants import C
from setta.utils.name_validation import (
    get_section_slug_conflict_ids,
    validate_param_name_format,
    validate_project_name_format,
    validate_section_name_format,
)
from setta.utils.paths import normalize_state_path
from setta.utils.utils import (
    GEN_CODE_META_FILENAME,
    build_gen_code_path,
    build_project_sections_dir,
)

SINGLETON_SECTION_TYPES = set(
    [
        SectionType.GlobalVariables,
        SectionType.GenPythonCode,
        SectionType.GenPythonMetadata,
    ]
)

CODE_LANGUAGE_EXTENSIONS = {
    CodeLanguage.python: "py",
    CodeLanguage.bash: "sh",
    CodeLanguage.javascript: "js",
    CodeLanguage.typescript: "ts",
    CodeLanguage.json: "json",
    CodeLanguage.yaml: "yml",
    CodeLanguage.markdown: "md",
    CodeLanguage.plaintext: "txt",
}

RUNNABLE_CODE_LANGUAGES = {CodeLanguage.python, CodeLanguage.bash}
DEFAULT_CODE_LANGUAGE_EXTENSION = "txt"


def get_code_language_extension(language: CodeLanguageKey) -> str:
    normalized_language = normalize_code_language(language)
    if normalized_language in CODE_LANGUAGE_EXTENSIONS:
        return CODE_LANGUAGE_EXTENSIONS[normalized_language]
    language_key = code_language_to_string(normalized_language)
    normalized = "".join(
        char.lower() if char.isalnum() else "_" for char in language_key
    ).strip("_")
    return normalized or DEFAULT_CODE_LANGUAGE_EXTENSION


class SingletonSections(BaseModel, extra="forbid"):
    GlobalVariables: ID | None = None
    GenPythonCode: ID | None = None
    GenPythonMetadata: ID | None = None


class ProjectStateCore(BaseModel, extra="forbid"):
    sections: dict[ID, Core] = Field(default_factory=dict)
    sectionImpls: dict[ID, BaseSectionImplUnionWithDiscriminator] = Field(
        default_factory=dict
    )
    sectionVariants: dict[ID, Variant] = Field(default_factory=dict)
    codeObjs: dict[ID, Core] = Field(default_factory=dict)
    codeObjImpls: dict[ID, BaseCodeObjImplUnionWithDiscriminator] = Field(
        default_factory=dict
    )
    codeObjVariants: dict[ID, Variant] = Field(default_factory=dict)


class ProjectStateBackend(
    ProjectStateCore,
    extra="forbid",
):
    projectConfigs: dict[ID, ProjectConfig] = Field(default_factory=dict)
    defaultProjectConfigId: ID | None = None
    appDefinition: AppDefinition | None = None

    @model_validator(mode="after")
    def _validate_default_project_id(self):
        return self.validate_default_project_id()

    def validate_default_project_id(self):
        if self.projectConfigs:
            # If projects exist, use first key when defaultProjectConfigId is None
            if (
                self.defaultProjectConfigId is None
                or self.defaultProjectConfigId not in self.projectConfigs
            ):
                self.defaultProjectConfigId = next(iter(self.projectConfigs))
        else:
            # If projects is empty, defaultProjectConfigId should be None
            self.defaultProjectConfigId = None
        return self


class ProjectStateSingleConfig(ProjectStateCore, extra="forbid"):
    projectConfig: ProjectConfig
    singletonSections: SingletonSections = Field(default_factory=SingletonSections)
    parentSectionMap: dict[ID, ID | None] = Field(default_factory=dict)
    shownParamIds: dict[ID, ShownParamIds] = Field(default_factory=dict)
    requiredDecodedImages: list[str] = Field(default_factory=list)
    genCodeBinding: CodeFileBinding | None = None
    _section_slug_cache: tuple[dict[ID, str], dict[str, list[ID]]] | None = PrivateAttr(
        default=None
    )

    @model_validator(mode="after")
    def _validate_singleton_sections(self):
        return self.validate_singleton_sections()

    @model_validator(mode="after")
    def _validate_active_ids(self):
        return self.validate_active_ids()

    @model_validator(mode="after")
    def _validate_parent_section_map(self):
        return self.validate_parent_section_map()

    @model_validator(mode="after")
    def _validate_shown_param_ids(self):
        return self.validate_shown_param_ids()

    @model_validator(mode="after")
    def _validate_required_decoded_images(self):
        return self.validate_required_decoded_images()

    @model_validator(mode="after")
    def _validate_code_file_bindings(self):
        return self.validate_code_file_bindings()

    @model_validator(mode="after")
    def _validate_view_modes(self):
        return self.validate_view_modes()

    def validate_for_update(
        self,
        *,
        validate_code_file_bindings: bool,
        allow_reserved_project_name: bool = False,
        validate_name_rules: bool = True,
    ):
        self.validate_singleton_sections()
        self.validate_parent_section_map()
        if validate_name_rules:
            self.validate_name_rules(
                allow_reserved_project_name=allow_reserved_project_name
            )
        self.validate_view_modes()
        self.validate_shown_param_ids()
        self.validate_required_decoded_images()
        if validate_code_file_bindings:
            self.validate_code_file_bindings()
        return self

    def validate_singleton_sections(self):
        output = SingletonSections()
        found = set()

        for s in self.sections.values():
            if len(found) == len(SINGLETON_SECTION_TYPES):
                break

            sectionImpl = get_curr_effective_section_impl(self, s.id)

            for section_type in SINGLETON_SECTION_TYPES:
                attr_name = section_type.value
                if attr_name not in found and sectionImpl.type == section_type:
                    setattr(output, attr_name, s.id)
                    found.add(attr_name)
                    break

        self.singletonSections = output
        return self

    def validate_active_ids(self):
        self.projectConfig.activeIds = [
            x for x in self.projectConfig.activeIds if x in self.sections
        ]
        return self

    def validate_parent_section_map(self):
        self.parentSectionMap = {}
        for sectionId in self.sections.keys():
            if sectionId not in self.parentSectionMap:
                self.parentSectionMap[sectionId] = None
            impl = get_curr_effective_section_impl(self, sectionId)
            if isinstance(impl, BaseParentSectionImpl):
                for c in impl.children:
                    self.parentSectionMap[c] = sectionId
        self._section_slug_cache = None
        return self

    def validate_shown_param_ids(self):
        output: dict[ID, ShownParamIds] = {}
        for s in self.sections.values():
            for v in s.variants:
                _, _, impl = get_variant_base_and_effective_section_impl(self, s, v)
                if not isinstance(impl, BaseSectionWithParamsImpl):
                    continue
                output[v] = get_param_ids_to_show(self, impl)
        self.shownParamIds = output
        return self

    def validate_required_decoded_images(self):
        output: set[str] = set()
        for s in self.sections.values():
            for v in s.variants:
                _, _, impl = get_variant_base_and_effective_section_impl(self, s, v)
                if not isinstance(impl, DrawSectionImpl):
                    continue
                for layer in impl.layers:
                    for el in layer.elements:
                        if el.type == ArtifactType.Image:
                            output.add(el.dataPath)
        self.requiredDecodedImages = list(output)
        return self

    def validate_name_rules(self, *, allow_reserved_project_name: bool = False):
        validate_project_name_format(
            self.projectConfig.name,
            allow_reserved=allow_reserved_project_name,
        )
        for section_id, section in self.sections.items():
            validate_section_name_format(section.name)
            section_impl = get_curr_effective_section_impl(self, section_id)
            if isinstance(section_impl, BaseSectionWithParamsImpl):
                for code_obj_id in section_impl.codeObjVariantMap:
                    if code_obj_id not in self.codeObjs:
                        raise KeyError(
                            f"Missing code obj {code_obj_id} in project state."
                        )
                    code_obj_impl = get_curr_effective_code_obj_impl(
                        self,
                        section_id,
                        code_obj_id,
                    )
                    if not isinstance(code_obj_impl, BaseParamCodeObjImpl):
                        continue
                    validate_param_name_format(
                        self,
                        section_id,
                        code_obj_id,
                        self.codeObjs[code_obj_id].name,
                    )
                continue
            if isinstance(section_impl, MetaControlSectionImpl):
                for code_obj_id in section_impl.codeObjVariantMap:
                    if code_obj_id not in self.codeObjs:
                        raise KeyError(
                            f"Missing code obj {code_obj_id} in project state."
                        )
                    code_obj_impl = get_curr_effective_code_obj_impl(
                        self,
                        section_id,
                        code_obj_id,
                    )
                    if not isinstance(code_obj_impl, BaseParamCodeObjImpl):
                        continue
                    validate_param_name_format(
                        self,
                        section_id,
                        code_obj_id,
                        self.codeObjs[code_obj_id].name,
                    )
        return self

    def validate_code_file_bindings(self):
        code_root = C.CODE_FOLDER
        canonical_sections_dir = build_project_sections_dir(
            code_root, self.projectConfig.name
        )
        gen_code_path = build_gen_code_path(code_root, self.projectConfig.name)
        gen_meta_path = gen_code_path.with_name(GEN_CODE_META_FILENAME)
        gen_code_binding: CodeFileBinding | None = None
        python_target = get_python_codegen_target(self.projectConfig)
        python_codegen_enabled = project_config_has_codegen_language(
            self.projectConfig,
            ProjectCodegenLanguage.python,
        )
        metadata_enabled = bool(python_target and python_target.generateMetadata)
        conflicting_section_ids = get_section_slug_conflict_ids(self)

        for section_id, variant_id in self.projectConfig.sectionVariantMap.items():
            core = self.sections[section_id]
            variant = self.sectionVariants[variant_id]
            variant, base_impl, effective_impl = (
                get_variant_base_and_effective_section_impl(self, core, variant_id)
            )

            if not isinstance(base_impl, BaseCodeSectionImpl) or not isinstance(
                effective_impl, BaseCodeSectionImpl
            ):
                continue
            is_gen_section = isinstance(
                effective_impl,
                (GenPythonCodeSectionImpl, GenPythonMetadataSectionImpl),
            )
            canonical_binding_path = None
            if not is_gen_section:
                section_full_name = get_section_path_full_name(self, section_id)
                section_slug = sanitize_slug(section_full_name)
                language = effective_impl.codeLanguage
                extension = get_code_language_extension(language)
                canonical_binding_path = normalize_state_path(
                    canonical_sections_dir / f"{section_slug}.{extension}"
                )
            binding = effective_impl.codeFileBinding
            if section_id in conflicting_section_ids and not is_gen_section:
                if binding is not None and binding.autoBinding:
                    set_effective_impl_value(
                        base_impl,
                        core,
                        variant,
                        BaseCodeSectionImplArgsWithCallable(codeFileBinding=None),
                    )
                continue
            if binding is not None:
                if isinstance(effective_impl, GenPythonCodeSectionImpl):
                    if python_codegen_enabled:
                        gen_code_binding = binding
                    else:
                        set_effective_impl_value(
                            base_impl,
                            core,
                            variant,
                            BaseCodeSectionImplArgsWithCallable(codeFileBinding=None),
                        )
                elif isinstance(effective_impl, GenPythonMetadataSectionImpl):
                    if not (python_codegen_enabled and metadata_enabled):
                        set_effective_impl_value(
                            base_impl,
                            core,
                            variant,
                            BaseCodeSectionImplArgsWithCallable(codeFileBinding=None),
                        )
                continue

            if isinstance(effective_impl, GenPythonCodeSectionImpl):
                if not python_codegen_enabled:
                    continue
                canonical_path = normalize_state_path(gen_code_path)
                access_mode = CodeFileAccessMode.write_only
            elif isinstance(effective_impl, GenPythonMetadataSectionImpl):
                if not (python_codegen_enabled and metadata_enabled):
                    continue
                canonical_path = normalize_state_path(gen_meta_path)
                access_mode = CodeFileAccessMode.write_only
            else:
                canonical_path = canonical_binding_path
                access_mode = CodeFileAccessMode.read_write

            binding = CodeFileBinding(
                canonical_path=canonical_path,
                access_mode=access_mode,
                autoBinding=True,
            )
            set_effective_impl_value(
                base_impl,
                core,
                variant,
                BaseCodeSectionImplArgsWithCallable(codeFileBinding=binding),
            )
            if isinstance(effective_impl, GenPythonCodeSectionImpl):
                gen_code_binding = binding
        if gen_code_binding is None and python_codegen_enabled:
            gen_code_binding = CodeFileBinding(
                canonical_path=normalize_state_path(gen_code_path),
                access_mode=CodeFileAccessMode.write_only,
                autoBinding=True,
            )
        self.genCodeBinding = gen_code_binding
        return self

    def validate_view_modes(self):
        project_config = self.projectConfig
        if not project_config.viewModes:
            visibility_by_section_id = {
                section_id: True for section_id in self.sections.keys()
            }
            view_mode = ViewModeConfig(
                visibilityBySectionId=visibility_by_section_id,
            )
            view_mode.topLevelSections = copy.deepcopy(project_config.topLevelSections)
            view_mode.viewport = copy.deepcopy(project_config.viewport)
            view_mode.viewportInitialized = project_config.viewportInitialized
            project_config.viewModes[view_mode.id] = view_mode
            project_config.activeViewModeId = view_mode.id
            return self

        section_ids = set(self.sections.keys())
        top_level_sections = project_config.topLevelSections
        stale_top_level_ids = [
            section_id
            for section_id in top_level_sections
            if section_id not in section_ids
        ]
        for section_id in stale_top_level_ids:
            del top_level_sections[section_id]
        for view_mode in project_config.viewModes.values():
            visibility = view_mode.visibilityBySectionId
            for section_id in section_ids:
                if section_id not in visibility:
                    visibility[section_id] = True

            stale_ids = [
                section_id for section_id in visibility if section_id not in section_ids
            ]
            for section_id in stale_ids:
                del visibility[section_id]

            if not view_mode.topLevelSections:
                view_mode.topLevelSections = copy.deepcopy(top_level_sections)
            else:
                for section_id, layout in top_level_sections.items():
                    if section_id not in view_mode.topLevelSections:
                        view_mode.topLevelSections[section_id] = layout.model_copy(
                            deep=True
                        )
                for section_id in list(view_mode.topLevelSections.keys()):
                    if section_id not in top_level_sections:
                        del view_mode.topLevelSections[section_id]

            if view_mode.viewport is None:
                view_mode.viewportInitialized = False

        sort_indices = [
            view_mode.sortIndex for view_mode in project_config.viewModes.values()
        ]
        if len(set(sort_indices)) != len(sort_indices):
            for idx, view_mode in enumerate(project_config.viewModes.values()):
                view_mode.sortIndex = idx

        if project_config.activeViewModeId not in project_config.viewModes:
            project_config.activeViewModeId = next(iter(project_config.viewModes))
        active_view_mode = project_config.viewModes[project_config.activeViewModeId]
        project_config.topLevelSections = active_view_mode.topLevelSections
        project_config.viewport = active_view_mode.viewport
        project_config.viewportInitialized = active_view_mode.viewportInitialized
        return self


class AllProjectMetadata(BaseModel):
    defaultProjectConfigId: str | None
    projectMetadata: list[ProjectConfig]
