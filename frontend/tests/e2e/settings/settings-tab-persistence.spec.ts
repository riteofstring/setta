import { expect, test, type Page } from "@playwright/test";
import type { ViewModeConfig } from "utils/generatedTypes";
import { sortViewModes } from "utils/viewModeOrdering";
import { ensureAppReady, postBackend } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

type ViewModeSwitchTarget = {
  viewModeId: string;
  viewModeName: string;
  sectionId: string;
  sectionName: string;
  paramId: string;
  paramName: string;
  currentValue: string;
};

type ViewModeRef = {
  viewModeId: string;
  viewModeName: string;
};

type SwitchRestoreEntry = {
  sectionId: string;
  paramId: string;
  value: string;
};

let restoreSnapshot:
  | { projectConfigId: string; entries: SwitchRestoreEntry[] }
  | null = null;

test.afterEach(async ({ page }) => {
  if (!restoreSnapshot || restoreSnapshot.entries.length === 0) {
    return;
  }
  await ensureAppReady(page);
  for (const entry of restoreSnapshot.entries) {
    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId: restoreSnapshot.projectConfigId,
      sectionId: entry.sectionId,
      paramInfoId: entry.paramId,
      value: entry.value,
    });
  }
  await postBackend(page, "/saveProject", {
    projectConfigId: restoreSnapshot.projectConfigId,
  });
  restoreSnapshot = null;
});

test("settings tabs persist changes across reloads", async ({ page }) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await ensureParamsEditable(page);

  const projectConfigId = await getProjectConfigId(page);
  const latestState = await getLatestProjectState(page, projectConfigId);
  const targets = getSwitchTargets(latestState);
  expect(targets.length).toBeGreaterThan(0);

  const restoreEntries = new Map<string, SwitchRestoreEntry>();
  for (const target of targets) {
    const key = `${target.sectionId}:${target.paramId}`;
    if (!restoreEntries.has(key)) {
      restoreEntries.set(key, {
        sectionId: target.sectionId,
        paramId: target.paramId,
        value: target.currentValue,
      });
    }
  }
  restoreSnapshot = {
    projectConfigId,
    entries: [...restoreEntries.values()],
  };

  for (const target of targets) {
    await openViewModeTab(page, {
      viewModeId: target.viewModeId,
      viewModeName: target.viewModeName,
    });
    await ensureParamsEditable(page);

    const nextValue = target.currentValue === "true" ? "false" : "true";
    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId,
      sectionId: target.sectionId,
      paramInfoId: target.paramId,
      value: nextValue,
    });
    await postBackend(page, "/saveProject", { projectConfigId });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openViewModeTab(page, {
      viewModeId: target.viewModeId,
      viewModeName: target.viewModeName,
    });

    await expect
      .poll(async () => {
        const reloadedState = await getLatestProjectState(
          page,
          projectConfigId,
        );
        return getParamValueById(
          reloadedState,
          target.sectionId,
          target.paramId,
        );
      })
      .toBe(nextValue);
  }
});

type ProjectStatePayload = {
  projectState: {
    projectConfig: {
      sectionVariantMap: Record<string, string>;
      viewModes: Record<string, ViewModeConfig>;
    };
    sections: Record<string, { name: string; sharedModifier?: Record<string, unknown> }>;
    sectionVariants: Record<string, { impl: string; modifier?: Record<string, unknown> }>;
    sectionImpls: Record<string, { type: string; codeObjVariantMap?: Record<string, string> }>;
    codeObjs: Record<
      string,
      { name: string; sharedModifier?: Record<string, unknown> }
    >;
    codeObjVariants: Record<
      string,
      { impl: string; modifier?: Record<string, unknown> }
    >;
    codeObjImpls: Record<string, { type: string; value?: string }>;
  };
};

function getSwitchTargets(payload: ProjectStatePayload): ViewModeSwitchTarget[] {
  const { projectState } = payload;
  const viewModes = sortViewModes(
    Object.values(projectState.projectConfig.viewModes).filter(
      (mode) => mode.isTab,
    ),
  );

  const targets: ViewModeSwitchTarget[] = [];

  for (const viewMode of viewModes) {
    const visibleSectionIds = Object.entries(viewMode.visibilityBySectionId)
      .filter(([, isVisible]) => isVisible)
      .map(([sectionId]) => sectionId);
    let match: ViewModeSwitchTarget | null = null;

    for (const sectionId of visibleSectionIds) {
      const variantId = projectState.projectConfig.sectionVariantMap[sectionId];
      if (!variantId) {
        continue;
      }
      const variant = projectState.sectionVariants[variantId];
      if (!variant) {
        continue;
      }
      const impl = projectState.sectionImpls[variant.impl];
      if (!impl || !impl.codeObjVariantMap) {
        continue;
      }
      for (const [paramId, codeVariantId] of Object.entries(
        impl.codeObjVariantMap,
      )) {
        const codeVariant = projectState.codeObjVariants[codeVariantId];
        if (!codeVariant) {
          continue;
        }
        const codeImpl = projectState.codeObjImpls[codeVariant.impl];
        if (!codeImpl) {
          continue;
        }
        if (codeImpl.type === "SwitchParam") {
          const sectionName = projectState.sections[sectionId]?.name ?? "";
          const paramName = projectState.codeObjs[paramId]?.name ?? "";
          const effectiveValue = getEffectiveValue(
            codeImpl,
            projectState.codeObjs[paramId],
            codeVariant,
          );
          match = {
            viewModeId: viewMode.id,
            viewModeName: viewMode.name,
            sectionId,
            sectionName,
            paramId,
            paramName,
            currentValue: effectiveValue ?? "false",
          };
          break;
        }
      }
      if (match) {
        break;
      }
    }

    if (!match) {
      throw new Error(`No switch param found for ${viewMode.name}`);
    }
    targets.push(match);
  }

  return targets;
}

function getParamValueById(
  payload: ProjectStatePayload,
  sectionId: string,
  paramId: string,
): string {
  const { projectState } = payload;
  const variantId = projectState.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    throw new Error(`Missing variant for section ${sectionId}.`);
  }
  const variant = projectState.sectionVariants[variantId];
  if (!variant) {
    throw new Error(`Missing variant data for section ${sectionId}.`);
  }
  const impl = projectState.sectionImpls[variant.impl];
  if (!impl || !impl.codeObjVariantMap) {
    throw new Error(`Missing impl for section ${sectionId}.`);
  }
  const codeVariantId = impl.codeObjVariantMap[paramId];
  if (!codeVariantId) {
    throw new Error(`Missing param ${paramId} in section ${sectionId}.`);
  }
  const codeVariant = projectState.codeObjVariants[codeVariantId];
  if (!codeVariant) {
    throw new Error(`Missing variant for param ${paramId}.`);
  }
  const codeImpl = projectState.codeObjImpls[codeVariant.impl];
  if (!codeImpl) {
    throw new Error(`Missing impl for param ${paramId}.`);
  }
  return (
    getEffectiveValue(codeImpl, projectState.codeObjs[paramId], codeVariant) ??
    "false"
  );
}

function getEffectiveValue(
  codeImpl: { value?: string },
  codeObj: { sharedModifier?: Record<string, unknown> } | undefined,
  variant: { modifier?: Record<string, unknown> } | undefined,
): string | undefined {
  const shared =
    codeObj && typeof codeObj.sharedModifier === "object"
      ? codeObj.sharedModifier
      : {};
  const modifier =
    variant && typeof variant.modifier === "object" ? variant.modifier : {};
  const effective = {
    ...codeImpl,
    ...shared,
    ...modifier,
  } as { value?: string };
  return effective.value;
}

async function getProjectConfigId(page: Page): Promise<string> {
  const response = await postBackend<{ projectConfig?: { id?: string } }>(
    page,
    "/loadProjectConfig",
    { projectConfigName: "settings" },
  );
  if (!response?.projectConfig?.id) {
    throw new Error("Missing projectConfig id for settings project.");
  }
  return response.projectConfig.id;
}

async function getLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<ProjectStatePayload> {
  const payload = await postBackend<ProjectStatePayload>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  if (!payload) {
    throw new Error("Missing project state payload.");
  }
  return payload;
}

async function openViewModeTab(
  page: Page,
  target: ViewModeRef,
): Promise<void> {
  const tab = page.getByRole("button", {
    name: target.viewModeName,
    exact: true,
  });
  await expect(tab).toBeVisible();
  await tab.click();
  await page.waitForFunction(async (viewModeId) => {
    const { useProjectState } = await import("/src/state/definitions");
    return (
      useProjectState.getState().projectConfig.activeViewModeId === viewModeId
    );
  }, target.viewModeId);
  const fitView = page.getByRole("button", { name: "fit view" });
  if (await fitView.isVisible()) {
    await fitView.click();
  }
}

async function ensureParamsEditable(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useMisc, useShareSession } = await import("/src/state/definitions");
    useMisc.setState({ isSelectingParams: false });
    useShareSession.setState({ isDeploymentMode: false, sharePolicy: null });
  });
}
