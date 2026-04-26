import { expect, test, type Page } from "@playwright/test";
import {
  addKwargFromFrontend,
  changeParamImplFromFrontend,
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  setCodeObjNameFromFrontend,
  setParamEnteredValueFromFrontend,
  setCallableFromFrontend,
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

    const beforeParamIds = await getSectionParamIds(page, sectionId);

    await addKwargFromFrontend(page, {
      projectConfigId,
      sectionId,
    });

    const afterParamIds = await getSectionParamIds(page, sectionId);
    const paramId = getNewParamId(beforeParamIds, afterParamIds);

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

    const paramRow = page.locator(`#ParamContainer-${sectionId}-${paramId}`);
    await expect(paramRow).toBeVisible();

    await page.reload();
    await expect(
      page.locator(`[id="${sectionId}-CustomResizable"]`),
    ).toBeVisible();
    await expect(paramRow).toBeVisible();

    const passwordInput = paramRow.locator('input[type="password"]');
    await expect(passwordInput).toHaveValue("");
    await expect(passwordInput).toHaveAttribute("placeholder", "Saved");

    const revealButton = paramRow.getByRole("button", {
      name: "Reveal",
    });
    await expect(revealButton).toBeVisible();
    // Dispatching the click avoids actionability blockers from aria-disabled ancestors.
    const revealResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/getPasswordParamValue"),
    );
    await revealButton.dispatchEvent("click");
    await revealResponsePromise;

    await expect(passwordInput).toHaveValue("topsecret");
    await expect(revealButton).toHaveCount(0);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function getSectionParamIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  const prefix = `ParamContainer-${sectionId}-`;
  return await page
    .locator(`[id^="${prefix}"]`)
    .evaluateAll(
      (nodes, idPrefix) =>
        nodes
          .map((node) => node.id)
          .filter((id) => id.startsWith(idPrefix))
          .map((id) => id.slice(idPrefix.length)),
      prefix,
    );
}

function getNewParamId(
  beforeIds: string[],
  afterIds: string[],
): string {
  const beforeIdSet = new Set(beforeIds);
  const newIds = afterIds.filter((id) => !beforeIdSet.has(id));
  if (newIds.length !== 1) {
    throw new Error(
      `Expected 1 new param id, found ${newIds.length}: ${newIds.join(", ")}`,
    );
  }
  return newIds[0];
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
