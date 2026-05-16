import {
  TEXT_LIKE_PARAM_CODEMIRROR_CONTENT_CLASS,
  dummyCodeClass,
} from "components/Params/ParamUIs/textLikeParamCodeMirrorVisual";
import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import type { GpuRetainedTextLikeRowSnapshotSource } from "gpuFlow/GpuFlow/retainedTextLikeRowSnapshotSources";

export function renderProjectGpuRetainedTextLikeRowSnapshot(
  source: GpuRetainedTextLikeRowSnapshotSource,
) {
  return <ProjectGpuRetainedTextLikeRowSnapshot source={source} />;
}

function ProjectGpuRetainedTextLikeRowSnapshot({
  source,
}: {
  readonly source: GpuRetainedTextLikeRowSnapshotSource;
}) {
  const theme = useCodeMirrorStyle(undefined);
  return (
    <div
      data-gpu-flow-retained-text-like-row-snapshot-content="true"
      style={{
        height: source.sourceHeight,
        overflow: "hidden",
        position: "relative",
        width: source.sourceWidth,
      }}
    >
      <div
        className={TEXT_LIKE_PARAM_CODEMIRROR_CONTENT_CLASS}
        style={{
          height: source.sourceHeight,
          left: 0,
          overflow: "hidden",
          top: 0,
          width: source.sourceWidth,
        }}
      >
        <DummyCodeMirror
          divId={`gpu-retained-row-snapshot-${source.sourceId}`}
          code={source.code}
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
