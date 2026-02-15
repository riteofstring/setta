import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  loadProjectConfig,
  openIsolatedProject,
  postBackend,
} from "../helpers";

test.describe("task board generated defaults", () => {
  test("task board default arrays are not shared across instances", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const isolated = await openIsolatedProject(page);
    try {
      const result = await page.evaluate(async () => {
        const generated = await import("/src/utils/generatedTypes.ts");

        const firstDefaults = generated.createUserDefaultTaskBoardSectionImpl();
        const secondDefaults = generated.createUserDefaultTaskBoardSectionImpl();
        firstDefaults.columns.push(
          generated.createTaskBoardColumn({ name: "Backlog" }),
        );
        firstDefaults.tasks.push(generated.createTaskBoardTask({ title: "Task A" }));

        const firstSection = generated.createTaskBoardSectionImpl(firstDefaults, {
          columns: undefined,
          tasks: undefined,
        });
        const secondSection = generated.createTaskBoardSectionImpl(secondDefaults, {
          columns: undefined,
          tasks: undefined,
        });
        firstSection.columns.push(
          generated.createTaskBoardColumn({ name: "Todo" }),
        );
        firstSection.tasks.push(generated.createTaskBoardTask({ title: "Task B" }));

        return {
          sharedDefaultColumns: firstDefaults.columns === secondDefaults.columns,
          sharedDefaultTasks: firstDefaults.tasks === secondDefaults.tasks,
          secondDefaultColumns: secondDefaults.columns.length,
          secondDefaultTasks: secondDefaults.tasks.length,
          sharedSectionColumns: firstSection.columns === secondSection.columns,
          sharedSectionTasks: firstSection.tasks === secondSection.tasks,
          secondSectionColumns: secondSection.columns.length,
          secondSectionTasks: secondSection.tasks.length,
        };
      });

      expect(result.sharedDefaultColumns).toBe(false);
      expect(result.sharedDefaultTasks).toBe(false);
      expect(result.secondDefaultColumns).toBe(0);
      expect(result.secondDefaultTasks).toBe(0);
      expect(result.sharedSectionColumns).toBe(false);
      expect(result.sharedSectionTasks).toBe(false);
      expect(result.secondSectionColumns).toBe(0);
      expect(result.secondSectionTasks).toBe(0);
    } finally {
      await cleanupIsolatedProject(page, isolated);
    }
  });

  test("explicit empty task board columns override is preserved", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const isolated = await openIsolatedProject(page);
    try {
      const created = await postBackend<{ sectionId?: string }>(
        page,
        "/createTopLevelSection",
        {
          projectConfigId: isolated.projectConfigId,
          implType: "TaskBoard",
          implOverrides: { type: "TaskBoard", columns: [] },
        },
      );
      if (!created?.sectionId) {
        throw new Error("Missing sectionId when creating task board section.");
      }
      const sectionId = created.sectionId;
      const projectConfig = await loadProjectConfig(page);
      const variantId = projectConfig.projectConfig.sectionVariantMap[sectionId];
      if (typeof variantId !== "string" || variantId.length === 0) {
        throw new Error("Missing task board variant id.");
      }
      const variant = projectConfig.sectionVariants[variantId];
      if (!variant) {
        throw new Error("Missing task board variant.");
      }
      const implId = variant.impl;
      if (typeof implId !== "string" || implId.length === 0) {
        throw new Error("Missing task board impl id.");
      }
      const sectionImpls = projectConfig.sectionImpls as Record<
        string,
        { type: string; columns?: unknown[] }
      >;
      const impl = sectionImpls[implId];
      expect(impl?.type).toBe("TaskBoard");
      expect(Array.isArray(impl?.columns)).toBe(true);
      expect(impl?.columns).toHaveLength(0);
    } finally {
      await cleanupIsolatedProject(page, isolated);
    }
  });
});
