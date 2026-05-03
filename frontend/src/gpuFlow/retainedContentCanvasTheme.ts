export type GpuRetainedContentCanvasPalette = {
  readonly disabledText: string;
  readonly errorAccent: string;
  readonly focusRing: string;
  readonly labelAccentText: string;
  readonly labelMutedText: string;
  readonly labelText: string;
  readonly nestGuide: string;
  readonly rowBackground: string;
  readonly rowDivider: string;
  readonly rowDraggingBackground: string;
  readonly rowErrorBackground: string;
  readonly rowFocusedBackground: string;
  readonly rowHoverBackground: string;
  readonly rowSelectedBackground: string;
  readonly searchFocusedRing: string;
  readonly searchRing: string;
  readonly surfaceBackground: string;
  readonly textLikeBackground: string;
  readonly textLikeBorder: string;
  readonly textLikeDisabledBackground: string;
  readonly textLikeDisabledText: string;
  readonly textLikeCodeAtomText: string;
  readonly textLikeCodeNumberText: string;
  readonly textLikeFocusedBorder: string;
  readonly textLikeSelectedBorder: string;
  readonly textLikeText: string;
  readonly textLikeVisualStyle: "box" | "row-text";
};

const LIGHT_RETAINED_CONTENT_CANVAS_PALETTE: GpuRetainedContentCanvasPalette = {
  disabledText: "#94a3b8",
  errorAccent: "#ef4444",
  focusRing: "#0284c7",
  labelAccentText: "hsla(157, 100%, 28%, 1)",
  labelMutedText: "#4b5563",
  labelText: "#0f172a",
  nestGuide: "#cbd5e1",
  rowBackground: "#f8fafc",
  rowDivider: "rgba(203, 213, 225, 0.72)",
  rowDraggingBackground: "#e2e8f0",
  rowErrorBackground: "#fef2f2",
  rowFocusedBackground: "#e0f2fe",
  rowHoverBackground: "#eff6ff",
  rowSelectedBackground: "#dbeafe",
  searchFocusedRing: "#22c55e",
  searchRing: "#2563eb",
  surfaceBackground: "#f8fafc",
  textLikeBackground: "#ffffff",
  textLikeBorder: "#cbd5e1",
  textLikeCodeAtomText: "#e36209",
  textLikeCodeNumberText: "#005cc5",
  textLikeDisabledBackground: "#f1f5f9",
  textLikeDisabledText: "#94a3b8",
  textLikeFocusedBorder: "#2563eb",
  textLikeSelectedBorder: "#93c5fd",
  textLikeText: "#334155",
  textLikeVisualStyle: "box",
};

const DARK_RETAINED_CONTENT_CANVAS_PALETTE: GpuRetainedContentCanvasPalette = {
  disabledText: "rgb(100, 116, 139)",
  errorAccent: "rgb(248, 113, 113)",
  focusRing: "rgb(56, 189, 248)",
  labelAccentText: "#7ee787",
  labelMutedText: "#4b5563",
  labelText: "hsl(219, 25%, 77%)",
  nestGuide: "rgba(148, 163, 184, 0.24)",
  rowBackground: "hsl(220, 25%, 8.5%)",
  rowDivider: "hsla(219, 25%, 34%, 0.3)",
  rowDraggingBackground: "rgba(51, 65, 85, 0.72)",
  rowErrorBackground: "rgba(127, 29, 29, 0.3)",
  rowFocusedBackground: "rgba(2, 132, 199, 0.22)",
  rowHoverBackground: "rgba(30, 41, 59, 0.72)",
  rowSelectedBackground: "rgba(29, 78, 216, 0.48)",
  searchFocusedRing: "rgb(74, 222, 128)",
  searchRing: "rgb(96, 165, 250)",
  surfaceBackground: "hsl(220, 25%, 8.5%)",
  textLikeBackground: "transparent",
  textLikeBorder: "rgba(71, 85, 105, 0.5)",
  textLikeCodeAtomText: "#ffab70",
  textLikeCodeNumberText: "#79c0ff",
  textLikeDisabledBackground: "transparent",
  textLikeDisabledText: "rgb(100, 116, 139)",
  textLikeFocusedBorder: "rgb(96, 165, 250)",
  textLikeSelectedBorder: "rgba(147, 197, 253, 0.92)",
  textLikeText: "rgb(203, 213, 225)",
  textLikeVisualStyle: "row-text",
};

export function getGpuRetainedContentCanvasPalette(
  darkMode: boolean,
): GpuRetainedContentCanvasPalette {
  return darkMode
    ? DARK_RETAINED_CONTENT_CANVAS_PALETTE
    : LIGHT_RETAINED_CONTENT_CANVAS_PALETTE;
}

export function isGpuRetainedContentCanvasDarkMode(
  canvas: HTMLCanvasElement,
): boolean {
  return Boolean(
    canvas.closest(".dark") ??
      canvas.ownerDocument.documentElement.closest(".dark"),
  );
}
