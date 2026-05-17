import type { Page } from "@playwright/test";

export type RetainedDiagnosticsSnapshot = {
  readonly hitTests: readonly {
    readonly checkedHitRecordCount: number;
    readonly durationMs: number;
    readonly matched: boolean;
    readonly retainedSurfaceCount: number;
    readonly testedHitRecordCount: number;
    readonly testedSurfaceCount: number;
  }[];
  readonly pointerEvents: readonly { readonly type: string }[];
  readonly sceneBuilds: readonly {
    readonly durationMs: number;
    readonly hitRecordBuildDurationMs: number;
    readonly hitRecordCount: number;
    readonly rowCount: number;
    readonly sceneId: string;
    readonly visibleRowCount: number;
  }[];
};

export async function installRetainedDiagnosticsProbe(
  page: Page,
): Promise<void> {
  const install = () => {
    const state = {
      hitTests: [] as unknown[],
      pointerEvents: [] as unknown[],
      sceneBuilds: [] as unknown[],
    };
    const pushBounded = (target: unknown[], value: unknown) => {
      target.push(value);
      if (target.length > 400) {
        target.shift();
      }
    };
    window.__SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS__ = {
      recordHitTest(sample) {
        pushBounded(state.hitTests, {
          checkedHitRecordCount: sample.checkedHitRecordCount,
          durationMs: sample.durationMs,
          matched: sample.matched,
          retainedSurfaceCount: sample.retainedSurfaceCount,
          testedHitRecordCount: sample.testedHitRecordCount,
          testedSurfaceCount: sample.testedSurfaceCount,
        });
      },
      recordSceneBuild(sample) {
        pushBounded(state.sceneBuilds, {
          durationMs: sample.durationMs,
          hitRecordBuildDurationMs: sample.hitRecordBuildDurationMs,
          hitRecordCount: sample.hitRecordCount,
          rowCount: sample.rowCount,
          sceneId: sample.sceneId,
          visibleRowCount: sample.visibleRowCount,
        });
      },
    };
    for (const type of ["pointerdown", "pointermove", "pointerup", "wheel"]) {
      window.addEventListener(
        type,
        () => pushBounded(state.pointerEvents, { type }),
        { capture: true, passive: true },
      );
    }
    window.__SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS_PROBE__ = {
      snapshot: () => ({
        hitTests: [...state.hitTests],
        pointerEvents: [...state.pointerEvents],
        sceneBuilds: [...state.sceneBuilds],
      }),
    };
  };
  await page.addInitScript(install);
  await page.evaluate(install);
}

export async function readRetainedDiagnostics(
  page: Page,
): Promise<RetainedDiagnosticsSnapshot> {
  return await page.evaluate(() => {
    const probe = window.__SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS_PROBE__;
    if (!probe) {
      throw new Error("Missing retained content diagnostics probe.");
    }
    return probe.snapshot();
  });
}

export function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

declare global {
  interface Window {
    __SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS__?:
      | {
          recordHitTest?: (sample: {
            checkedHitRecordCount: number;
            durationMs: number;
            matched: boolean;
            retainedSurfaceCount: number;
            testedHitRecordCount: number;
            testedSurfaceCount: number;
          }) => void;
          recordSceneBuild?: (sample: {
            durationMs: number;
            hitRecordBuildDurationMs: number;
            hitRecordCount: number;
            rowCount: number;
            sceneId: string;
            visibleRowCount: number;
          }) => void;
        }
      | undefined;
    __SETTA_GPU_RETAINED_CONTENT_DIAGNOSTICS_PROBE__?:
      | { snapshot(): RetainedDiagnosticsSnapshot }
      | undefined;
  }
}
