from enum import Enum
from typing import TYPE_CHECKING

from setta.project_state.project_manager_types import (
    ProjectManagerRequestWithProjectConfig,
)

if TYPE_CHECKING:
    from setta.runtime.context import RuntimeContext


class SharePolicyGuard(str, Enum):
    param = "param"
    variant = "variant"
    layout = "layout"


async def enforce_share_policy_guard(
    ctx: "RuntimeContext",
    request: ProjectManagerRequestWithProjectConfig,
    guard: SharePolicyGuard,
) -> None:
    if not ctx.share_mode:
        return
    if guard is SharePolicyGuard.param:
        await ctx.enforce_policy(
            policy_flag="allowParamChanges",
            denied_message="Share policy disallows parameter changes.",
            project_config_id=request.projectConfigId,
        )
        return
    if guard is SharePolicyGuard.variant:
        await ctx.enforce_policy(
            policy_flag="allowVariantChanges",
            denied_message="Share policy disallows variant changes.",
            project_config_id=request.projectConfigId,
        )
        return
    if guard is SharePolicyGuard.layout:
        await ctx.enforce_policy(
            policy_flag="allowLayoutChanges",
            denied_message="Share policy disallows layout changes.",
            project_config_id=request.projectConfigId,
        )
        return
    raise KeyError(f"Unsupported share policy guard: {guard}")
