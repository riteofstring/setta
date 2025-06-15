from typing import TypeGuard

from setta.types.sections import BaseSectionImpl, DictSectionImpl


def should_be_processed(
    section_impl: BaseSectionImpl, section_impl_ids: list[str] | None
) -> TypeGuard[DictSectionImpl]:
    return (
        isinstance(section_impl, DictSectionImpl)
        and section_impl.isJsonSource
        and (not section_impl_ids or (section_impl.id in section_impl_ids))
    )
