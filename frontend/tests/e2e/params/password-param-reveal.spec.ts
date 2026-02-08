import { expect, test, type Page } from "@playwright/test";

import { ensureAppReady } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const AUTH_COOKIE_NAME = process.env.SETTA_AUTH_COOKIE_NAME ?? "setta_auth";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const TARGET_CALLABLE = "math.sqrt";
const READY_SELECTOR = ".react-flow__pane";

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type ProjectStateResponse = {
  projectState: {
    codeObjs: Record<string, unknown>;
  };
};

test("password param reveals saved secret on demand", async ({ page }) => {
  await ensureAppReady(page);
  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await createCallableSection(page, projectConfigId);

  try {
    await setCallable(page, projectConfigId, sectionId);
    await expect(
      page.locator(`[id="${sectionId}-CustomResizable"]`),
    ).toBeVisible();

    const beforeState = await loadProjectState(page, projectConfigId);
    const beforeIds = new Set(Object.keys(beforeState.codeObjs));

    await postBackend(page, "/addKwarg", {
      projectConfigId,
      sectionId,
    });

    const afterState = await loadProjectState(page, projectConfigId);
    const paramId = getNewCodeObjId(beforeIds, Object.keys(afterState.codeObjs));

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
  }
});

async function createCallableSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Callable",
    },
  );
  if (!response?.sectionId) {
    throw new Error("Missing sectionId when creating callable section.");
  }
  return response.sectionId;
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

async function loadProjectState(
  page: Page,
  projectConfigId: string,
): Promise<ProjectStateResponse["projectState"]> {
  const response = await postBackend<ProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  if (!response?.projectState) {
    throw new Error("Missing project state response.");
  }
  return response.projectState;
}

function getNewCodeObjId(
  beforeIds: Set<string>,
  afterIds: string[],
): string {
  const newIds = afterIds.filter((id) => !beforeIds.has(id));
  if (newIds.length !== 1) {
    throw new Error(
      `Expected 1 new code obj id, found ${newIds.length}: ${newIds.join(", ")}`,
    );
  }
  return newIds[0];
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

async function getCurrentProjectConfigId(page: Page): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }

  const currentPath = new URL(page.url()).pathname;
  const projectName = currentPath.split("/").filter(Boolean)[0];
  if (projectName) {
    const match = metadata.projectMetadata.find((p) => p.name === projectName);
    if (match?.id) {
      return match.id;
    }
  }

  if (metadata.defaultProjectConfigId) {
    return metadata.defaultProjectConfigId;
  }

  throw new Error("Unable to resolve projectConfigId for test.");
}
