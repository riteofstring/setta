from setta.code_gen.dependency_graph import DependencyGraph, ParamNode
from setta.types.code_obj_impls import (
    CodeCallableCodeObjImpl,
    CodeObjType,
    SliderParamCodeObjImpl,
)
from setta.types.core import Core, Variant
from setta.types.dependency_key import create_dep_key
from setta.types.id import ID
from setta.types.project_config import (
    CodeObjTypeValuePolicy,
    CodeObjValueOverride,
    CodeObjValuePolicy,
    CodeObjValueRepresentationMode,
    ProjectCodegenPythonTarget,
    ProjectConfig,
    TopLevelSectionLayout,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import CallableSectionImpl
from tests.helpers.project_state_core import compute_initial_nonPresetImpls


def build_project_state(
    *,
    section_id: ID,
    callable_id: ID,
    param_id: ID,
    value_policy: CodeObjValuePolicy,
) -> ProjectStateSingleConfig:
    section_impl_id = ID("section-impl-1")
    section_variant_id = ID("section-variant-1")

    callable_impl_id = ID("callable-impl-1")
    callable_variant_id = ID("callable-variant-1")

    param_impl_id = ID("param-impl-1")
    param_variant_id = ID("param-variant-1")

    callable_impl = CodeCallableCodeObjImpl(
        id=callable_impl_id,
        children=[param_id],
    )
    callable_variant = Variant(
        id=callable_variant_id,
        impl=callable_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(callable_impl),
    )
    callable_core = Core(
        id=callable_id,
        name="Callable",
        variants=[callable_variant.id],
        defaultVariant=callable_variant.id,
    )

    param_impl = SliderParamCodeObjImpl(
        id=param_impl_id,
        value="42",
    )
    param_variant = Variant(
        id=param_variant_id,
        impl=param_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(param_impl),
    )
    param_core = Core(
        id=param_id,
        name="param",
        variants=[param_variant.id],
        defaultVariant=param_variant.id,
    )

    section_impl = CallableSectionImpl(
        id=section_impl_id,
        callable=callable_id,
        codeObjVariantMap={
            callable_id: callable_variant.id,
            param_id: param_variant.id,
        },
    )
    section_variant = Variant(
        id=section_variant_id,
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    section_core = Core(
        id=section_id,
        name="Section",
        variants=[section_variant.id],
        defaultVariant=section_variant.id,
    )

    project_config = ProjectConfig(
        id=ID("project-1"),
        name="CodeObjValuePolicyProject",
        sectionVariantMap={section_id: section_variant.id},
        topLevelSections={section_id: TopLevelSectionLayout()},
        codegenTargets=[
            ProjectCodegenPythonTarget(codeObjValuePolicy=value_policy),
        ],
    )

    return ProjectStateSingleConfig(
        projectConfig=project_config,
        sections={section_id: section_core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={section_variant.id: section_variant},
        codeObjs={callable_id: callable_core, param_id: param_core},
        codeObjImpls={callable_impl.id: callable_impl, param_impl.id: param_impl},
        codeObjVariants={
            callable_variant.id: callable_variant,
            param_variant.id: param_variant,
        },
    )


class TestCodeObjValuePolicyDependencyGraph:
    def test_param_node_uses_type_policy_representation(self) -> None:
        section_id = ID("section-1")
        callable_id = ID("callable-1")
        param_id = ID("param-1")
        policy = CodeObjValuePolicy()
        policy.typePolicies[CodeObjType.SliderParam] = CodeObjTypeValuePolicy(
            representation=CodeObjValueRepresentationMode.json_parsed
        )
        project_state = build_project_state(
            section_id=section_id,
            callable_id=callable_id,
            param_id=param_id,
            value_policy=policy,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        node = graph.graph[dep_key]
        assert isinstance(node, ParamNode)
        assert (
            node.value_representation
            == CodeObjValueRepresentationMode.json_parsed
        )

    def test_param_node_override_takes_precedence(self) -> None:
        section_id = ID("section-1")
        callable_id = ID("callable-1")
        param_id = ID("param-override")
        policy = CodeObjValuePolicy()
        policy.typePolicies[CodeObjType.SliderParam] = CodeObjTypeValuePolicy(
            representation=CodeObjValueRepresentationMode.string
        )
        policy.codeObjOverrides[param_id] = CodeObjValueOverride(
            representation=CodeObjValueRepresentationMode.json_parsed
        )
        project_state = build_project_state(
            section_id=section_id,
            callable_id=callable_id,
            param_id=param_id,
            value_policy=policy,
        )

        graph = DependencyGraph(project_state)
        dep_key = create_dep_key(sectionId=section_id, codeObjId=param_id)
        node = graph.graph[dep_key]
        assert isinstance(node, ParamNode)
        assert (
            node.value_representation
            == CodeObjValueRepresentationMode.json_parsed
        )
