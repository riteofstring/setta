import { expect, test, type Page } from "@playwright/test";
import {
  addKwargFromFrontend,
  changeParamImplFromFrontend,
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  setCallableFromFrontend,
  setCodeObjNameFromFrontend,
  setParamEnteredValueFromFrontend,
} from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const TARGET_CALLABLE = "math.sqrt";

test("password param reveals saved secret on demand", async ({ page }) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const sectionId = await createCallableSection(page, projectConfigId);

  try {
    await setCallable(page, projectConfigId, sectionId);
    await expect(
      page.locator(`[id="${sectionId}-CustomResizable"]`),
    ).toBeVisible();

    const beforeParamIds = await readShownParamIds(page, sectionId);

    await addKwargFromFrontend(page, {
      projectConfigId,
      sectionId,
    });

    const paramId = await waitForNewParamId(page, sectionId, beforeParamIds);

    await setCodeObjNameFromFrontend(page, {
      projectConfigId,
      codeObjId: paramId,
      name: "secret_value",
    });
    await changeParamImplFromFrontend(page, {
      projectConfigId,
      sectionId,
      paramInfoId: paramId,
      selectedId: "PasswordParam",
    });
    await setParamEnteredValueFromFrontend(page, {
      projectConfigId,
      sectionId,
      paramInfoId: paramId,
      value: "topsecret",
    });

    await expect
      .poll(
        async () => await readPasswordParamControl(page, sectionId, paramId),
        { timeout: 20000 },
      )
      .toMatchObject({
        hasSecret: true,
        placeholder: "Saved",
        revealAvailable: true,
      });

    await page.reload();
    await expect(
      page.locator(`[id="${sectionId}-CustomResizable"]`),
    ).toBeVisible();

    await expect
      .poll(
        async () => await readPasswordParamControl(page, sectionId, paramId),
        { timeout: 20000 },
      )
      .toMatchObject({
        hasSecret: true,
        placeholder: "Saved",
        revealAvailable: true,
      });

    let revealRequestCount = 0;
    const onRequest = (request: import("@playwright/test").Request) => {
      if (request.url().includes("/api/getPasswordParamValue")) {
        revealRequestCount += 1;
      }
    };
    page.on("request", onRequest);
    const revealResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/getPasswordParamValue"),
    );
    const revealPoint = await resolveRetainedPasswordRevealClickPoint(
      page,
      sectionId,
      paramId,
    );
    await page.mouse.click(revealPoint.x, revealPoint.y);
    const revealResponse = await revealResponsePromise;

    expect(revealResponse.ok()).toBeTruthy();
    await expect(await revealResponse.json()).toMatchObject({
      value: "topsecret",
    });
    await expect.poll(() => revealRequestCount).toBe(1);

    await page.waitForTimeout(100);
    await page.mouse.click(revealPoint.x, revealPoint.y);
    await page.waitForTimeout(300);
    expect(revealRequestCount).toBe(1);
    page.off("request", onRequest);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function readShownParamIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  return await page.evaluate(async (targetSectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const state = useProjectState.getState();
    const variantId = state.projectConfig.sectionVariantMap[targetSectionId];
    const shown = variantId ? state.shownParamIds[variantId] : null;
    return [
      ...(shown?.pinned.topLevelParamIds ?? []),
      ...(shown?.unpinned.topLevelParamIds ?? []),
    ];
  }, sectionId);
}

async function waitForNewParamId(
  page: Page,
  sectionId: string,
  beforeIds: string[],
): Promise<string> {
  const beforeIdSet = new Set(beforeIds);
  await expect
    .poll(async () => {
      const afterIds = await readShownParamIds(page, sectionId);
      return afterIds.filter((id) => !beforeIdSet.has(id));
    })
    .toHaveLength(1);
  const afterIds = await readShownParamIds(page, sectionId);
  const newIds = afterIds.filter((id) => !beforeIdSet.has(id));
  if (newIds.length !== 1) {
    throw new Error(
      `Expected 1 new param id, found ${newIds.length}: ${newIds.join(", ")}`,
    );
  }
  return newIds[0];
}

async function readPasswordParamControl(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<{
  hasSecret: boolean;
  placeholder: string;
  revealAvailable: boolean;
} | null> {
  return await page.evaluate(
    async ({ targetParamInfoId, targetSectionId }) => {
      const { useLocalStorage, useProjectState } = await import(
        "/src/state/definitions.ts"
      );
      const { getProjectGpuFlowScene } = await import(
        "/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts"
      );
      const scene = getProjectGpuFlowScene(useProjectState.getState(), {
        darkMode: useLocalStorage.getState().darkMode,
      });
      for (const surface of scene.contentSurfaces) {
        if (surface.ownerSectionId !== targetSectionId) {
          continue;
        }
        const row = surface.retainedScene?.rows.find(
          (candidate) => candidate.id === targetParamInfoId,
        );
        if (row?.control?.kind !== "password") {
          continue;
        }
        return {
          hasSecret: row.control.hasSecret,
          placeholder: row.control.placeholder,
          revealAvailable: row.control.revealAvailable,
        };
      }
      return null;
    },
    { targetParamInfoId: paramInfoId, targetSectionId: sectionId },
  );
}

async function resolveRetainedPasswordRevealClickPoint(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<{ x: number; y: number }> {
  return await page.evaluate(
    async ({ targetParamInfoId, targetSectionId }) => {
      const { useLocalStorage, useProjectState } = await import(
        "/src/state/definitions.ts"
      );
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
        darkMode: useLocalStorage.getState().darkMode,
      });
      for (const surface of scene.contentSurfaces) {
        if (surface.ownerSectionId !== targetSectionId) {
          continue;
        }
        const hit = surface.retainedScene?.hitRecords.find(
          (candidate) =>
            candidate.kind === "control-subpart" &&
            candidate.subpartKind === "password-reveal" &&
            candidate.ownerRowId === targetParamInfoId,
        );
        if (!hit) {
          continue;
        }
        const pane =
          document
            .querySelector(
              `[data-testid="gpu-retained-content-source-${surface.id}"]`,
            )
            ?.closest(".setta-gpu-flow__pane") ??
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
            `Resolved retained password reveal point is not on the GPU pane: ${JSON.stringify(
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
        `Missing retained password reveal hit for ${targetSectionId}:${targetParamInfoId}.`,
      );
    },
    { targetParamInfoId: paramInfoId, targetSectionId: sectionId },
  );
}

async function setCallable(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await setCallableFromFrontend(page, {
        projectConfigId,
        sectionId,
        callableName: TARGET_CALLABLE,
        refetchParams: false,
      });
      return;
    } catch (error) {
      if (attempt === 7) {
        throw error;
      }
      await page.waitForTimeout(500);
    }
  }
}

async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}
