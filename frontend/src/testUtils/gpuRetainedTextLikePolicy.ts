import type { GpuRetainedContentTextLikeEditorPolicy } from "gpuFlow/retainedContentScene";

export const TEST_GPU_RETAINED_SINGLE_LINE_TEXT_POLICY: GpuRetainedContentTextLikeEditorPolicy =
  {
    editorKind: "text",
    language: "python",
    linePolicy: "single-line",
    maxVisibleLines: 1,
    minVisibleLines: 1,
    wrapLines: false,
  };
