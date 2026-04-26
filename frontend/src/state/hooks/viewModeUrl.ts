import { setActiveViewMode } from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
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
import type { ViewMode } from "utils/generatedTypes";

type ViewModeUrlSyncOptions = {
  enabled: boolean;
};

type ViewModeMap = Record<string, ViewMode>;

function findViewModeIdByName(
  requestedViewModeName: string | null,
  viewModes: ViewModeMap,
): string | null {
  if (!requestedViewModeName) {
    return null;
  }
  for (const viewMode of Object.values(viewModes)) {
    if (viewMode.name === requestedViewModeName) {
      return viewMode.id;
    }
  }
  return null;
}

function shouldWaitForRequestedViewMode({
  requestedViewModeId,
  activeViewModeId,
  canEditVariants,
  isUrlDriven,
}: {
  requestedViewModeId: string | null;
  activeViewModeId: string | null;
  canEditVariants: boolean;
  isUrlDriven: boolean;
}) {
  return (
    requestedViewModeId !== null &&
    requestedViewModeId !== activeViewModeId &&
    canEditVariants &&
    isUrlDriven
  );
}

function buildViewModePath(
  projectConfigName: string,
  viewModeName: string,
): string {
  return `/${encodeURIComponent(projectConfigName)}/view/${encodeURIComponent(viewModeName)}`;
}

function resolveSyncedViewModePath({
  enabled,
  isViewRoute,
  projectConfigName,
  activeViewModeId,
  requestedViewModeId,
  canEditVariants,
  isUrlDriven,
  viewModes,
}: {
  enabled: boolean;
  isViewRoute: boolean;
  projectConfigName?: string;
  activeViewModeId: string | null;
  requestedViewModeId: string | null;
  canEditVariants: boolean;
  isUrlDriven: boolean;
  viewModes: ViewModeMap;
}): string | null {
  if (!enabled || !isViewRoute || !projectConfigName || !activeViewModeId) {
    return null;
  }
  if (
    shouldWaitForRequestedViewMode({
      requestedViewModeId,
      activeViewModeId,
      canEditVariants,
      isUrlDriven,
    })
  ) {
    return null;
  }
  const activeViewModeName = viewModes[activeViewModeId]?.name;
  return activeViewModeName
    ? buildViewModePath(projectConfigName, activeViewModeName)
    : null;
}

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
  const requestedViewModeId = useMemo(
    () => findViewModeIdByName(requestedViewModeName, viewModes),
    [requestedViewModeName, viewModes],
  );
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
    void callOpenAPI(
      setActiveViewMode({
        body: {
          projectConfigId,
          activeViewModeId: requestedViewModeId,
        },
      } as Parameters<typeof setActiveViewMode>[0]),
    );
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
    const nextPath = resolveSyncedViewModePath({
      enabled,
      isViewRoute,
      projectConfigName,
      activeViewModeId,
      requestedViewModeId,
      canEditVariants,
      isUrlDriven: isUrlDrivenRef.current,
      viewModes,
    });
    if (!nextPath || location.pathname === nextPath) {
      return;
    }
    lastSyncedPathRef.current = nextPath;
    navigate(nextPath, { replace: true, state: location.state });
  }, [
    activeViewModeId,
    canEditVariants,
    enabled,
    isViewRoute,
    location.pathname,
    location.state,
    navigate,
    projectConfigName,
    requestedViewModeId,
    viewModes,
  ]);
}
