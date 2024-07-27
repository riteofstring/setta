export function newSectionPosition({ x, y, zIndex }) {
  return {
    x: x ?? 0,
    y: y ?? 0,
    zIndex: zIndex ?? 0,
  };
}
