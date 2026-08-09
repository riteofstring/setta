import { useReactFlow } from "./store";

// The reference's section shell reads this flag to hoist `will-change: transform` onto the
// section surface only while the viewport is actively panning or zooming.
export function useViewportInteractionActive(): boolean {
  return useReactFlow((s) => s.viewportInteractionActive);
}
