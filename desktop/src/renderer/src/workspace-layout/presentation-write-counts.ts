import type { PresentationWriteCounts } from "./presentation-engine";

export function emptyPresentationWriteCounts(): PresentationWriteCounts {
  return {
    boxWrites: 0,
    browserViewportWrites: 0,
    canvasViewportWrites: 0,
    deferredHeavyViewportWrites: 0,
    gitGraphViewportWrites: 0,
    heavyViewportWrites: 0,
    nativeBoundsUpdates: 0,
    surfaceViewportWrites: 0,
    terminalViewportWrites: 0,
    transformWrites: 0,
  };
}

export function addPresentationWriteCounts(
  target: PresentationWriteCounts,
  source: PresentationWriteCounts,
): PresentationWriteCounts {
  target.boxWrites += source.boxWrites;
  target.browserViewportWrites += source.browserViewportWrites;
  target.canvasViewportWrites += source.canvasViewportWrites;
  target.deferredHeavyViewportWrites += source.deferredHeavyViewportWrites;
  target.gitGraphViewportWrites += source.gitGraphViewportWrites;
  target.heavyViewportWrites += source.heavyViewportWrites;
  target.nativeBoundsUpdates += source.nativeBoundsUpdates;
  target.surfaceViewportWrites += source.surfaceViewportWrites;
  target.terminalViewportWrites += source.terminalViewportWrites;
  target.transformWrites += source.transformWrites;
  return target;
}
