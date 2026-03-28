import { useMemo, useState } from "react";
import {
  LiveDictAreaMount,
  type LiveDictAreaMountProps,
} from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { buildLiveDictAreaPixiFixedMeasurements } from "./liveDictAreaPixiLayout";
import { LiveDictAreaPixiScene } from "./LiveDictAreaPixiScene";
import { LiveDictAreaPixiValueRowOverlay } from "./LiveDictAreaPixiValueRowOverlay";
import { buildLiveDictAreaPixiValueRowTargets } from "./liveDictAreaPixiValueRowTargets";

type LiveDictAreaPixiOverlayShellProps = {
  liveDictAreaMountProps: LiveDictAreaMountProps;
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
};

export function LiveDictAreaPixiOverlayShell({
  liveDictAreaMountProps,
  liveDictAreaSceneBoundary,
}: LiveDictAreaPixiOverlayShellProps) {
  const [activeValueRowId, setActiveValueRowId] = useState<string | null>(null);
  const [isFallbackOverlayActive, setIsFallbackOverlayActive] = useState(false);
  const valueRowTargets = useMemo(
    () =>
      buildLiveDictAreaPixiValueRowTargets({
        liveDictAreaMountProps,
        liveDictAreaSceneBoundary,
      }),
    [liveDictAreaMountProps, liveDictAreaSceneBoundary],
  );
  const activeValueRowTarget =
    activeValueRowId === null
      ? null
      : valueRowTargets.find((target) => target.rowId === activeValueRowId) ??
        null;

  return (
    <>
      <LiveDictAreaPixiFixedMeasurementMarkers
        liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
      />
      <LiveDictAreaPixiScene
        liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
      />
      {valueRowTargets.map((target) =>
        target.rowId === activeValueRowId ? null : (
          <button
            key={target.rowId}
            aria-label={`Activate editor overlay for ${target.label}`}
            className="absolute z-[5] cursor-text appearance-none border-0 bg-transparent p-0"
            data-live-dict-area-editor-handoff="value-row"
            data-live-dict-area-editor-handoff-row-id={target.rowId}
            onClick={() => {
              setActiveValueRowId(target.rowId);
            }}
            style={{
              height: target.height,
              left: target.x,
              right: 0,
              top: target.y,
            }}
            type="button"
          />
        ),
      )}
      {activeValueRowTarget ? (
        <LiveDictAreaPixiValueRowOverlay target={activeValueRowTarget} />
      ) : valueRowTargets.length === 0 ? (
        isFallbackOverlayActive ? (
          <div
            className="absolute inset-0 z-20 overflow-y-auto"
            data-live-dict-area-editor-overlay="active"
            data-live-dict-area-editor-overlay-kind="full-shell"
          >
            <LiveDictAreaMount {...liveDictAreaMountProps} />
          </div>
        ) : (
          <button
            aria-label="Activate live dict-area editor overlay"
            className="absolute inset-0 z-[5] appearance-none border-0 bg-transparent p-0"
            data-live-dict-area-editor-handoff="available"
            onClick={() => {
              setIsFallbackOverlayActive(true);
            }}
            type="button"
          />
        )
      ) : null}
    </>
  );
}

function LiveDictAreaPixiFixedMeasurementMarkers({
  liveDictAreaSceneBoundary,
}: {
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
}) {
  const measurements = buildLiveDictAreaPixiFixedMeasurements({
    liveDictAreaSceneBoundary,
  });

  if (measurements.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 w-px opacity-0"
    >
      {measurements.map((measurement) => (
        <div
          key={measurement.blockId}
          data-live-dict-area-fixed-measurement={measurement.blockId}
          data-params-fixed="true"
          style={{ height: `${measurement.height}px` }}
        />
      ))}
    </div>
  );
}
