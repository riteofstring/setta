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
        alignItems:
          source.linePolicy === "single-line" ? "center" : "flex-start",
        display: "flex",
        height: source.sourceHeight,
        overflow: "hidden",
        width: source.sourceWidth,
      }}
    >
      <DummyCodeMirror
        divId={`gpu-retained-preview-${source.sourceId}`}
        code={source.code}
        className={`${NO_PAN_CLASS_NAME} section-value w-full break-words py-[.125rem] font-mono text-xs [tab-size:4] [word-break:break-word] ${source.error ? "[&_*]:!text-red-500" : ""} ${source.disabled ? "text-setta-400 dark:text-setta-500" : ""}`}
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
  );
}
