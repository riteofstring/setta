import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  setCallableFromFrontend,
} from "../helpers";

const TEXT_FIELD_CALLABLE_NAME = "open";

test("callable params render after set_callable", async ({ page }) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const sectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
    { position: { x: 520, y: 160 } },
  );

  try {
    const setCallableResponse = await setCallableFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      callableName: TEXT_FIELD_CALLABLE_NAME,
      refetchParams: true,
    });
    await expect(setCallableResponse).toMatchObject({ lspStatus: "matched" });

    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();

    await waitForFirstParamInfoId(
      page,
      projectContext.projectConfigId,
      sectionId,
    );

    await expect
      .poll(
        async () =>
          (await readRetainedParamSurfaceGeometry(page, sectionId))?.rowCount ??
          0,
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    await expect
      .poll(async () =>
        Math.round(
          (await readRetainedParamSurfaceGeometry(page, sectionId))?.width ?? 0,
        ),
      )
      .toBeGreaterThan(20);
    await expect
      .poll(async () =>
        Math.round(
          (await readRetainedParamSurfaceGeometry(page, sectionId))?.height ??
            0,
        ),
      )
      .toBeGreaterThan(10);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("retained callable text params use live CodeMirror DOM while typing", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const sectionId = await createCallableSection(
    page,
    projectContext.projectConfigId,
    { position: { x: 520, y: 160 } },
  );

  try {
    const setCallableResponse = await setCallableFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      callableName: TEXT_FIELD_CALLABLE_NAME,
      refetchParams: true,
    });
    await expect(setCallableResponse).toMatchObject({ lspStatus: "matched" });

    const paramInfoId = await waitForFirstParamInfoId(
      page,
      projectContext.projectConfigId,
      sectionId,
    );

    await expect
      .poll(
        async () =>
          (await readRetainedParamSurfaceGeometry(page, sectionId))?.rowCount ??
          0,
        { timeout: 20000 },
      )
      .toBeGreaterThan(0);
    const island = await activateRetainedParamCodeMirror(
      page,
      sectionId,
      paramInfoId,
    );
    const editorRoot = island.locator(
      `[id="CodeMirror-${sectionId}-${paramInfoId}"]`,
    );
    const editorContent = editorRoot.locator(".cm-content").first();
    await expect(editorContent).toBeVisible();

    const typedValue = '"README.md"';
    await expect
      .poll(() => readActiveRetainedDomControlRowId(page))
      .toBe(paramInfoId);
    await page.keyboard.press(
      process.platform === "darwin" ? "Meta+A" : "Control+A",
    );
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(typedValue);

    await expect
      .poll(() => readCodeMirrorValue(page, editorRoot))
      .toBe(typedValue);
    await expect
      .poll(() => readActiveRetainedDomControlRowId(page))
      .toBe(paramInfoId);
    await expect(island).toHaveAttribute(
      "data-gpu-flow-dom-control-active",
      "true",
    );
    await expect(island).toHaveAttribute(
      "data-gpu-flow-dom-control-row-id",
      paramInfoId,
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function readActiveRetainedDomControlRowId(
  page: Page,
): Promise<string | null> {
  return await page.evaluate(() => {
    const active = document.activeElement;
    const activeHost =
      active instanceof HTMLElement
        ? active.closest("[data-gpu-flow-dom-control='true']")
        : null;
    const activeHostRowId = activeHost?.getAttribute(
      "data-gpu-flow-dom-control-row-id",
    );
    if (activeHostRowId) {
      return activeHostRowId;
    }

    const retainedHosts = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-gpu-flow-dom-control='true'][data-gpu-flow-dom-control-active='true']",
      ),
    ];
    const focusedHost = retainedHosts.find((host) =>
      active instanceof HTMLElement ? host.contains(active) : false,
    );
    return (
      (
        focusedHost ?? (retainedHosts.length === 1 ? retainedHosts[0] : null)
      )?.getAttribute("data-gpu-flow-dom-control-row-id") ?? null
    );
  });
}

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl: string }>;
    sectionImpls?: Record<
      string,
      {
        codeObjVariantMap?: Record<string, string>;
      }
    >;
    shownParamIds?: Record<
      string,
      {
        pinned?: {
          topLevelParamIds?: string[];
        };
        unpinned?: {
          topLevelParamIds?: string[];
        };
      }
    >;
  } | null;
};

async function loadLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<LatestProjectStateResponse> {
  return (
    (await postBackend<LatestProjectStateResponse>(
      page,
      "/getLatestProjectState",
      {
        projectConfigId,
      },
    )) ?? {}
  );
}

async function waitForFirstParamInfoId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  for (let index = 0; index < 80; index += 1) {
    const latest = await loadLatestProjectState(page, projectConfigId);
    const paramInfoId = getFirstParamInfoId(latest, sectionId);
    if (paramInfoId) {
      return paramInfoId;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(`Timed out waiting for params in section ${sectionId}.`);
}

function getFirstParamInfoId(
  latest: LatestProjectStateResponse,
  sectionId: string,
): string | null {
  const variantId =
    latest.projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  if (!variantId) {
    return null;
  }
  const implId = latest.projectState?.sectionVariants?.[variantId]?.impl;
  if (!implId) {
    return null;
  }
  const shown = latest.projectState?.shownParamIds?.[variantId];
  const visibleParamId =
    shown?.unpinned?.topLevelParamIds?.[0] ??
    shown?.pinned?.topLevelParamIds?.[0];
  if (visibleParamId) {
    return visibleParamId;
  }
  const impl = latest.projectState?.sectionImpls?.[implId];
  return Object.keys(impl?.codeObjVariantMap ?? {})[0] ?? null;
}

async function activateRetainedParamCodeMirror(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<Locator> {
  const island = page.locator(
    [
      '[data-gpu-flow-dom-control="true"]',
      '[data-gpu-flow-dom-control-active="true"]',
      `[data-gpu-flow-dom-control-surface-id="${cssAttributeEscape(
        `${sectionId}:param-content:unpinned`,
      )}"]`,
      `[data-gpu-flow-dom-control-row-id="${cssAttributeEscape(paramInfoId)}"]`,
    ].join(""),
  );
  const point = await resolveRetainedParamControlClickPoint(
    page,
    sectionId,
    paramInfoId,
  );
  await page.mouse.click(point.x, point.y);
  await expect(island).toBeVisible({ timeout: 10000 });
  return island;
}

function cssAttributeEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

async function readRetainedParamSurfaceGeometry(
  page: Page,
  sectionId: string,
): Promise<{
  readonly height: number;
  readonly rowCount: number;
  readonly width: number;
} | null> {
  return await page.evaluate((surfaceId) => {
    const rows = (
      window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
    ).filter((row) => row.surfaceId === surfaceId);
    if (rows.length === 0) {
      return null;
    }
    const left = Math.min(...rows.map((row) => row.clientRect.x));
    const top = Math.min(...rows.map((row) => row.clientRect.y));
    const right = Math.max(
      ...rows.map((row) => row.clientRect.x + row.clientRect.width),
    );
    const bottom = Math.max(
      ...rows.map((row) => row.clientRect.y + row.clientRect.height),
    );
    return {
      height: bottom - top,
      rowCount: rows.length,
      width: right - left,
    };
  }, `${sectionId}:param-content:unpinned`);
}

async function resolveRetainedParamControlClickPoint(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<{ x: number; y: number }> {
  return await page.evaluate(
    async ({ sectionId: targetSectionId, paramInfoId: targetParamInfoId }) => {
      const { useProjectState } = await import("/src/state/definitions.ts");
      const { getProjectGpuFlowScene } = await import(
        "/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts"
      );
      const { gpuFlowViewportStore } = await import(
        "/src/gpuFlow/viewportStore.ts"
      );
      const { flowToScreenPosition } = await import(
        "/src/gpuFlow/viewportMath.ts"
      );
      const scene = getProjectGpuFlowScene(useProjectState.getState(), {
        darkMode: false,
      });
      for (const surface of scene.contentSurfaces) {
        const retainedScene = surface.retainedScene;
        if (!retainedScene || surface.ownerSectionId !== targetSectionId) {
          continue;
        }
        const hit = retainedScene.hitRecords.find(
          (candidate) =>
            candidate.kind === "control" &&
            candidate.ownerRowId === targetParamInfoId,
        );
        if (!hit) {
          continue;
        }
        const source = document.querySelector(
          `[data-testid="gpu-retained-content-source-${surface.id}"]`,
        );
        const pane =
          source?.closest(".setta-gpu-flow__pane") ??
          document.querySelector(".setta-gpu-flow__pane");
        if (!(pane instanceof HTMLElement)) {
          throw new Error("Missing GPU flow pane.");
        }
        const flowPoint = {
          x: surface.rect.x + hit.rect.x + hit.rect.width / 2,
          y: surface.rect.y + hit.rect.y + hit.rect.height / 2,
        };
        const resolvePoint = () => {
          const paneRect = pane.getBoundingClientRect();
          const screenPoint = flowToScreenPosition(
            flowPoint,
            gpuFlowViewportStore.getState().transform,
          );
          return {
            x: paneRect.left + screenPoint.x,
            y: paneRect.top + screenPoint.y,
          };
        };
        let point = resolvePoint();
        if (!isElementInsidePane(document.elementFromPoint(point.x, point.y))) {
          const paneRect = pane.getBoundingClientRect();
          const zoom = 1;
          gpuFlowViewportStore
            .getState()
            .setTransform([
              paneRect.width / 2 - flowPoint.x * zoom,
              paneRect.height / 2 - flowPoint.y * zoom,
              zoom,
            ]);
          await new Promise((resolve) => setTimeout(resolve, 50));
          point = resolvePoint();
        }
        const target = document.elementFromPoint(point.x, point.y);
        if (!isElementInsidePane(target)) {
          throw new Error(
            `Resolved retained control point is not on the GPU pane: ${JSON.stringify(
              {
                point,
                target:
                  target instanceof Element
                    ? {
                        className: String(target.className),
                        tagName: target.tagName,
                      }
                    : null,
              },
            )}`,
          );
        }
        return point;

        function isElementInsidePane(
          target: Element | null,
        ): target is Element {
          return Boolean(target && (target === pane || pane.contains(target)));
        }
      }
      throw new Error(
        `Missing retained control hit for ${targetSectionId}:${targetParamInfoId}.`,
      );
    },
    { paramInfoId, sectionId },
  );
}

async function readCodeMirrorValue(
  page: Page,
  editorRoot: Locator,
): Promise<string> {
  const handle = await editorRoot.elementHandle();
  if (!handle) {
    return "";
  }
  return await page.evaluate((root) => {
    const content =
      root.querySelector(".cm-content") ?? root.querySelector(".cm-line");
    return content?.textContent ?? root.textContent ?? "";
  }, handle);
}
