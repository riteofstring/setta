import { useEffect, useMemo, useRef } from "react";
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
  const lastSyncedPathRef = useRef<string | null>(null);
  const isUrlDrivenRef = useRef(false);
  const pendingUrlSyncRef = useRef<{
    id: string;
    activeAtRequest: string | null;
  } | null>(null);
  const { canEditVariants } = useShareCapabilities();
  const { projectConfigId, activeViewModeId, viewModes } = useProjectState(
    (x) => ({
      projectConfigId: x.projectConfig.id,
      activeViewModeId: x.projectConfig.activeViewModeId,
      viewModes: x.projectConfig.viewModes,
    }),
  );
  const isViewRoute = Boolean(viewMatch);

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
    if (!enabled || !isViewRoute) {
      isUrlDrivenRef.current = false;
      lastSyncedPathRef.current = null;
      pendingUrlSyncRef.current = null;
      return;
    }
    if (
      lastSyncedPathRef.current &&
      location.pathname === lastSyncedPathRef.current
    ) {
      lastSyncedPathRef.current = null;
      isUrlDrivenRef.current = false;
      return;
    }
    isUrlDrivenRef.current = true;
    pendingUrlSyncRef.current = null;
  }, [enabled, isViewRoute, location.pathname]);

  useEffect(() => {
    if (!enabled || !requestedViewModeName || !requestedViewModeId) {
      return;
    }
    if (requestedViewModeId === activeViewModeId) {
      isUrlDrivenRef.current = false;
      pendingUrlSyncRef.current = null;
      return;
    }
    if (!canEditVariants) {
      return;
    }
    if (!isUrlDrivenRef.current) {
      return;
    }
    pendingUrlSyncRef.current = {
      id: requestedViewModeId,
      activeAtRequest: activeViewModeId ?? null,
    };
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
    isViewRoute,
  ]);

  useEffect(() => {
    if (!enabled || !isViewRoute) {
      return;
    }
    const pending = pendingUrlSyncRef.current;
    if (!pending || !activeViewModeId) {
      return;
    }
    if (activeViewModeId === pending.id) {
      pendingUrlSyncRef.current = null;
      return;
    }
    if (activeViewModeId !== pending.activeAtRequest) {
      isUrlDrivenRef.current = false;
      pendingUrlSyncRef.current = null;
    }
  }, [activeViewModeId, enabled, isViewRoute]);

  useEffect(() => {
    if (!enabled || !viewMatch || !projectConfigName || !activeViewModeId) {
      return;
    }
    if (
      requestedViewModeId &&
      requestedViewModeId !== activeViewModeId &&
      canEditVariants &&
      isUrlDrivenRef.current
    ) {
      return;
    }
    const activeViewMode = viewModes[activeViewModeId];
    const activeViewModeName = activeViewMode?.name;
    if (!activeViewModeName) {
      return;
    }
    const encodedProjectConfigName = encodeURIComponent(projectConfigName);
    const nextPath = `/${encodedProjectConfigName}/view/${encodeURIComponent(
      activeViewModeName,
    )}`;
    if (location.pathname === nextPath) {
      return;
    }
    lastSyncedPathRef.current = nextPath;
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
