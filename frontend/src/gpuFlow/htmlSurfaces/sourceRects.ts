export type HtmlSurfaceSourceRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export function resolveElementSourceRect({
  sourceElement,
  target,
}: {
  readonly sourceElement: Element | null;
  readonly target: Element | null;
}): HtmlSurfaceSourceRect | undefined {
  if (!sourceElement || !target || target === sourceElement) {
    return undefined;
  }
  if (!sourceElement.contains(target)) {
    return undefined;
  }

  const sourceRect = sourceElement.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (!hasFiniteRectInputs(sourceRect, targetRect)) {
    return undefined;
  }

  const left = clamp(targetRect.left - sourceRect.left, 0, sourceRect.width);
  const top = clamp(targetRect.top - sourceRect.top, 0, sourceRect.height);
  const right = clamp(targetRect.right - sourceRect.left, 0, sourceRect.width);
  const bottom = clamp(targetRect.bottom - sourceRect.top, 0, sourceRect.height);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return {
    height,
    width,
    x: left,
    y: top,
  };
}

export function unionHtmlSurfaceSourceRects(
  previous: HtmlSurfaceSourceRect | null,
  current: HtmlSurfaceSourceRect,
): HtmlSurfaceSourceRect {
  if (!previous) {
    return current;
  }
  const left = Math.min(previous.x, current.x);
  const top = Math.min(previous.y, current.y);
  const right = Math.max(previous.x + previous.width, current.x + current.width);
  const bottom = Math.max(
    previous.y + previous.height,
    current.y + current.height,
  );
  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}

function hasFiniteRectInputs(sourceRect: DOMRect, targetRect: DOMRect): boolean {
  return [
    sourceRect.left,
    sourceRect.top,
    sourceRect.right,
    sourceRect.bottom,
    sourceRect.width,
    sourceRect.height,
    targetRect.left,
    targetRect.top,
    targetRect.right,
    targetRect.bottom,
  ].every(Number.isFinite);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
