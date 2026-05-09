import { ParamDuplicateIndexProvider } from "components/Params/ParamDuplicateIndexContext";
import { ParamInput } from "components/Params/ParamItems/ParamInput";
import { ParamNameInput } from "components/Params/ParamItems/ParamNameInput";
import {
  resolveParamBackgroundClass,
  resolveParamBorderClass,
} from "components/Params/paramRowAppearance";
import { useHasSectionStyleTheme } from "components/Params/sectionStyleTheme";
import type { GpuDomIsland } from "gpuFlow/scene";
import { subscribeToGpuViewportReposition } from "gpuFlow/viewportReposition";
import { useEffect, useRef } from "react";
import { buildParamDuplicateIndexIfPresent } from "state/actions/params/paramDuplicateIndex";
import {
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  getCurrEffectiveSectionImplWithTypeGuardIfPresent,
} from "state/actions/sectionInfos";
import {
  useProjectSearch,
  useProjectState,
  useTypeErrors,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  isBaseParamCodeObjImpl,
  isBaseParentCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { useProjectGpuDomIslandActivation } from "./projectGpuDomIslandActivation";
import {
  PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
  PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
} from "./projectGpuPortalAdapter";

export function renderProjectGpuDomIsland(island: GpuDomIsland) {
  if (island.source.kind !== "retained-content") {
    return null;
  }
  if (island.kind === "retained-content-label") {
    return (
      <ProjectGpuParamNameDomIsland
        activation={island.activation}
        contentRect={island.contentRect}
        domIslandId={island.id}
        paramInfoId={island.source.ownerRowId}
        sectionId={island.ownerSectionId}
      />
    );
  }
  if (island.kind !== "retained-content-control") {
    return null;
  }
  return (
    <ProjectGpuParamControlDomIsland
      activation={island.activation}
      contentRect={island.contentRect}
      paramInfoId={island.source.ownerRowId}
      sectionId={island.ownerSectionId}
    />
  );
}

const PROJECT_GPU_PARAM_DOM_ISLAND_ACTIVE_CLASS =
  "relative h-full min-w-0 bg-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.85),0_1px_2px_rgba(15,23,42,0.12)] dark:bg-setta-900 dark:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.55),0_1px_2px_rgba(0,0,0,0.24)]";

function ProjectGpuParamControlDomIsland({
  activation,
  contentRect,
  paramInfoId,
  sectionId,
}: {
  readonly activation?: GpuDomIsland["activation"] | undefined;
  readonly contentRect: GpuDomIsland["contentRect"];
  readonly paramInfoId: string;
  readonly sectionId: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const maybeErrorMessage = useTypeErrors(
    (state) => state.errors[sectionId]?.params?.[paramInfoId]?.join("\n") ?? "",
  );

  useProjectGpuDomIslandActivation({
    activation,
    clickActivationTarget: true,
    paramInfoId,
    rootRef,
    sectionId,
  });

  useEffect(() => subscribeToGpuViewportReposition(), []);

  return (
    <div
      className={PROJECT_GPU_PARAM_DOM_ISLAND_ACTIVE_CLASS}
      data-gpu-flow-retained-content-native="true"
      data-gpu-project-param-dom-island="true"
      data-gpu-project-param-dom-island-editor="codemirror-dom"
      data-param-id={paramInfoId}
      data-section-id={sectionId}
      ref={rootRef}
    >
      <div
        className="absolute grid min-w-0 px-1 [&_.section-value]:col-[1/-1] [&_.section-value]:row-[1/-1]"
        style={{
          height: contentRect.height,
          left: contentRect.x,
          top: contentRect.y,
          width: contentRect.width,
        }}
      >
        <ParamInput
          maybeErrorMessage={maybeErrorMessage}
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          focusActiveSectionOnTextInput={false}
          tooltipParentDivId={PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID}
        />
      </div>
    </div>
  );
}

function ProjectGpuParamNameDomIsland({
  activation,
  contentRect,
  domIslandId,
  paramInfoId,
  sectionId,
}: {
  readonly activation?: GpuDomIsland["activation"] | undefined;
  readonly contentRect: GpuDomIsland["contentRect"];
  readonly domIslandId: string;
  readonly paramInfoId: string;
  readonly sectionId: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const duplicateIndex = useProjectState((state) =>
    buildParamDuplicateIndexIfPresent(state, sectionId),
  );
  const maybeErrorMessage = useTypeErrors(
    (state) => state.errors[sectionId]?.params?.[paramInfoId]?.join("\n") ?? "",
  );
  const hasChildren = useProjectState((state) =>
    hasProjectGpuParamNameDomIslandChildren(state, sectionId, paramInfoId),
  );
  const paramIsSelected = useProjectState((state) =>
    isProjectGpuParamNameDomIslandSelected(state, sectionId, paramInfoId),
  );
  const styleColor = useProjectState(
    (state) =>
      getCurrEffectiveSectionImplWithTypeGuardIfPresent(
        state,
        sectionId,
        isBaseSectionWithParamsImpl,
      )?.styleColor ?? null,
  );
  const isFocusedSearchResult = useProjectSearch(
    (state) =>
      state.focused?.sectionId === sectionId &&
      state.focused?.paramInfoId === paramInfoId,
  );
  const isSearchResult = useProjectSearch((state) =>
    state.lookup.has(createProjectSearchLookupKey(sectionId, paramInfoId)),
  );
  const hasSectionStyleTheme = useHasSectionStyleTheme(sectionId, styleColor);
  const bg = resolveParamBackgroundClass({
    hasSectionStyleTheme,
    paramIsSelected,
  });
  const border = resolveParamBorderClass({
    hasError: maybeErrorMessage.length > 0,
    isFocusedSearchResult,
    isSearchResult,
  });

  useProjectGpuDomIslandActivation({
    activation,
    clickActivationTarget: false,
    paramInfoId,
    rootRef,
    sectionId,
  });

  useEffect(() => subscribeToGpuViewportReposition(), []);

  return (
    <div
      className={PROJECT_GPU_PARAM_DOM_ISLAND_ACTIVE_CLASS}
      data-gpu-flow-retained-content-native="true"
      data-gpu-project-param-dom-island-editor="codemirror-dom"
      data-gpu-project-param-name-dom-island="true"
      data-param-id={paramInfoId}
      data-section-id={sectionId}
      id={domIslandId}
      ref={rootRef}
    >
      <div
        className="absolute grid min-w-0 px-1"
        style={{
          height: contentRect.height,
          left: contentRect.x,
          top: contentRect.y,
          width: contentRect.width,
        }}
      >
        <ParamDuplicateIndexProvider value={duplicateIndex}>
          <ParamNameInput
            bg={hasChildren ? bg : ""}
            border={hasChildren ? border : ""}
            hasChildren={hasChildren}
            paramInfoId={paramInfoId}
            sectionId={sectionId}
            tooltipParentDivId={
              PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID
            }
            validationBubbleContainerDivId={
              PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID
            }
            validationBubbleCoordinateSpace="viewport"
          />
        </ParamDuplicateIndexProvider>
      </div>
    </div>
  );
}

function hasProjectGpuParamNameDomIslandChildren(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
  paramInfoId: string,
): boolean {
  const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    state,
    sectionId,
    paramInfoId,
    isBaseParamCodeObjImpl,
  );
  return Boolean(
    codeObjImpl &&
      isBaseParentCodeObjImpl(codeObjImpl) &&
      codeObjImpl.children.length > 0,
  );
}

function isProjectGpuParamNameDomIslandSelected(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
  paramInfoId: string,
): boolean {
  const sectionImpl = getCurrEffectiveSectionImplWithTypeGuardIfPresent(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  return sectionImpl?.selectedParams.includes(paramInfoId) ?? false;
}
