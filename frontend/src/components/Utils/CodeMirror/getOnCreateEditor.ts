import { Completion, CompletionSource } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { dispatchGpuFlowNodeDirtyEvent } from "gpuFlow/nodeDirtyEvents";
import { getZoom } from "gpuFlow/viewportActions";

type GpuFlowPaintableCanvas = HTMLCanvasElement & {
  readonly requestPaint?: () => void;
};

function fixPlaceholderCursor(divId, value, defaultVal) {
  // The cursor appears the wrong size when there's a placeholder text and when you're zoomed in.
  // This is a hacky solution to that problem.
  if (!value && defaultVal) {
    const divs = document.querySelectorAll<HTMLElement>(`#${divId} .cm-cursor`);
    divs.forEach((div) => {
      div.style.height = `${14 * getZoom()}px`;
    });
  }
}

export function getOnCreateEditor({
  initialEvent,
  setRealIsInitialized,
  divId,
  value,
  defaultVal,
}) {
  return (view) => {
    if (view.contentDOM?.focus) {
      view.contentDOM.focus({ preventScroll: true });
    } else {
      view.focus();
    }
    if (initialEvent !== "tab") {
      const { clientX, clientY } = initialEvent;
      const pos = view.posAtCoords({ x: clientX, y: clientY });
      view.dispatch({ selection: { anchor: pos, head: pos } });
    }

    fixPlaceholderCursor(divId, value, defaultVal);
    setRealIsInitialized(true);
    requestGpuFlowCodeMirrorActivationPaint(view);
  };
}

export function requestGpuFlowCodeMirrorActivationPaint(
  view: Pick<EditorView, "dom">,
) {
  scheduleGpuFlowCodeMirrorActivationPaint(() => {
    dispatchGpuFlowNodeDirtyEvent(view.dom, {
      priority: "interactive",
      reason: "focus",
    });
    getGpuFlowPaintableCanvas(view.dom)?.requestPaint?.();
  });
}

function scheduleGpuFlowCodeMirrorActivationPaint(callback: () => void) {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }
  callback();
}

function getGpuFlowPaintableCanvas(
  element: Element,
): GpuFlowPaintableCanvas | null {
  return (
    element.closest<GpuFlowPaintableCanvas>("canvas[layoutsubtree]") ??
    element
      .closest(".setta-gpu-flow")
      ?.querySelector<GpuFlowPaintableCanvas>("canvas[layoutsubtree]") ??
    null
  );
}

function getFromTo(options, before, context) {
  for (const opt of options) {
    if (opt.from) {
      return { from: opt.from, to: opt.to };
    }
  }
  return { from: before ? before.from : context.pos };
}

export function wrappedCompletionsFn(
  completionFn: (fullText: string, position: number) => Promise<Completion[]>,
): CompletionSource {
  return async (context) => {
    const fullText = context.state.doc.toString();
    if (!fullText.trim()) return null;
    // TODO: implement this
    // context.addEventListener(
    //   "abort",
    //   () => {
    //     console.log("aborted");
    //   },
    //   { onDocChange: true },
    // );
    const before = context.matchBefore(/([^.=\\(+-/ ]*)$/);
    const res = await completionFn(fullText, context.pos);
    if (res) {
      return {
        filter: true,
        ...getFromTo(res, before, context),
        options: res,
        // validFor: /([^.=\\(]*)$/,
      };
    }
    return null;
  };
}
