import { Completion, CompletionSource } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import { dispatchGpuFlowNodeDirtyEvent } from "gpuFlow/nodeDirtyEvents";
import { getZoom } from "gpuFlow/viewportActions";
import {
  nowChromeReproPerformanceMs,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

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
    postGpuFlowCodeMirrorActivationChromeReproEvent({
      defaultValueLength: (defaultVal ?? "").length,
      divId,
      event: summarizeGpuFlowCodeMirrorInitialEvent(initialEvent),
      hasContentDOM: Boolean(view.contentDOM),
      phase: "editor-created",
      valueLength: (value ?? "").length,
    });
    requestGpuFlowCodeMirrorActivationPaint(view, {
      defaultValueLength: (defaultVal ?? "").length,
      divId,
      event: summarizeGpuFlowCodeMirrorInitialEvent(initialEvent),
      valueLength: (value ?? "").length,
    });
  };
}

export function requestGpuFlowCodeMirrorActivationPaint(
  view: Pick<EditorView, "dom">,
  chromeReproContext?: GpuFlowCodeMirrorActivationPaintChromeReproContext,
) {
  const scheduledAtMs = nowChromeReproPerformanceMs();
  scheduleGpuFlowCodeMirrorActivationPaint(() => {
    dispatchGpuFlowNodeDirtyEvent(view.dom, {
      priority: "interactive",
      reason: "focus",
    });
    getGpuFlowPaintableCanvas(view.dom)?.requestPaint?.();
    postGpuFlowCodeMirrorActivationChromeReproEvent({
      defaultValueLength: chromeReproContext?.defaultValueLength ?? 0,
      divId: chromeReproContext?.divId ?? view.dom.id,
      event: chromeReproContext?.event ?? null,
      paintRequestDelayMs: roundChromeReproMs(
        nowChromeReproPerformanceMs() - scheduledAtMs,
      ),
      phase: "paint-requested",
      valueLength: chromeReproContext?.valueLength ?? 0,
    });
  });
}

type GpuFlowCodeMirrorActivationPaintChromeReproContext = {
  readonly defaultValueLength: number;
  readonly divId: string;
  readonly event: ReturnType<typeof summarizeGpuFlowCodeMirrorInitialEvent>;
  readonly valueLength: number;
};

function postGpuFlowCodeMirrorActivationChromeReproEvent({
  defaultValueLength,
  divId,
  event,
  hasContentDOM,
  paintRequestDelayMs,
  phase,
  valueLength,
}: {
  readonly defaultValueLength: number;
  readonly divId: string;
  readonly event: ReturnType<
    typeof summarizeGpuFlowCodeMirrorInitialEvent
  > | null;
  readonly hasContentDOM?: boolean | undefined;
  readonly paintRequestDelayMs?: number | undefined;
  readonly phase: string;
  readonly valueLength: number;
}) {
  postChromeReproEvent("gpu-flow-codemirror-activation", {
    defaultValueLength,
    divId,
    event,
    hasContentDOM: hasContentDOM ?? null,
    paintRequestDelayMs: paintRequestDelayMs ?? null,
    performanceMs: roundChromeReproMs(nowChromeReproPerformanceMs()),
    phase,
    valueLength,
  });
}

function summarizeGpuFlowCodeMirrorInitialEvent(
  initialEvent: "tab" | { readonly clientX: number; readonly clientY: number },
) {
  if (initialEvent === "tab") {
    return { kind: "tab" as const };
  }
  return {
    clientX: roundChromeReproMs(initialEvent.clientX),
    clientY: roundChromeReproMs(initialEvent.clientY),
    kind: "pointer" as const,
  };
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
