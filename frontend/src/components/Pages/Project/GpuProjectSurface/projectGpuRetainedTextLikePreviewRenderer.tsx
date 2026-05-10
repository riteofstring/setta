import {
  TEXT_LIKE_PARAM_CODEMIRROR_CONTENT_CLASS,
  dummyCodeClass,
} from "components/Params/ParamUIs/textLikeParamCodeMirrorVisual";
import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import type { GpuRetainedTextLikePreviewSource } from "gpuFlow/GpuFlow/retainedTextLikePreviewSources";

export function renderProjectGpuRetainedTextLikePreview(
  source: GpuRetainedTextLikePreviewSource,
) {
  return <ProjectGpuRetainedTextLikePreview source={source} />;
}

function ProjectGpuRetainedTextLikePreview({
  source,
}: {
  readonly source: GpuRetainedTextLikePreviewSource;
}) {
  const theme = useCodeMirrorStyle(undefined);
  return (
    <div
      data-gpu-flow-retained-text-like-preview-content="true"
      style={{
        height: source.sourceHeight,
        overflow: "hidden",
        position: "relative",
        width: source.sourceWidth,
      }}
    >
      {source.previews.map((preview) => (
        <div
          className={TEXT_LIKE_PARAM_CODEMIRROR_CONTENT_CLASS}
          key={preview.rowId}
          style={{
            height: preview.height,
            left: preview.x,
            overflow: "hidden",
            top: preview.y,
            width: preview.width,
          }}
        >
          <DummyCodeMirror
            divId={`gpu-retained-preview-${source.sourceId}-${preview.rowId}`}
            code={preview.code}
            className={dummyCodeClass(preview.error, false, preview.disabled)}
            gpuFlowControl={undefined}
            language={preview.language}
            onFocus={undefined}
            onMouseDownCapture={undefined}
            placeholder={preview.defaultValue}
            singleLine={preview.linePolicy === "single-line"}
            theme={theme}
            wrapLines={preview.wrapLines}
          />
        </div>
      ))}
    </div>
  );
}
