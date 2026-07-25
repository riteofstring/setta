const compactLayoutBreakpoint = 760;
const mobileLayoutBreakpoint = 520;

// At mobile widths the workspace pages between full-screen panes, navigation
// moves to a bottom control bar, and the top chrome collapses.
export function isMobileViewportWidth(viewportWidth: number): boolean {
  return viewportWidth < mobileLayoutBreakpoint;
}

export function compactPaneWidth(
  width: number,
  viewportWidth: number,
  minWidth: number,
  compactShare: number,
) {
  if (viewportWidth >= compactLayoutBreakpoint) {
    return width;
  }
  const compactMaxWidth = Math.max(minWidth, Math.floor(viewportWidth * compactShare));
  return Math.min(width, compactMaxWidth);
}
