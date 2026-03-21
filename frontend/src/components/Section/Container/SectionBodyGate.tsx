import _ from "lodash";
import React from "react";
import { getExternalProjectChatWindowBindingForSectionInState } from "state/actions/projectChatWindowing";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  SectionTypeEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
  type SectionType,
} from "utils/generatedTypes";
import { SectionAreaSwitch } from "./SectionAreaSwitch";
import { SectionWindowPlaceholder } from "./SectionWindowPlaceholder";

export type SectionBodyOwner =
  | {
      kind: "canvas";
      bgColor: string;
      isUserView: boolean;
    }
  | {
      kind: "window";
      bgColor: string;
      chatHost: ChatWindowPlacement | "standalone_page";
      chatModeOverride?: ChatWindowMode | undefined;
      projectChatSurfaceId?: string | undefined;
      projectChatId?: string | null | undefined;
      setProjectChatId?: (
        next: React.SetStateAction<string | null | undefined>,
      ) => void;
      onProjectChatBlockedErrorCodeChange?:
        | ((errorCode: string | null) => void)
        | undefined;
    };

export type SectionBodyRequestedMode =
  | "auto"
  | "live"
  | "warm"
  | "preview"
  | "skip";

export type SectionBodyResolvedMode = "live" | "skip";

export type SectionBodyFamily =
  | "tier1-dense-params"
  | "tier2-code"
  | "chat"
  | "sparse-local"
  | "generic";

export type ResolvedSectionBodyStatus = {
  sectionTypeName: SectionType;
  family: SectionBodyFamily;
  requestedMode: SectionBodyRequestedMode;
  resolvedMode: SectionBodyResolvedMode;
  isMinimized: boolean;
  externalizedWindowId: string | null;
};

type SectionBodyGateProps = {
  sectionId: string;
  owner: SectionBodyOwner;
  requestedMode?: SectionBodyRequestedMode;
};

export function getSectionBodyFamily(
  sectionTypeName: SectionType,
): SectionBodyFamily {
  switch (sectionTypeName) {
    case SectionTypeEnum.Callable:
    case SectionTypeEnum.Dict:
    case SectionTypeEnum.GlobalVariables:
      return "tier1-dense-params";
    case SectionTypeEnum.Code:
    case SectionTypeEnum.GenPythonCode:
    case SectionTypeEnum.GenPythonMetadata:
      return "tier2-code";
    case SectionTypeEnum.Chat:
      return "chat";
    case SectionTypeEnum.Browser:
    case SectionTypeEnum.Draw:
    case SectionTypeEnum.Chart:
    case SectionTypeEnum.Prompt:
    case SectionTypeEnum.TextBlock:
      return "sparse-local";
    default:
      return "generic";
  }
}

function resolveRequestedMode(
  requestedMode: SectionBodyRequestedMode,
  isMinimized: boolean,
): SectionBodyResolvedMode {
  if (isMinimized || requestedMode === "skip") {
    return "skip";
  }
  return "live";
}

export function useResolvedSectionBodyStatus({
  sectionId,
  owner,
  requestedMode = "auto",
}: SectionBodyGateProps): ResolvedSectionBodyStatus {
  return useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    const externalizedWindowId =
      owner.kind === "canvas" && impl.type !== SectionTypeEnum.Chat
        ? getExternalProjectChatWindowBindingForSectionInState(
            state.projectChatWindowing,
            sectionId,
          )?.instanceId ?? null
        : null;

    return {
      sectionTypeName: impl.type,
      family: getSectionBodyFamily(impl.type),
      requestedMode,
      resolvedMode: resolveRequestedMode(requestedMode, impl.isMinimized),
      isMinimized: impl.isMinimized,
      externalizedWindowId,
    };
  }, _.isEqual);
}

export const SectionBodyGate = React.memo(function SectionBodyGate({
  sectionId,
  owner,
  requestedMode = "auto",
}: SectionBodyGateProps) {
  const status = useResolvedSectionBodyStatus({
    sectionId,
    owner,
    requestedMode,
  });

  if (status.externalizedWindowId) {
    return (
      <SectionWindowPlaceholder
        instanceId={status.externalizedWindowId}
        sectionId={sectionId}
        dataTestId="section-canvas-window-placeholder"
      />
    );
  }

  if (status.resolvedMode === "skip") {
    return null;
  }

  if (owner.kind === "canvas") {
    return (
      <SectionAreaSwitch
        sectionId={sectionId}
        sectionTypeName={status.sectionTypeName}
        bgColor={owner.bgColor}
        isMinimized={status.isMinimized}
        isUserView={owner.isUserView}
      />
    );
  }

  return (
    <SectionAreaSwitch
      sectionId={sectionId}
      sectionTypeName={status.sectionTypeName}
      bgColor={owner.bgColor}
      isMinimized={status.isMinimized}
      isUserView={false}
      chatHost={owner.chatHost}
      {...(owner.chatModeOverride === undefined
        ? {}
        : { chatModeOverride: owner.chatModeOverride })}
      {...(owner.projectChatSurfaceId === undefined
        ? {}
        : { projectChatSurfaceId: owner.projectChatSurfaceId })}
      {...(owner.projectChatId === undefined
        ? {}
        : { projectChatId: owner.projectChatId })}
      {...(owner.setProjectChatId === undefined
        ? {}
        : { setProjectChatId: owner.setProjectChatId })}
      {...(owner.onProjectChatBlockedErrorCodeChange === undefined
        ? {}
        : {
            onProjectChatBlockedErrorCodeChange:
              owner.onProjectChatBlockedErrorCodeChange,
          })}
    />
  );
});
