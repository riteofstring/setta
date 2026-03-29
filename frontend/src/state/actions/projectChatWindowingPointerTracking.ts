type Point = {
  x: number;
  y: number;
};

type ProjectChatBootPointerLocations = {
  lastPointerDownLocation: Point | null;
  lastPointerUpLocation: Point | null;
};

const projectChatBootPointerLocations: ProjectChatBootPointerLocations = {
  lastPointerDownLocation: null,
  lastPointerUpLocation: null,
};

function clonePoint(point: Point | null): Point | null {
  if (!point) {
    return null;
  }
  return {
    x: point.x,
    y: point.y,
  };
}

export function recordProjectChatPointerDownLocation(point: Point): void {
  projectChatBootPointerLocations.lastPointerDownLocation = clonePoint(point);
}

export function recordProjectChatPointerUpLocation(point: Point): void {
  projectChatBootPointerLocations.lastPointerUpLocation = clonePoint(point);
}

export function setProjectChatBootPointerLocations({
  lastPointerDownLocation,
  lastPointerUpLocation,
}: ProjectChatBootPointerLocations): void {
  projectChatBootPointerLocations.lastPointerDownLocation = clonePoint(
    lastPointerDownLocation,
  );
  projectChatBootPointerLocations.lastPointerUpLocation = clonePoint(
    lastPointerUpLocation,
  );
}

export function getProjectChatBootPointerCandidates(): Array<Point> {
  const { lastPointerDownLocation, lastPointerUpLocation } =
    projectChatBootPointerLocations;
  return [lastPointerUpLocation, lastPointerDownLocation].flatMap((point) =>
    point ? [clonePoint(point)] : [],
  );
}

export function resetProjectChatBootPointerLocations(): void {
  projectChatBootPointerLocations.lastPointerDownLocation = null;
  projectChatBootPointerLocations.lastPointerUpLocation = null;
}
