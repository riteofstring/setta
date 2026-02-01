import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

type EngineConfig = {
  id: string;
  name: string;
  engineType: string;
  settaLlmConfigId?: string | null;
};

type AllLLMConfigs = {
  configs?: Record<string, { model: string }>;
  mcpServers?: Record<string, unknown>;
  defaultMcpServerIds?: string[];
  default_config_id?: string | null;
};

type CreateSectionResponse = {
  sectionId?: string;
};


type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type IsolatedProjectContext = {
  projectConfigId: string;
  defaultProjectConfigId: string | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ATTACHMENT_FIXTURES_DIR = path.join(
  __dirname,
  "..",
  "fixtures",
  "attachments",
);

test.describe.serial("chat attachments", () => {
  test("project chat attachments via picker", async ({ page }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    const initialConfig = await getBackend<AllLLMConfigs>(
      page,
      "/llm/config",
    );
    if (!initialConfig) {
      throw new Error("Missing LLM config payload.");
    }
    let createdLlmConfigId: string | null = null;
    let didUpdateLlmConfig = false;
    const existingConfigs = initialConfig.configs ?? {};
    let llmConfigId =
      Object.entries(existingConfigs).find(
        ([, config]) => !config.api_key_env,
      )?.[0] ?? null;
    if (!llmConfigId) {
      llmConfigId = "e2e-llm";
      const updated: AllLLMConfigs = {
        ...initialConfig,
        configs: {
          ...existingConfigs,
          [llmConfigId]: { model: "gpt-test" },
        },
        default_config_id: llmConfigId,
      };
      await postBackend(page, "/llm/config", updated as Record<string, unknown>);
      createdLlmConfigId = llmConfigId;
      didUpdateLlmConfig = true;
    }

    let createdEngineConfigId: string | null = null;
    let updatedEngineConfig: EngineConfig | null = null;
    const engineConfigs = await getBackend<EngineConfig[]>(
      page,
      "/getEngineConfigs",
    );
    const existingEngine =
      engineConfigs?.find((config) => config.engineType === "setta_llm") ??
      null;
    if (!existingEngine) {
      const created = await postBackend<EngineConfig>(
        page,
        "/createEngineConfig",
        {
          name: "E2E Engine",
          engineType: "setta_llm",
          settaLlmConfigId: llmConfigId,
          defaults: {},
        },
      );
      if (!created?.id) {
        throw new Error("Missing engine config id.");
      }
      createdEngineConfigId = created.id;
    } else if (existingEngine.settaLlmConfigId !== llmConfigId) {
      const updated = await postBackend<EngineConfig>(
        page,
        "/updateEngineConfig",
        {
          config: {
            ...existingEngine,
            settaLlmConfigId: llmConfigId,
          },
        },
      );
      if (!updated?.id) {
        throw new Error("Failed to update engine config.");
      }
      updatedEngineConfig = existingEngine;
    }

    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    try {
      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const input = overviewPane.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();

      const fileInput = overviewPane.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Hello from project chat."),
      });

      await expect(overviewPane.getByText("notes.txt")).toBeVisible();

      await input.fill("Here is a file.");
      await input.press("Enter");

      const attachmentButton = overviewPane
        .getByRole("button", { name: "notes.txt" })
        .first();
      await expect(attachmentButton).toBeVisible();
      await attachmentButton.click();

      const modal = page.getByRole("dialog", {
        name: "Attachment preview",
      });
      await expect(modal).toBeVisible();
      await expect(modal.locator("pre")).toContainText(
        "Hello from project chat.",
      );
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    } finally {
      if (createdEngineConfigId) {
        await postBackend(page, "/deleteEngineConfig", {
          configId: createdEngineConfigId,
        });
      }
      if (updatedEngineConfig) {
        await postBackend(page, "/updateEngineConfig", {
          config: updatedEngineConfig,
        });
      }
      if (createdLlmConfigId || didUpdateLlmConfig) {
        await postBackend(
          page,
          "/llm/config",
          initialConfig as Record<string, unknown>,
        );
      }
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section drag-and-drop attachments", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const chatSection = await ensureChatSection(page, "__pw_chat_drop__");
      const input = chatSection.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();

      const dropTarget = input.locator("..");
      await dropFiles(dropTarget, [
        {
          name: "drop.txt",
          mimeType: "text/plain",
          data: Buffer.from("Dropped attachment").toString("base64"),
        },
      ]);

      await expect(chatSection.getByText("drop.txt")).toBeVisible();

      await input.fill("Dropped file");
      await input.press("Enter");

      const attachmentButton = chatSection
        .getByRole("button", { name: "drop.txt" })
        .first();
      await expect(attachmentButton).toBeVisible();
      await attachmentButton.click();

      const modal = page.getByRole("dialog", {
        name: "Attachment preview",
      });
      await expect(modal).toBeVisible();
      await expect(modal.locator("pre")).toContainText("Dropped attachment");
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section attachment remove and clear", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const chatSection = await ensureChatSection(page, "__pw_chat_clear__");
      const input = chatSection.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();

      const fileInput = chatSection.locator('input[type="file"]').first();
      await fileInput.setInputFiles([
        {
          name: "first.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("first"),
        },
        {
          name: "second.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("second"),
        },
      ]);

      const inputContainer = input.locator("..");
      await expect(inputContainer.getByText("first.txt")).toBeVisible();
      await expect(inputContainer.getByText("second.txt")).toBeVisible();

      await inputContainer.getByRole("button", { name: "Clear all" }).click();
      await expect(inputContainer.getByText("first.txt")).toHaveCount(0);
      await expect(inputContainer.getByText("second.txt")).toHaveCount(0);

      await fileInput.setInputFiles({
        name: "third.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("third"),
      });
      await expect(inputContainer.getByText("third.txt")).toBeVisible();
      const thirdLabel = inputContainer.getByText("third.txt");
      const thirdPill = thirdLabel.locator("..");
      await thirdPill.locator("button").first().click();
      await expect(inputContainer.getByText("third.txt")).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section attachment size limit warning", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const chatSection = await ensureChatSection(page, "__pw_chat_limit__");
      const input = chatSection.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();

      const fileInput = chatSection.locator('input[type="file"]').first();
      const oversized = Buffer.alloc(25 * 1024 * 1024 + 1, "a");
      await fileInput.setInputFiles({
        name: "oversized.txt",
        mimeType: "text/plain",
        buffer: oversized,
      });

      await expect(chatSection.getByText(/File exceeds/i)).toBeVisible();
      const inputContainer = input.locator("..");
      await expect(inputContainer.getByText("oversized.txt")).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat attachment preview supports common file types", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const chatSection = await ensureChatSection(page, "__pw_chat_preview__");
      const input = chatSection.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();

      const fileInput = chatSection.locator('input[type="file"]').first();
      await fileInput.setInputFiles([
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_pdf.pdf"),
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_audio.mp3"),
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_video.mp4"),
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_text.txt"),
        path.join(ATTACHMENT_FIXTURES_DIR, "sample_image.jpg"),
      ]);

      await expect(chatSection.getByText("sample_pdf.pdf")).toBeVisible();
      await expect(chatSection.getByText("sample_audio.mp3")).toBeVisible();
      await expect(chatSection.getByText("sample_video.mp4")).toBeVisible();
      await expect(chatSection.getByText("sample_text.txt")).toBeVisible();
      await expect(chatSection.getByText("sample_image.jpg")).toBeVisible();

      await input.fill("Preview types");
      await input.press("Enter");

      await chatSection.getByText("sample_pdf.pdf").first().click();

      const modal = page.getByRole("dialog", {
        name: "Attachment preview",
      });
      await expect(modal).toBeVisible();
      await expect(modal.locator("iframe")).toBeVisible();

      await modal.getByRole("button", { name: "sample_audio.mp3" }).click();
      await expect(modal.locator("audio")).toBeVisible();

      await modal.getByRole("button", { name: "sample_video.mp4" }).click();
      await expect(modal.locator("video")).toBeVisible();

      await modal.getByRole("button", { name: "sample_text.txt" }).click();
      await expect(modal.locator("pre")).toBeVisible();

      await modal.getByRole("button", { name: "sample_image.jpg" }).click();
      await expect(modal.locator("img.object-contain")).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function setOverviewTab(page: Page, tabName: string): Promise<void> {
  await page.addInitScript((tab) => {
    const key = "setta_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          payload = {
            state:
              typeof parsed.state === "object" && parsed.state
                ? parsed.state
                : {},
            version: typeof parsed.version === "number" ? parsed.version : 0,
          };
        }
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, overviewTab: tab, overviewVis: true };
    localStorage.setItem(key, JSON.stringify(payload));
  }, tabName);
}

async function ensureAppReady(page: Page): Promise<void> {
  await page.goto(PROJECT_URL);
  if (await isAppReady(page)) {
    return;
  }
  if (!BOOTSTRAP_TOKEN) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
    );
  }
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`);
  await page.waitForURL(PROJECT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(".react-flow__pane", { timeout: 10000 });
    return true;
  } catch {
    return false;
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

async function getBackend<T>(page: Page, path: string): Promise<T | null> {
  const response = await page.request.get(`${BACKEND_ORIGIN}/api${path}`);
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

async function openIsolatedProject(page: Page): Promise<IsolatedProjectContext> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const name = await postBackend<string>(page, "/createProjectConfig", {
    previewImgColor: "bg-blue-500/60",
  });
  if (!name) {
    throw new Error("Missing project config name.");
  }
  const url = new URL(name, BASE_URL).toString();
  await page.goto(url);
  await page.waitForSelector(".react-flow__pane");
  const projectConfigId = await getCurrentProjectConfigId(page);
  return {
    projectConfigId,
    defaultProjectConfigId: metadata.defaultProjectConfigId ?? null,
  };
}

async function cleanupIsolatedProject(
  page: Page,
  context: IsolatedProjectContext | null,
): Promise<void> {
  if (!context) {
    return;
  }
  if (
    context.defaultProjectConfigId &&
    context.defaultProjectConfigId !== context.projectConfigId
  ) {
    await postBackend(page, "/setAsDefaultProject", {
      projectConfigId: context.defaultProjectConfigId,
    });
  }
  await postBackend(page, "/deleteProjectConfigs", {
    ids: [context.projectConfigId],
  });
}

async function resolveUniqueSectionName(
  page: Page,
  baseName: string,
): Promise<string> {
  const titles = await page
    .locator('section[class*="card-section"] header.section-title p')
    .allTextContents();
  const existingTitles = new Set(
    titles.map((title) => title.trim()).filter(Boolean),
  );
  if (!existingTitles.has(baseName)) {
    return baseName;
  }
  for (let i = 1; i <= 5; i += 1) {
    const candidate = `${baseName}-${i}`;
    if (!existingTitles.has(candidate)) {
      return candidate;
    }
  }
  return `${baseName}-${Date.now()}`;
}

function findSectionCandidates(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}

async function ensureChatSection(
  page: Page,
  baseName: string,
): Promise<Locator> {
  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionName = await resolveUniqueSectionName(page, baseName);
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chat",
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating chat section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId: created.sectionId,
    name: sectionName,
  });
  const section = findSectionCandidates(page, sectionName).first();
  await expect(section).toBeVisible();
  return section;
}

async function dropFiles(
  target: Locator,
  files: Array<{ name: string; mimeType: string; data: string }>,
): Promise<void> {
  const page = target.page();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  for (const file of files) {
    await dataTransfer.evaluate((dt, payload) => {
      const binary = atob(payload.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: payload.mimeType });
      const fileObj = new File([blob], payload.name, { type: payload.mimeType });
      dt.items.add(fileObj);
    }, file);
  }
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
}
