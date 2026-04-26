type EdgeHandleKeyType = "source" | "target";

export function makeEdgeHandleKey(
  sectionId: string,
  portId: string,
  type: EdgeHandleKeyType,
) {
  return `${sectionId}:${portId}:${type}`;
}
