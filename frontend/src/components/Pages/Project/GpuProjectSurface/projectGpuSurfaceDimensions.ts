export type ProjectSurfaceDimensions = {
  readonly height: number;
  readonly width: number;
};

export function getProjectSurfaceClientDimensions(
  element: Pick<HTMLElement, "clientHeight" | "clientWidth">,
): ProjectSurfaceDimensions {
  return {
    height: element.clientHeight,
    width: element.clientWidth,
  };
}
