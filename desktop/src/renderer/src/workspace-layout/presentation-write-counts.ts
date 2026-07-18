import type { PresentationWriteCounts } from "./presentation-engine";

export function emptyPresentationWriteCounts(): PresentationWriteCounts {
  return {
    boxWrites: 0,
    browserViewportWrites: 0,
    deferredHeavyViewportWrites: 0,
    heavyViewportWrites: 0,
    nativeBoundsUpdates: 0,
    surfaceViewportWrites: 0,
    transformWrites: 0,
  };
}

export function addPresentationWriteCounts(
  target: PresentationWriteCounts,
  source: PresentationWriteCounts,
): PresentationWriteCounts {
  target.boxWrites += source.boxWrites;
  target.browserViewportWrites += source.browserViewportWrites;
  target.deferredHeavyViewportWrites += source.deferredHeavyViewportWrites;
  target.heavyViewportWrites += source.heavyViewportWrites;
  target.nativeBoundsUpdates += source.nativeBoundsUpdates;
  target.surfaceViewportWrites += source.surfaceViewportWrites;
  target.transformWrites += source.transformWrites;
  return target;
}
