from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.helpers_lvl3 import copy_sections_and_other_info
from setta.types.id import ID
from setta.types.project_state import ProjectStateCore
from setta.types.section_impls import CodeSectionImpl, TerminalSectionImpl


def _build_core_with_variants():
    code_section_id = ID("section-code")
    terminal_section_id = ID("section-terminal")

    code_impl = CodeSectionImpl(
        id=ID("impl-code"),
        attachedTerminalSectionId=terminal_section_id,
    )
    terminal_impl = TerminalSectionImpl(id=ID("impl-terminal"))

    code_variant = Variant(
        id=ID("variant-code"),
        impl=code_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
    )
    terminal_variant = Variant(
        id=ID("variant-terminal"),
        impl=terminal_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(terminal_impl),
    )

    code_core = Core(
        id=code_section_id,
        name="Code",
        variants=[code_variant.id],
        defaultVariant=code_variant.id,
    )
    terminal_core = Core(
        id=terminal_section_id,
        name="Terminal",
        variants=[terminal_variant.id],
        defaultVariant=terminal_variant.id,
    )

    core = ProjectStateCore(
        sections={
            code_core.id: code_core,
            terminal_core.id: terminal_core,
        },
        sectionImpls={
            code_impl.id: code_impl,
            terminal_impl.id: terminal_impl,
        },
        sectionVariants={
            code_variant.id: code_variant,
            terminal_variant.id: terminal_variant,
        },
        codeObjs={},
        codeObjImpls={},
        codeObjVariants={},
    )
    return core, code_section_id, terminal_section_id


def _resolve_impl_by_section(
    core: ProjectStateCore,
    section_id: ID,
) -> CodeSectionImpl:
    section_core = core.sections[section_id]
    variant_id = section_core.defaultVariant
    if variant_id is None:
        raise AssertionError("Missing default variant.")
    variant = core.sectionVariants[variant_id]
    impl = core.sectionImpls[variant.impl]
    if not isinstance(impl, CodeSectionImpl):
        raise AssertionError("Expected CodeSectionImpl.")
    return impl


def test_attached_terminal_remaps_when_included() -> None:
    core, code_section_id, terminal_section_id = _build_core_with_variants()
    new_core, section_id_map, _section_variant_id_map, _code_obj_id_map = (
        copy_sections_and_other_info(core)
    )
    new_code_section_id = section_id_map[code_section_id]
    new_terminal_section_id = section_id_map[terminal_section_id]

    impl = _resolve_impl_by_section(new_core, new_code_section_id)

    assert impl.attachedTerminalSectionId == new_terminal_section_id


def test_attached_terminal_clears_when_missing() -> None:
    code_section_id = ID("section-code")
    missing_terminal_id = ID("missing-terminal")

    code_impl = CodeSectionImpl(
        id=ID("impl-code"),
        attachedTerminalSectionId=missing_terminal_id,
    )
    code_variant = Variant(
        id=ID("variant-code"),
        impl=code_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(code_impl),
    )
    code_core = Core(
        id=code_section_id,
        name="Code",
        variants=[code_variant.id],
        defaultVariant=code_variant.id,
    )
    core = ProjectStateCore(
        sections={code_core.id: code_core},
        sectionImpls={code_impl.id: code_impl},
        sectionVariants={code_variant.id: code_variant},
        codeObjs={},
        codeObjImpls={},
        codeObjVariants={},
    )

    new_core, section_id_map, _section_variant_id_map, _code_obj_id_map = (
        copy_sections_and_other_info(core)
    )
    new_code_section_id = section_id_map[code_section_id]
    impl = _resolve_impl_by_section(new_core, new_code_section_id)

    assert impl.attachedTerminalSectionId is None
