export const projectPaneDefaultWidth = 220;
export const projectPaneMaxWidth = 320;
export const projectPaneMinWidth = 128;

const compactLayoutBreakpoint = 760;
const projectPaneCompactShare = 0.28;

export function compactProjectPaneWidth(width: number, viewportWidth: number) {
  return compactPaneWidth(width, viewportWidth, projectPaneMinWidth, projectPaneCompactShare);
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
