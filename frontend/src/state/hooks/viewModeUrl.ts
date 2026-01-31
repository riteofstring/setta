import { useEffect, useMemo } from "react";
import {
  useLocation,
  useMatch,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { VIEW_MODE_ROUTER_PATH } from "utils/constants";
import { route_set_active_view_mode } from "utils/generatedEndpoints";

type ViewModeUrlSyncOptions = {
  enabled: boolean;
};

export function useViewModeUrlSync({ enabled }: ViewModeUrlSyncOptions) {
  const { projectConfigName } = useParams();
  const viewMatch = useMatch(VIEW_MODE_ROUTER_PATH);
  const requestedViewModeName = viewMatch?.params.viewModeName ?? null;
  const location = useLocation();
  const navigate = useNavigate();
  const { canEditVariants } = useShareCapabilities();
  const { projectConfigId, activeViewModeId, viewModes } = useProjectState(
    (x) => ({
      projectConfigId: x.projectConfig.id,
      activeViewModeId: x.projectConfig.activeViewModeId,
      viewModes: x.projectConfig.viewModes,
    }),
  );

  const requestedViewModeId = useMemo(() => {
    if (!requestedViewModeName) {
      return null;
    }
    for (const viewMode of Object.values(viewModes)) {
      if (viewMode.name === requestedViewModeName) {
        return viewMode.id;
      }
    }
    return null;
  }, [requestedViewModeName, viewModes]);

  useEffect(() => {
    if (!enabled || !requestedViewModeName || !requestedViewModeId) {
      return;
    }
    if (requestedViewModeId === activeViewModeId) {
      return;
    }
    if (!canEditVariants) {
      return;
    }
    void route_set_active_view_mode({
      projectConfigId,
      activeViewModeId: requestedViewModeId,
    });
  }, [
    activeViewModeId,
    canEditVariants,
    enabled,
    projectConfigId,
    requestedViewModeId,
    requestedViewModeName,
  ]);

  useEffect(() => {
    if (!enabled || !viewMatch || !projectConfigName || !activeViewModeId) {
      return;
    }
    if (
      requestedViewModeId &&
      requestedViewModeId !== activeViewModeId &&
      canEditVariants
    ) {
      return;
    }
    const activeViewMode = viewModes[activeViewModeId];
    const activeViewModeName = activeViewMode?.name;
    if (!activeViewModeName) {
      return;
    }
    const nextPath = `/${projectConfigName}/view/${encodeURIComponent(
      activeViewModeName,
    )}`;
    if (location.pathname === nextPath) {
      return;
    }
    navigate(nextPath, { replace: true, state: location.state });
  }, [
    activeViewModeId,
    canEditVariants,
    enabled,
    location.pathname,
    location.state,
    navigate,
    projectConfigName,
    requestedViewModeId,
    viewMatch,
    viewModes,
  ]);
}
