export const SIZE_MODE = {
  any: "any",
  auto_only: "auto_only",
  manual_only: "manual_only",
};

function parseCurrPx(x) {
  return x === "auto" ? x : parseInt(x);
}

function maybeAutoPx(autoDim, pxDim, sizeMode) {
  return sizeMode !== SIZE_MODE.manual_only ? autoDim : pxDim;
}

function getDoubleClickSize({ direction, ref, minWidth, minHeight, sizeMode }) {
  // width returns minWidth instead of auto because
  // it seems like once width is resized, auto does nothing
  const pxWidth = parseCurrPx(ref.style.width);
  const pxHeight = parseCurrPx(ref.style.height);

  if (direction === "bottomRight") {
    return [
      maybeAutoPx(minWidth, pxWidth, sizeMode.width),
      maybeAutoPx(minHeight, pxHeight, sizeMode.height),
    ];
  }
  if (direction === "right" && sizeMode.width) {
    return [maybeAutoPx(minWidth, pxWidth, sizeMode.width), pxHeight];
  }
  if (direction === "bottom" && sizeMode.height) {
    return [pxWidth, maybeAutoPx(minHeight, pxHeight, sizeMode.height)];
  }
  return [pxWidth, pxHeight];
}

export function getNewSize({ props, minWidth, minHeight, sizeMode }) {
  const [e, direction, ref, d] = props;
  let width;
  let height;
  // detect double click (but only for non-output sections)
  if (d.width === 0 && d.height === 0 && e.detail === 2) {
    [width, height] = getDoubleClickSize({
      direction,
      ref,
      minWidth,
      minHeight,
      sizeMode,
    });
  } else {
    width = parseCurrPx(ref.style.width);
    height = parseCurrPx(ref.style.height);
  }
  return { width, height };
}
