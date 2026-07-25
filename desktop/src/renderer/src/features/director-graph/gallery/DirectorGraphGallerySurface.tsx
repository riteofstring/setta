import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { projectionGalleryFixtures } from "../projection-gallery-fixtures";
import { packSemanticGraphComposition } from "../semantic-graph-packer";
import { DirectorGraphSurface } from "../render/DirectorGraphSurface";
import type { DirectorGraphCanvas } from "../render/director-graph-canvas";

const galleryClock = {
  secondsAt: (timestampMs: number) => timestampMs / 1000,
};

const compactGalleryQuery = "(max-width: 760px)";
const galleryPanelId = "director-graph-gallery-panel";

export function DirectorGraphGallerySurface(): React.JSX.Element {
  const [selectedName, setSelectedName] = useState(projectionGalleryFixtures[0]?.name ?? "");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(() =>
    typeof window !== "undefined" && window.matchMedia(compactGalleryQuery).matches
      ? "horizontal"
      : "vertical",
  );
  const [canvas, setCanvas] = useState<DirectorGraphCanvas | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedFixture =
    projectionGalleryFixtures.find((fixture) => fixture.name === selectedName) ??
    projectionGalleryFixtures[0];
  const selectedIndex = Math.max(
    0,
    projectionGalleryFixtures.findIndex((fixture) => fixture.name === selectedFixture?.name),
  );
  const snapshot = useMemo(() => {
    if (selectedFixture === undefined) {
      return null;
    }
    return packSemanticGraphComposition({
      workstreamId: selectedFixture.name,
      graphs: selectedFixture.graphs,
    });
  }, [selectedFixture]);

  const onReady = useCallback((host: DirectorGraphCanvas | null) => {
    setCanvas(host);
  }, []);

  useEffect(() => {
    document.title = "Setta Director Graph Gallery";
  }, []);

  useEffect(() => {
    const query = window.matchMedia(compactGalleryQuery);
    const updateOrientation = () => {
      setOrientation(query.matches ? "horizontal" : "vertical");
    };
    updateOrientation();
    query.addEventListener("change", updateOrientation);
    return () => query.removeEventListener("change", updateOrientation);
  }, []);

  useEffect(() => {
    if (canvas === null || snapshot === null) {
      return;
    }
    canvas.setSnapshot(snapshot);
  }, [canvas, snapshot]);

  const selectTab = useCallback((index: number) => {
    const fixture = projectionGalleryFixtures[index];
    if (!fixture) {
      return;
    }
    setSelectedName(fixture.name);
    tabRefs.current[index]?.focus();
  }, []);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const lastIndex = projectionGalleryFixtures.length - 1;
      let nextIndex: number | null = null;
      if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = lastIndex;
      } else if (
        (orientation === "vertical" && event.key === "ArrowUp") ||
        (orientation === "horizontal" && event.key === "ArrowLeft")
      ) {
        nextIndex = index === 0 ? lastIndex : index - 1;
      } else if (
        (orientation === "vertical" && event.key === "ArrowDown") ||
        (orientation === "horizontal" && event.key === "ArrowRight")
      ) {
        nextIndex = index === lastIndex ? 0 : index + 1;
      }
      if (nextIndex === null) {
        return;
      }
      event.preventDefault();
      selectTab(nextIndex);
    },
    [orientation, selectTab],
  );

  return (
    <main className="director-graph-gallery">
      <aside className="director-graph-gallery-rail" aria-label="Projection fixtures">
        <h1 className="director-graph-gallery-heading">Projection gallery</h1>
        <div
          aria-label="Projection fixtures"
          aria-orientation={orientation}
          className="director-graph-gallery-tabs"
          role="tablist"
        >
          {projectionGalleryFixtures.map((fixture, index) => (
            <button
              aria-controls={galleryPanelId}
              aria-selected={fixture.name === selectedFixture?.name}
              className="director-graph-gallery-tab"
              id={`director-graph-gallery-tab-${index}`}
              key={fixture.name}
              onClick={() => setSelectedName(fixture.name)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              role="tab"
              tabIndex={index === selectedIndex ? 0 : -1}
              type="button"
            >
              <span>{fixture.name.replaceAll("_", " ")}</span>
              <span>{fixture.graphs.reduce((count, graph) => count + graph.nodes.length, 0)}</span>
            </button>
          ))}
        </div>
      </aside>
      <section
        aria-labelledby={`director-graph-gallery-tab-${selectedIndex}`}
        className="director-graph-gallery-stage"
        id={galleryPanelId}
        role="tabpanel"
        tabIndex={0}
      >
        <DirectorGraphSurface
          timeSecondsAt={galleryClock.secondsAt}
          onReady={onReady}
          label="Director semantic graph projection fixture"
        />
      </section>
    </main>
  );
}
