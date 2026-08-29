import type { EditorView, ViewUpdate } from "@codemirror/view";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { computeReadyToBeVisible } from "../canvas/fitView";
import { useReactFlow } from "../canvas/store";
import { getSectionOrThrow } from "../document/documentSelectors";
import { useWorkspaceDocument } from "../document/stores";
import { NO_WHEEL_CLASS_NAME } from "../interaction";
import { useResizeEvent } from "../section/resize/resizeEvents";
import { useSectionMinMaxDims } from "../section/resize/sizingPolicy";

const SECTION_HEADER_ALLOWANCE_PX = 30;

type SectionEditorHeight = {
  editorHeight: string | undefined;
  wrapperRef: RefObject<HTMLElement | null>;
  handleCreateEditor: (view: EditorView) => void;
  handleEditorUpdate: (update: ViewUpdate) => void;
  maxHeight: string | undefined;
  overflowClassName: string;
  wheelClassName: string;
};

function getEditorHeightLayout(
  height: number | "auto",
  sectionMaxHeight: number,
  resizeEvent: "start" | "end" | undefined,
): Pick<
  SectionEditorHeight,
  "editorHeight" | "maxHeight" | "overflowClassName"
> {
  const isAutoHeight = height === "auto";
  const isWrapperScroller = resizeEvent === "start" || isAutoHeight;
  const availableHeight = isAutoHeight
    ? Math.max(0, sectionMaxHeight - SECTION_HEADER_ALLOWANCE_PX)
    : height - SECTION_HEADER_ALLOWANCE_PX;
  const maxHeight =
    resizeEvent === "start" ? undefined : `${String(availableHeight)}px`;
  return {
    editorHeight: isWrapperScroller ? undefined : "100%",
    maxHeight,
    overflowClassName: isWrapperScroller ? "overflow-y-auto" : "",
  };
}

export function useSectionEditorHeight(sectionId: string): SectionEditorHeight {
  const height = useWorkspaceDocument(
    (x) => getSectionOrThrow(x, sectionId).size.height,
  );
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);
  const { maxHeight: sectionMaxHeight } = useSectionMinMaxDims(sectionId);
  const wrapperRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<EditorView | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const wheelMeasureKeyRef = useRef({});
  const scrollHandoffRef = useRef({ editorScrollTop: 0, wrapperScrollTop: 0 });
  const [wheelClassName, setWheelClassName] = useState("");
  const readyToBeVisible = useReactFlow(computeReadyToBeVisible);

  const requestWheelOwnershipMeasure = useCallback((view: EditorView) => {
    view.requestMeasure({
      key: wheelMeasureKeyRef.current,
      read: (measuredView) => {
        const scroller = measuredView.scrollDOM;
        return (
          scroller.scrollHeight - scroller.clientHeight > 1 ||
          scroller.scrollWidth - scroller.clientWidth > 1
        );
      },
      write: (hasNativeOverflow) => {
        setWheelClassName(hasNativeOverflow ? NO_WHEEL_CLASS_NAME : "");
      },
    });
  }, []);

  const handleCreateEditor = useCallback(
    (view: EditorView) => {
      editorRef.current = view;
      resizeObserverRef.current?.disconnect();
      const resizeObserver = new ResizeObserver(() => {
        requestWheelOwnershipMeasure(view);
      });

      resizeObserver.observe(view.scrollDOM);
      resizeObserver.observe(view.contentDOM);
      resizeObserverRef.current = resizeObserver;
      requestWheelOwnershipMeasure(view);
    },
    [requestWheelOwnershipMeasure],
  );

  const handleEditorUpdate = useCallback(
    (update: ViewUpdate) => {
      if (update.geometryChanged) {
        requestWheelOwnershipMeasure(update.view);
      }
    },
    [requestWheelOwnershipMeasure],
  );

  useEffect(
    () => () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (readyToBeVisible && editorRef.current) {
      editorRef.current.requestMeasure();
      requestWheelOwnershipMeasure(editorRef.current);
    }
  }, [readyToBeVisible, requestWheelOwnershipMeasure]);

  const { editorHeight, maxHeight, overflowClassName } = getEditorHeightLayout(
    height,
    sectionMaxHeight,
    resizeEvent,
  );

  scrollHandoffRef.current = {
    editorScrollTop: editorRef.current?.scrollDOM.scrollTop ?? 0,
    wrapperScrollTop: wrapperRef.current?.scrollTop ?? 0,
  };
  useEffect(() => {
    const { editorScrollTop, wrapperScrollTop } = scrollHandoffRef.current;
    if (wrapperRef.current && resizeEvent === "start") {
      wrapperRef.current.scrollTop = editorScrollTop;
    } else if (editorRef.current && resizeEvent === "end") {
      editorRef.current.scrollDOM.scrollTop = wrapperScrollTop;
    }
  }, [resizeEvent]);

  return {
    editorHeight,
    wrapperRef,
    handleCreateEditor,
    handleEditorUpdate,
    maxHeight,
    overflowClassName,
    wheelClassName,
  };
}
