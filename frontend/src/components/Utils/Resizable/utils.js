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
    return {
      width: maybeAutoPx(minWidth, pxWidth, sizeMode.width),
      height: maybeAutoPx(minHeight, pxHeight, sizeMode.height),
    };
  }
  if (direction === "right" && sizeMode.width) {
    return { width: maybeAutoPx(minWidth, pxWidth, sizeMode.width) };
  }
  if (direction === "bottom" && sizeMode.height) {
    return { height: maybeAutoPx(minHeight, pxHeight, sizeMode.height) };
  }
  return {};
}

function getSingleClickSize({ direction, ref, sizeMode }) {
  // width returns minWidth instead of auto because
  // it seems like once width is resized, auto does nothing
  const pxWidth = parseCurrPx(ref.style.width);
  const pxHeight = parseCurrPx(ref.style.height);

  if (direction === "bottomRight") {
    return {
      width: pxWidth,
      height: pxHeight,
    };
  }
  if (direction === "right" && sizeMode.width) {
    return { width: pxWidth };
  }
  if (direction === "bottom" && sizeMode.height) {
    return { height: pxHeight };
  }
  return {};
}

export function getChangedSize({ props, minWidth, minHeight, sizeMode }) {
  const [e, direction, ref, d] = props;
  if (d.width === 0 && d.height === 0 && e.detail === 2) {
    return getDoubleClickSize({
      direction,
      ref,
      minWidth,
      minHeight,
      sizeMode,
    });
  } else {
    return getSingleClickSize({ direction, ref, sizeMode });
  }
}
