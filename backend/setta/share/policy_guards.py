from enum import Enum
from typing import TYPE_CHECKING

from setta.project_state.project_manager_types import (
    AutoLayoutTopLevelSectionsRequest,
    ProjectManagerRequestWithProjectConfig,
    ProjectManagerRequestWithSection,
    ProjectManagerRequestWithSectionIds,
    ProjectManagerRequestWithVariant,
    SetSectionSizesRequest,
    SetTopLevelSectionLayoutRequest,
    UngroupGroupsRequest,
)
from setta.types.id import ID

if TYPE_CHECKING:
    from setta.project_state.base_project_manager import BaseProjectManager
    from setta.runtime.context import RuntimeContext


class SharePolicyGuard(str, Enum):
    param = "param"
    variant = "variant"
    layout = "layout"


def _resolve_section_id_for_variant(
    manager: "BaseProjectManager",
    project_config_id: ID,
    variant_id: ID,
) -> ID:
    project_state = manager.get_single_config_state(project_config_id)
    for section_id, section in project_state.sections.items():
        if variant_id in section.variants:
            return section_id
    raise KeyError(
        f"Variant {variant_id} not found in project config {project_config_id}"
    )


def resolve_section_ids(
    request: ProjectManagerRequestWithProjectConfig,
    manager: "BaseProjectManager",
) -> list[ID] | None:
    if isinstance(request, SetTopLevelSectionLayoutRequest):
        return list(request.topLevelSections.keys())
    if isinstance(request, AutoLayoutTopLevelSectionsRequest):
        project_state = manager.get_single_config_state(request.projectConfigId)
        return list(project_state.projectConfig.topLevelSections.keys())
    if isinstance(request, SetSectionSizesRequest):
        return list(request.sectionSizes.keys())
    if isinstance(request, UngroupGroupsRequest):
        return list(request.groupIds)
    if isinstance(request, ProjectManagerRequestWithSectionIds):
        return list(request.sectionIds)
    if isinstance(request, ProjectManagerRequestWithSection):
        return [request.sectionId]
    if isinstance(request, ProjectManagerRequestWithVariant):
        return [
            _resolve_section_id_for_variant(
                manager,
                request.projectConfigId,
                request.variantId,
            )
        ]
    return None


async def enforce_share_policy_guard(
    ctx: "RuntimeContext",
    manager: "BaseProjectManager",
    request: ProjectManagerRequestWithProjectConfig,
    guard: SharePolicyGuard,
) -> None:
    if not ctx.share_mode:
        return
    section_ids = None
    if ctx.policy.allowedSections is not None:
        section_ids = resolve_section_ids(request, manager)
    if guard is SharePolicyGuard.param:
        await ctx.enforce_policy(
            policy_flag="allowParamChanges",
            denied_message="Share policy disallows parameter changes.",
            project_config_id=request.projectConfigId,
            section_ids=section_ids,
        )
        return
    if guard is SharePolicyGuard.variant:
        await ctx.enforce_policy(
            policy_flag="allowVariantChanges",
            denied_message="Share policy disallows variant changes.",
            project_config_id=request.projectConfigId,
            section_ids=section_ids,
        )
        return
    if guard is SharePolicyGuard.layout:
        await ctx.enforce_policy(
            policy_flag="allowLayoutChanges",
            denied_message="Share policy disallows layout changes.",
            project_config_id=request.projectConfigId,
            section_ids=section_ids,
        )
        return
    raise KeyError(f"Unsupported share policy guard: {guard}")
