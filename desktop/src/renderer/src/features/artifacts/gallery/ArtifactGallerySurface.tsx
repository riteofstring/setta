import { Renderer } from "@openuidev/react-lang";
import { useMemo, useState } from "react";

import { createArtifactLibrary } from "../artifact-library";
import { artifactConformanceFixtures } from "../generated/conformance-corpus";

/**
 * Every artifact primitive, on one page.
 *
 * The catalog's conformance corpus already covers every model-visible component
 * and every limit the catalog allows — it is what proves the renderer map is
 * complete. It was reachable only from a unit test, so a change to the artifact
 * visual language could be reviewed only by finding a real artifact that
 * happened to use the component in question.
 *
 * This is that corpus, rendered. It is a development surface: no Director, no
 * backend, no persistence. The fixtures are generated, so this page cannot
 * drift from the catalog the backend accepts.
 *
 * Two views, because the two questions are different. "All" is the sweep — does
 * a palette or spacing change hold across the whole catalog. A single fixture
 * is the close read, with the source that produced it.
 */
export function ArtifactGallerySurface(): React.JSX.Element {
  const library = useMemo(() => createArtifactLibrary(), []);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const selected = artifactConformanceFixtures.find((fixture) => fixture.name === selectedName);
  const shown = selected === undefined ? artifactConformanceFixtures : [selected];

  return (
    <div className="artifact-gallery">
      <header className="artifact-gallery-bar">
        <h1>Artifact catalog</h1>
        <nav aria-label="Fixtures" className="artifact-gallery-tabs">
          <button
            aria-pressed={selected === undefined}
            onClick={() => setSelectedName(null)}
            type="button"
          >
            All {artifactConformanceFixtures.length}
          </button>
          {artifactConformanceFixtures.map((fixture) => (
            <button
              aria-pressed={fixture.name === selectedName}
              key={fixture.name}
              onClick={() => setSelectedName(fixture.name)}
              type="button"
            >
              {fixture.name.replace(/_/g, " ")}
            </button>
          ))}
        </nav>
      </header>
      <main className="artifact-gallery-scroll">
        {shown.map((fixture) => (
          <section className="artifact-gallery-item" key={fixture.name}>
            <div className="artifact-gallery-item-head">
              <h2>{fixture.name.replace(/_/g, " ")}</h2>
              <p>{fixture.description}</p>
            </div>
            {selected === undefined ? null : (
              <pre className="artifact-gallery-source">
                <code>{fixture.source}</code>
              </pre>
            )}
            {/*
             * The production renderer, not a preview of it. A fixture that
             * throws takes the page down, which is the correct outcome for a
             * surface whose job is to prove the catalog renders.
             */}
            <div className="artifact-gallery-stage">
              <Renderer library={library} response={fixture.source} />
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
