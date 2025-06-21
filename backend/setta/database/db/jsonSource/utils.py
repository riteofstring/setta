from typing import TypeGuard

from setta.types.generated_section_type_unions import SectionImplUnion
from setta.types.sections import DictSectionImpl


def should_be_processed(
    section_impl: SectionImplUnion, section_impl_ids: list[str] | None
) -> TypeGuard[DictSectionImpl]:
    return (
        isinstance(section_impl, DictSectionImpl)
        and section_impl.isJsonSource
        and (not section_impl_ids or (section_impl.id in section_impl_ids))
    )
