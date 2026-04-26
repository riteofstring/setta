import type {
  CanvasFlowCanvasElement,
  CanvasFlowRenderingContext,
  CanvasFlowWebglRenderingContext,
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

export function assertHtmlInCanvasWebglSupport(
  canvas: HTMLCanvasElement,
): CanvasFlowWebglRenderingContext {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: false,
  });
  if (!gl) {
    throw new Error("CanvasFlow WebGL renderer requires WebGL support.");
  }
  if (
    typeof (gl as Partial<CanvasFlowWebglRenderingContext>)
      .texElementImage2D !== "function"
  ) {
    throw new Error(
      "CanvasFlow WebGL renderer requires HTML-in-Canvas texElementImage2D support.",
    );
  }
  if (
    typeof (canvas as Partial<CanvasFlowCanvasElement>).requestPaint !==
    "function"
  ) {
    throw new Error("HTML-in-Canvas requestPaint is not available.");
  }
  return gl as CanvasFlowWebglRenderingContext;
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
