import { DummyCodeMirror } from "components/Utils/CodeMirror/DummyCodeMirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import type { GpuRetainedTextLikePreviewSource } from "gpuFlow/GpuFlow/retainedTextLikePreviewSources";
import { NO_PAN_CLASS_NAME } from "utils/constants";

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
          key={preview.rowId}
          style={{
            alignItems:
              preview.linePolicy === "single-line" ? "center" : "flex-start",
            display: "flex",
            height: preview.height,
            left: preview.x,
            overflow: "hidden",
            position: "absolute",
            top: preview.y,
            width: preview.width,
          }}
        >
          <DummyCodeMirror
            divId={`gpu-retained-preview-${source.sourceId}-${preview.rowId}`}
            code={preview.code}
            className={`${NO_PAN_CLASS_NAME} section-value w-full break-words py-[.125rem] font-mono text-xs [tab-size:4] [word-break:break-word] ${preview.error ? "[&_*]:!text-red-500" : ""} ${preview.disabled ? "text-setta-400 dark:text-setta-500" : ""}`}
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
