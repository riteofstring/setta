import { ParamInput } from "components/Params/ParamItems/ParamInput";
import {
  TEXT_LIKE_PARAM_CODEMIRROR_CONTENT_CLASS,
  dummyCodeClass,
} from "components/Params/ParamUIs/textLikeParamCodeMirrorVisual";
import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import type { GpuRetainedDomControlSourceDescriptor } from "gpuFlow/retainedDomControlScene";
import { useRef } from "react";
import { useTypeErrors } from "state/definitions";
import { useProjectGpuDomIslandActivation } from "./projectGpuDomIslandActivation";
import { PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID } from "./projectGpuPortalAdapter";

export function renderProjectGpuRetainedDomControl(
  source: GpuRetainedDomControlSourceDescriptor,
) {
  return source.active ? (
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
      className="relative h-full min-w-0"
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
          tooltipParentDivId={PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID}
        />
      </div>
    </div>
  );
}
