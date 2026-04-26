import type {
  CanvasFlowCanvasElement,
  CanvasFlowRenderingContext,
} from "./canvasFlowTypes";

export function assertHtmlInCanvasSupport(
  canvas: HTMLCanvasElement,
): CanvasFlowRenderingContext {
  const ctx = canvas.getContext("2d");
  if (
    !ctx ||
    typeof (ctx as Partial<CanvasFlowRenderingContext>).drawElementImage !==
      "function"
  ) {
    throw new Error("HTML-in-Canvas drawElementImage is not available.");
  }
  if (
    typeof (canvas as Partial<CanvasFlowCanvasElement>).requestPaint !==
    "function"
  ) {
    throw new Error("HTML-in-Canvas requestPaint is not available.");
  }
  return ctx as CanvasFlowRenderingContext;
}

export function requestCanvasFlowPaint(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    return;
  }
  const requestPaint = (canvas as Partial<CanvasFlowCanvasElement>)
    .requestPaint;
  if (typeof requestPaint !== "function") {
    return;
  }
  requestPaint.call(canvas);
}
