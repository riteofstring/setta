export function resolveEstimatedDataPortAnchor({
  rect,
  portId,
  portIds,
  handleType,
}: {
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  portId: string;
  portIds: string[];
  handleType: "source" | "target";
}): { x: number; y: number } {
  const x = handleType === "source" ? rect.x + rect.width : rect.x;
  if (portIds.length === 0) {
    return {
      x,
      y: rect.y + rect.height / 2,
    };
  }
  const portIndex = portIds.indexOf(portId);
  if (portIndex < 0) {
    return {
      x,
      y: rect.y + rect.height / 2,
    };
  }
  const y = rect.y + ((portIndex + 1) / (portIds.length + 1)) * rect.height;
  return { x, y };
}
