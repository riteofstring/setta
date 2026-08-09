export const WORKSPACE_REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedWorkspaceMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(WORKSPACE_REDUCED_MOTION_QUERY).matches
  );
}

export function resolveWorkspaceMotionDuration(duration: number): number {
  return prefersReducedWorkspaceMotion() ? 0 : duration;
}
