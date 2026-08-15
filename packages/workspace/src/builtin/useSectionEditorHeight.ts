import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { computeReadyToBeVisible } from "../canvas/fitView";
import { useReactFlow } from "../canvas/store";
import { getSectionOrThrow } from "../document/documentSelectors";
import { useWorkspaceDocument } from "../document/stores";
import { NO_WHEEL_CLASS_NAME } from "../interaction";
import { useResizeEvent } from "../section/resize/resizeEvents";
import { useSectionMinMaxDims } from "../section/resize/sizingPolicy";

// The reference's `useCodeAreaHeight`, minus the application bookkeeping that has no package
// equivalent: its initialized/displayed code-area counters, its `requestUpdateNodeDimensions`
// signal, and its `tempSavedSize` restoration all serve the reference's deferred node-dimension
// measurement. What is left is the behavior the editor itself needs — the height ceiling, the
// overflow it owns while its section is auto-height or mid-resize, the wheel ownership it takes
// once its own scroller can scroll, the scroll hand-off across a resize gesture, and the
// re-measure after the canvas finishes its initial fit.

// The reference's header allowance: the editor's ceiling is the section box minus its header.
const SECTION_HEADER_ALLOWANCE_PX = 30;

export type CodeSectionEditorHeight = {
  wrapperRef: RefObject<HTMLElement | null>;
  handleCreateEditor: (view: EditorView) => void;
  maxHeight: string | undefined;
  overflowClassName: string;
  wheelClassName: string;
};

export function useCodeSectionEditorHeight(sectionId: string): CodeSectionEditorHeight {
  const height = useWorkspaceDocument((x) => getSectionOrThrow(x, sectionId).size.height);
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);
  const { maxHeight: sectionMaxHeight } = useSectionMinMaxDims(sectionId);
  const wrapperRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<EditorView | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const scrollHandoffRef = useRef({ editorScrollTop: 0, wrapperScrollTop: 0 });
  const [wheelClassName, setWheelClassName] = useState("");
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);

  const handleCreateEditor = useCallback((view: EditorView) => {
    editorRef.current = view;
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      setWheelClassName(
        entry.target.scrollHeight > entry.target.clientHeight ? NO_WHEEL_CLASS_NAME : "",
      );
    });
    resizeObserver.observe(view.scrollDOM);
    resizeObserverRef.current = resizeObserver;
  }, []);

  useEffect(
    () => () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (readyToBeVisible && editorRef.current) {
      // The reference re-measures once the canvas finishes its fit, or some lines stay unpainted
      // until the next interaction.
      editorRef.current.requestMeasure();
    }
  }, [readyToBeVisible]);

  const isAutoHeight = height === "auto";
  const maxHeight =
    resizeEvent === "start"
      ? undefined
      : isAutoHeight
        ? `${String(Math.max(0, sectionMaxHeight - SECTION_HEADER_ALLOWANCE_PX))}px`
        : `${String(height - SECTION_HEADER_ALLOWANCE_PX)}px`;
  const overflowClassName = resizeEvent === "start" || isAutoHeight ? "overflow-y-auto" : "";

  // The reference samples both offsets during render and hands them to an effect keyed on the
  // resize tick alone. Sampling into a ref keeps that timing while leaving the effect's inputs
  // honest.
  scrollHandoffRef.current = {
    editorScrollTop: editorRef.current?.scrollDOM.scrollTop ?? 0,
    wrapperScrollTop: wrapperRef.current?.scrollTop ?? 0,
  };
  useEffect(() => {
    // The scroller changes hands during a resize gesture: the wrapper owns it while the section
    // is being dragged, and the editor takes it back afterwards. Carry the position across.
    const { editorScrollTop, wrapperScrollTop } = scrollHandoffRef.current;
    if (wrapperRef.current && resizeEvent === "start") {
      wrapperRef.current.scrollTop = editorScrollTop;
    } else if (editorRef.current && resizeEvent === "end") {
      editorRef.current.scrollDOM.scrollTop = wrapperScrollTop;
    }
  }, [resizeEvent]);

  return { wrapperRef, handleCreateEditor, maxHeight, overflowClassName, wheelClassName };
}
