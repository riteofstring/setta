import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

const PROMPT_SECTION_BASE_NAME = "__pw_prompt__";

type CreateSectionResponse = {
  sectionId?: string;
};

type PromptTemplateResponse = {
  id: string;
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

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
    };
    sections?: Record<
      string,
      {
        sharedModifier?: Record<string, unknown>;
      }
    >;
    sectionVariants?: Record<
      string,
      {
        impl?: string;
        modifier?: Record<string, unknown>;
      }
    >;
    sectionImpls?: Record<
      string,
      {
        template?: string | null;
        renderedText?: string | null;
      }
    >;
  };
};

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

test.describe.serial("prompt section", () => {
  test("creates a prompt section with direct in-canvas editing", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message ?? String(err));
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionName = await resolveUniqueSectionName(
        page,
        PROMPT_SECTION_BASE_NAME,
      );
      const created = await postBackend<CreateSectionResponse>(
        page,
        "/createTopLevelSection",
        {
          projectConfigId: projectContext.projectConfigId,
          implType: "Prompt",
        },
      );
      if (!created?.sectionId) {
        throw new Error("Missing sectionId when creating prompt section.");
      }

      await postBackend(page, "/setSectionName", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: created.sectionId,
        name: sectionName,
      });

      const node = page.locator(
        `[data-testid="rf__node-${created.sectionId}"]`,
      );
      await expect(node).toBeVisible();
      await expect(
        node.locator("header.section-title").getByText(sectionName),
      ).toBeVisible();
      await expect(
        page.getByTestId(`prompt-template-editor-${created.sectionId}`),
      ).toBeVisible();
      await expect(
        page.getByTestId(`prompt-template-tab-${created.sectionId}`),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByTestId(`prompt-preview-tab-${created.sectionId}`),
      ).toBeVisible();

      await page.getByTestId(`prompt-preview-tab-${created.sectionId}`).click();
      await expect(
        page.getByTestId(`prompt-render-preview-${created.sectionId}`),
      ).toContainText("No prompt rendered yet.");

      await page
        .getByTestId(`prompt-template-tab-${created.sectionId}`)
        .click();
      const editorRoot = page.getByTestId(
        `prompt-template-editor-${created.sectionId}`,
      );
      await fillCodeMirror(editorRoot, page, "Hello there.");

      await expect
        .poll(
          async () =>
            await readPromptSectionState(
              page,
              projectContext.projectConfigId,
              created.sectionId,
            ),
          { timeout: 8000 },
        )
        .toMatchObject({
          template: "Hello there.",
          renderedText: "Hello there.",
        });

      await page.getByTestId(`prompt-preview-tab-${created.sectionId}`).click();
      await expect(
        page.getByTestId(`prompt-render-preview-${created.sectionId}`),
      ).toContainText("Hello there.");

      const linkedTemplate = await postBackend<PromptTemplateResponse>(
        page,
        "/createPromptTemplate",
        {
          name: "__pw_prompt_template__",
          description: "",
          template: "My name is {{ name }}. What's your name?",
          format: "Jinja",
          inputSchema: {},
          metadata: {},
        },
      );
      if (!linkedTemplate?.id) {
        throw new Error("Missing prompt template id.");
      }

      await postBackend(page, "/setPromptTemplateLink", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: created.sectionId,
        promptTemplateId: linkedTemplate.id,
      });

      await page
        .getByTestId(`prompt-template-tab-${created.sectionId}`)
        .click();
      await expect(
        page.getByTestId(`prompt-linked-template-note-${created.sectionId}`),
      ).toContainText("Linked to prompt template");

      await page.getByTestId(`prompt-preview-tab-${created.sectionId}`).click();
      const preview = page.getByTestId(
        `prompt-render-preview-${created.sectionId}`,
      );
      await expect(preview).toContainText(
        "My name is {{ name }}. What's your name?",
      );
      await expect(preview).not.toContainText("Missing variables:");

      const minHeightErrors = pageErrors.filter(
        (message) =>
          message.includes("getMinSectionHeight") ||
          message.includes("minHeight"),
      );
      expect(minHeightErrors).toEqual([]);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

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

async function readPromptSectionState(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{ template: string | null; renderedText: string | null }> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const projectState = response?.projectState;
  const sectionVariantId =
    projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  if (!sectionVariantId) {
    return {
      template: null,
      renderedText: null,
    };
  }
  const sectionImplId = projectState.sectionVariants?.[sectionVariantId]?.impl;
  if (!sectionImplId) {
    return {
      template: null,
      renderedText: null,
    };
  }
  const baseImpl = projectState.sectionImpls?.[sectionImplId] ?? null;
  const sharedModifier =
    projectState.sections?.[sectionId]?.sharedModifier ?? {};
  const variantModifier =
    projectState.sectionVariants?.[sectionVariantId]?.modifier ?? {};
  const effectiveImpl = {
    ...(baseImpl ?? {}),
    ...sharedModifier,
    ...variantModifier,
  };
  return {
    template:
      typeof effectiveImpl.template === "string"
        ? effectiveImpl.template
        : null,
    renderedText:
      typeof effectiveImpl.renderedText === "string"
        ? effectiveImpl.renderedText
        : null,
  };
}

async function readCodeMirrorValue(page: Page, id: string): Promise<string> {
  return await page.evaluate((editorId) => {
    const root = document.getElementById(editorId);
    if (!root) {
      return "";
    }
    const content =
      root.querySelector(".cm-content") ?? root.querySelector(".cm-line");
    return content?.textContent ?? "";
  }, id);
}

async function fillCodeMirror(editorRoot: Locator, page: Page, value: string) {
  await expect(editorRoot).toBeVisible();
  const editorId = await editorRoot.getAttribute("id");
  if (!editorId) {
    throw new Error("CodeMirror root is missing id.");
  }
  const contentEditable = editorRoot
    .locator("[contenteditable='true']")
    .first();
  await expect(contentEditable).toBeVisible();
  await contentEditable.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(value);
  await expect.poll(() => readCodeMirrorValue(page, editorId)).toContain(value);
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

async function openIsolatedProject(
  page: Page,
): Promise<IsolatedProjectContext> {
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
    .locator(
      'section[class*="card-section"] header.section-title p, section[class*="card-section"] header.section-title h2',
    )
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
