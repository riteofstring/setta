from setta import local_core_client as shared_local_core
from setta.sdk_contracts.generated import (
    LocalCoreRenderRealtimeDependencyValuesRequest,
    LocalCoreRenderRealtimeDependencyValuesResult,
)
from setta.types.generated.go_shared_constants import (
    LOCAL_CORE_COMMAND_RENDER_REALTIME_DEPENDENCY_VALUES,
)

__all__ = [
    "LocalCoreClient",
    "LocalCoreCommandError",
    "run_local_core_command_once",
]

LocalCoreCommandError = shared_local_core.LocalCoreCommandError
run_local_core_command_once = shared_local_core.run_local_core_command_once
_LocalCoreProcessState = shared_local_core._LocalCoreProcessState


class LocalCoreClient(shared_local_core.LocalCoreClient):
    async def render_realtime_dependency_values(
        self,
        request: LocalCoreRenderRealtimeDependencyValuesRequest,
    ) -> LocalCoreRenderRealtimeDependencyValuesResult:
        raw_result = await self.run_command(
            LOCAL_CORE_COMMAND_RENDER_REALTIME_DEPENDENCY_VALUES,
            request.model_dump(mode="json"),
        )
        return LocalCoreRenderRealtimeDependencyValuesResult.model_validate(raw_result)
