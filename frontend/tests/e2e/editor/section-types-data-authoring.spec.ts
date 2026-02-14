import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl: string }>;
    sectionImpls?: Record<
      string,
      {
        type: string;
        codeObjVariantMap?: Record<string, string>;
        allowUnquotedStringArgs?: boolean;
        defaultChildSectionType?: string;
      }
    >;
    parentSectionMap?: Record<string, string | null>;
  };
};

async function getLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<LatestProjectStateResponse> {
  return (
    (await postBackend<LatestProjectStateResponse>(page, "/getLatestProjectState", {
      projectConfigId,
    })) ?? {}
  );
}

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: string,
): Promise<string> {
  const res = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
    },
  );
  const sectionId = res?.sectionId;
  if (!sectionId) {
    throw new Error(`Failed to create ${implType} section.`);
  }
  return sectionId;
}

test.describe.serial("section types data authoring", () => {
  test("text block master font slider scales markdown typography", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_textblock_font__",
      );
      await postBackend(page, "/setTextBlockText", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        text: "# Heading\n\nBody text",
      });
      await postBackend(page, "/setTextBlockFormat", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        format: "Markdown",
      });
      await postBackend(page, "/setTextBlockDisplayMode", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        textDisplayMode: "Render",
      });

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const heading = node.locator("h1").first();
      const body = node.locator("p").first();
      await expect(heading).toBeVisible();
      await expect(body).toBeVisible();

      const before = await node.evaluate((el) => {
        const h1 = el.querySelector("h1");
        const p = el.querySelector("p");
        if (!(h1 instanceof HTMLElement) || !(p instanceof HTMLElement)) {
          throw new Error("Missing markdown heading/body nodes.");
        }
        return {
          h1: parseFloat(window.getComputedStyle(h1).fontSize),
          p: parseFloat(window.getComputedStyle(p).fontSize),
        };
      });

      const uiEditorPane = page.locator("#UiEditorPane");
      const masterFontCard = uiEditorPane
        .locator("div")
        .filter({ hasText: "Master Font Size" })
        .first();
      await expect(masterFontCard).toBeVisible();

      const slider = masterFontCard.locator('input[type="range"]').first();
      await slider.evaluate((el: HTMLInputElement) => {
        const input = el;
        const descriptor = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        );
        descriptor?.set?.call(input, "24");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await expect.poll(async () => await slider.inputValue()).toBe("24");

      await expect
        .poll(async () => {
          return await node.evaluate((el) => {
            const h1 = el.querySelector("h1");
            const p = el.querySelector("p");
            if (!(h1 instanceof HTMLElement) || !(p instanceof HTMLElement)) {
              return { h1: 0, p: 0 };
            }
            return {
              h1: parseFloat(window.getComputedStyle(h1).fontSize),
              p: parseFloat(window.getComputedStyle(p).fontSize),
            };
          });
        })
        .toEqual(
          expect.objectContaining({
            h1: expect.any(Number),
            p: expect.any(Number),
          }),
        );

      const after = await node.evaluate((el) => {
        const h1 = el.querySelector("h1");
        const p = el.querySelector("p");
        if (!(h1 instanceof HTMLElement) || !(p instanceof HTMLElement)) {
          throw new Error("Missing markdown heading/body nodes.");
        }
        return {
          h1: parseFloat(window.getComputedStyle(h1).fontSize),
          p: parseFloat(window.getComputedStyle(p).fontSize),
        };
      });

      expect(after.h1).toBeGreaterThan(before.h1);
      expect(after.p).toBeGreaterThan(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("list root default child type drives incrementer-created child kind", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { ListRoot: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "ListRoot",
      );
      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      const defaultChildCard = uiEditorPane
        .locator("div")
        .filter({ hasText: "Default Child Section" })
        .first();
      await expect(defaultChildCard).toBeVisible();
      const defaultSelect = defaultChildCard.locator("select").first();
      await defaultSelect.selectOption("TextBlock");

      const plusButton = node.locator("button.gg-math-plus").first();
      await expect(plusButton).toBeVisible();
      await plusButton.click();

      await expect
        .poll(async () => {
          const latest = await getLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          const children = Object.entries(
            latest.projectState?.parentSectionMap ?? {},
          )
            .filter(([, parentId]) => parentId === sectionId)
            .map(([childId]) => childId);
          if (children.length === 0) {
            return [];
          }
          const sectionVariantMap =
            latest.projectState?.projectConfig?.sectionVariantMap ?? {};
          const sectionVariants = latest.projectState?.sectionVariants ?? {};
          const sectionImpls = latest.projectState?.sectionImpls ?? {};
          return children
            .map((childId) => sectionVariantMap[childId])
            .filter((variantId): variantId is string => Boolean(variantId))
            .map((variantId) => sectionVariants[variantId]?.impl)
            .filter((implId): implId is string => Boolean(implId))
            .map((implId) => sectionImpls[implId]?.type)
            .filter((type): type is string => Boolean(type));
        })
        .toContain("TextBlock");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

});
