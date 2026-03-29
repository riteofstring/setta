import { AppShell } from "components/Pages/AppShell";
import { WorkspaceLaunchPage } from "components/Pages/Launch/WorkspaceLaunchPage";
import { LoadingSpinner } from "components/Pages/LoadingSpinner";
import { NotFound } from "components/Pages/NotFound/NotFound";
import { ShareWrapper } from "components/Pages/Share/ShareWrapper";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAllProjectMetadata, useSettings } from "state/definitions";
import { HOME_ROUTER_PATH } from "utils/constants";
import type { ProjectConfig } from "utils/generatedTypes";
import {
  resolveWorkspaceLaunchRouteKind,
  type WorkspaceLaunchRouteKind,
} from "utils/serverModeBoundaryPolicy";
import { GlobalWrapper, IndexRouteComponent } from "./GlobalWrapper";
import type { BuildModeWrappedAppRouteStackArgs } from "./modeWrappedAppRouteStack";

type ShareRouteRenderState = {
  doneLoading: boolean;
  is404: boolean;
};

type BuildModeWrappedIndexWorkspaceLaunchRouteElementsArgs = {
  appRouteElement: ReactNode;
  launcherHomeRouteElement: ReactNode;
};

type ModeWrappedIndexWorkspaceLaunchRouteElements = Pick<
  BuildModeWrappedAppRouteStackArgs,
  "indexRouteElements" | "workspaceLaunchRouteElements"
>;

function resolveDefaultProjectConfigName(
  defaultProjectConfigId: string | null,
  projectMetadata: Array<ProjectConfig>,
): string | null {
  if (!defaultProjectConfigId) {
    return null;
  }
  for (const config of projectMetadata) {
    if (config.id === defaultProjectConfigId) {
      return config.name;
    }
  }
  return null;
}

function ShareIndexRedirect() {
  const showDefaultConfigOnLoad = useSettings(
    (x) => x.backend.showDefaultConfigOnLoad,
  );
  const { defaultProjectConfigId, projectMetadata } = useAllProjectMetadata(
    (x) => x,
  );
  const defaultProjectConfigName = resolveDefaultProjectConfigName(
    defaultProjectConfigId,
    projectMetadata,
  );

  if (
    !defaultProjectConfigId ||
    !showDefaultConfigOnLoad ||
    !defaultProjectConfigName
  ) {
    return <Navigate to={HOME_ROUTER_PATH} replace />;
  }

  return <Navigate to={defaultProjectConfigName} replace />;
}

const ideIndexRouteElement = (
  <GlobalWrapper>
    <IndexRouteComponent />
  </GlobalWrapper>
);

const ideWorkspaceLaunchRouteElement = (
  <GlobalWrapper>
    <WorkspaceLaunchPage />
  </GlobalWrapper>
);

const launcherWorkspaceLaunchRouteElement = (
  <AppShell isLoading={false} loadingContent={null}>
    <WorkspaceLaunchPage />
  </AppShell>
);

const workspaceLaunchBlockedRouteElement = (
  <Navigate to={HOME_ROUTER_PATH} replace />
);

const workspaceLaunchRouteElementsByKind: Record<
  WorkspaceLaunchRouteKind,
  ReactNode
> = {
  ide: ideWorkspaceLaunchRouteElement,
  launcher: launcherWorkspaceLaunchRouteElement,
  blocked: workspaceLaunchBlockedRouteElement,
};

function resolveWorkspaceLaunchRouteElement(
  mode: "ide" | "share" | "app" | "launcher",
) {
  return workspaceLaunchRouteElementsByKind[
    resolveWorkspaceLaunchRouteKind(mode)
  ];
}

const shareIndexRouteElement = (
  <ShareWrapper mode="home">
    {({ doneLoading, is404 }: ShareRouteRenderState) => {
      if (!doneLoading) {
        return <LoadingSpinner />;
      }
      if (is404) {
        return <NotFound />;
      }
      return <ShareIndexRedirect />;
    }}
  </ShareWrapper>
);

export function buildModeWrappedIndexWorkspaceLaunchRouteElements({
  appRouteElement,
  launcherHomeRouteElement,
}: BuildModeWrappedIndexWorkspaceLaunchRouteElementsArgs): ModeWrappedIndexWorkspaceLaunchRouteElements {
  return {
    indexRouteElements: {
      ide: ideIndexRouteElement,
      share: shareIndexRouteElement,
      app: appRouteElement,
      launcher: launcherHomeRouteElement,
    },
    workspaceLaunchRouteElements: {
      ide: resolveWorkspaceLaunchRouteElement("ide"),
      share: resolveWorkspaceLaunchRouteElement("share"),
      app: resolveWorkspaceLaunchRouteElement("app"),
      launcher: resolveWorkspaceLaunchRouteElement("launcher"),
    },
  };
}
