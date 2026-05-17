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

export async function resolveRetainedSurfaceWheelPoint(
  page: Page,
  surfaceId: string,
): Promise<{ readonly x: number; readonly y: number }> {
  return await page.evaluate((targetSurfaceId) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter(
        (row) =>
          row.surfaceId === targetSurfaceId &&
          row.clientRect.width > 8 &&
          row.clientRect.height > 8 &&
          row.clientRect.x + row.clientRect.width > 0 &&
          row.clientRect.y + row.clientRect.height > 0 &&
          row.clientRect.x < window.innerWidth &&
          row.clientRect.y < window.innerHeight,
      )
      .sort((left, right) => left.clientRect.y - right.clientRect.y);
    if (rows.length === 0) {
      throw new Error(
        `Missing visible retained surface rows ${targetSurfaceId}.`,
      );
    }
    const row = rows[Math.floor(rows.length / 2)] ?? rows[0];
    return {
      x: Math.min(
        window.innerWidth - 4,
        Math.max(4, row.clientRect.x + row.clientRect.width * 0.65),
      ),
      y: Math.min(
        window.innerHeight - 4,
        Math.max(4, row.clientRect.y + row.clientRect.height / 2),
      ),
    };
  }, surfaceId);
}

export async function readRetainedRowClientY(
  page: Page,
  rowId: string,
): Promise<number | null> {
  return await page.evaluate((rowId) => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    return rows.find((row) => row.rowId === rowId)?.clientRect.y ?? null;
  }, rowId);
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
