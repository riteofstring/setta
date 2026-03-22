import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  refreshProjectStateFromBackend,
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
    await refreshProjectStateFromBackend(page, projectConfigId);
    await expect(
      page.locator(`[id="${sectionId}-CustomResizable"]`),
    ).toBeVisible();

    const beforeParamIds = await getSectionParamIds(page, sectionId);

    await postBackend(page, "/addKwarg", {
      projectConfigId,
      sectionId,
    });
    await refreshProjectStateFromBackend(page, projectConfigId);

    const afterParamIds = await getSectionParamIds(page, sectionId);
    const paramId = getNewParamId(beforeParamIds, afterParamIds);

    await postBackend(page, "/setCodeObjName", {
      projectConfigId,
      codeObjId: paramId,
      name: "secret_value",
    });
    await postBackend(page, "/changeParamImpl", {
      projectConfigId,
      sectionId,
      paramInfoId: paramId,
      selectedId: "PasswordParam",
    });
    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId,
      sectionId,
      paramInfoId: paramId,
      value: "topsecret",
    });
    await refreshProjectStateFromBackend(page, projectConfigId);

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
  await postBackendWithRetries(page, "/setCallable", {
    projectConfigId,
    sectionId,
    callableName: TARGET_CALLABLE,
    refetchParams: false,
  });
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

async function postBackendWithRetries<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
  attempts = 8,
  delayMs = 500,
): Promise<T | null> {
  let lastStatus = 0;
  let lastText = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
      data: payload,
    });
    lastStatus = response.status();
    lastText = await response.text();
    if (response.ok()) {
      if (!lastText) {
        return null;
      }
      return JSON.parse(lastText) as T;
    }
    if (attempt < attempts - 1) {
      await page.waitForTimeout(delayMs);
    }
  }
  const detail = lastText ? ` ${lastText}` : "";
  throw new Error(
    `Backend request failed (${lastStatus}): ${path}${detail}`,
  );
}
