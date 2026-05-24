import { ParamInput } from "components/Params/ParamItems/ParamInput";
import {
  TEXT_LIKE_PARAM_CODEMIRROR_CONTENT_CLASS,
  dummyCodeClass,
} from "components/Params/ParamUIs/textLikeParamCodeMirrorVisual";
import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import type { GpuFlowDomControlRenderer } from "gpuFlow/GpuFlow/domControlPlane";
import type { GpuRetainedDomControlSourceDescriptor } from "gpuFlow/retainedDomControlScene";
import { useRef } from "react";
import { useTypeErrors } from "state/definitions";
import { useProjectGpuDomIslandActivation } from "./projectGpuDomIslandActivation";
import { PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID } from "./projectGpuPortalAdapter";

const PROJECT_GPU_RETAINED_TEXT_LIKE_DOM_CONTROL_ACTIVE_CLASS =
  "relative h-full min-w-0 bg-setta-100/50 dark:bg-blue-950/30";

export function renderProjectGpuRetainedDomControl(
  source: GpuRetainedDomControlSourceDescriptor,
  context?: Parameters<GpuFlowDomControlRenderer>[1],
) {
  return source.active && context?.hostPresentation === "visible" ? (
    <ProjectGpuActiveRetainedDomControl source={source} />
  ) : (
    <ProjectGpuPassiveRetainedDomControl source={source} />
  );
}

function ProjectGpuPassiveRetainedDomControl({
  source,
}: {
  readonly source: GpuRetainedDomControlSourceDescriptor;
}) {
  const theme = useCodeMirrorStyle(undefined);
  return (
    <div
      data-gpu-flow-retained-dom-control-content="true"
      style={{
        height: source.sourceRectCssPx.height,
        overflow: "hidden",
        position: "relative",
        width: source.sourceRectCssPx.width,
      }}
    >
      <div
        className={TEXT_LIKE_PARAM_CODEMIRROR_CONTENT_CLASS}
        style={{
          height: source.sourceRectCssPx.height,
          left: 0,
          overflow: "hidden",
          top: 0,
          width: source.sourceRectCssPx.width,
        }}
      >
        <DummyCodeMirror
          divId={`gpu-retained-dom-control-${source.sourceId}`}
          code={source.value}
          className={dummyCodeClass(source.error, false, source.disabled)}
          gpuFlowControl={undefined}
          language={source.language}
          onFocus={undefined}
          onMouseDownCapture={undefined}
          placeholder={source.defaultValue}
          singleLine={source.linePolicy === "single-line"}
          theme={theme}
          wrapLines={source.wrapLines}
        />
      </div>
    </div>
  );
}

function ProjectGpuActiveRetainedDomControl({
  source,
}: {
  readonly source: GpuRetainedDomControlSourceDescriptor;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const maybeErrorMessage = useTypeErrors(
    (state) =>
      state.errors[source.sectionId]?.params?.[source.rowId]?.join("\n") ?? "",
  );

  useProjectGpuDomIslandActivation({
    activation: source.activation,
    clickActivationTarget: true,
    paramInfoId: source.rowId,
    rootRef,
    sectionId: source.sectionId,
  });

  return (
    <div
      className={PROJECT_GPU_RETAINED_TEXT_LIKE_DOM_CONTROL_ACTIVE_CLASS}
      data-gpu-flow-retained-content-native="true"
      data-gpu-flow-retained-dom-control-content="true"
      data-gpu-project-param-dom-control="true"
      data-param-id={source.rowId}
      data-section-id={source.sectionId}
      ref={rootRef}
      style={{
        height: source.sourceRectCssPx.height,
        width: source.sourceRectCssPx.width,
      }}
    >
      <div
        className={TEXT_LIKE_PARAM_CODEMIRROR_CONTENT_CLASS}
        style={{
          height: source.sourceRectCssPx.height,
          left: 0,
          overflow: "hidden",
          top: 0,
          width: source.sourceRectCssPx.width,
        }}
      >
        <ParamInput
          maybeErrorMessage={maybeErrorMessage}
          sectionId={source.sectionId}
          paramInfoId={source.rowId}
          focusActiveSectionOnTextInput={false}
          textInputInitialActivationEvent={
            source.activation
              ? {
                  clientX: source.activation.clientPoint.x,
                  clientY: source.activation.clientPoint.y,
                }
              : null
          }
          tooltipParentDivId={PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID}
        />
      </div>
    </div>
  );
}
