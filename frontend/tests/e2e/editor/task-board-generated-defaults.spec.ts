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
        const secondDefaults =
          generated.createUserDefaultTaskBoardSectionImpl();
        firstDefaults.tasks.push(
          generated.createTaskBoardTask({ title: "Task A" }),
        );

        const firstExplicitDefaults =
          generated.createUserDefaultTaskBoardSectionImpl({
            columns: [],
            tasks: [],
          });
        const secondExplicitDefaults =
          generated.createUserDefaultTaskBoardSectionImpl({
            columns: [],
            tasks: [],
          });
        firstExplicitDefaults.columns?.push(
          generated.createTaskBoardColumn({ name: "Backlog" }),
        );
        firstExplicitDefaults.tasks.push(
          generated.createTaskBoardTask({ title: "Task C" }),
        );

        const firstSection = generated.createTaskBoardSectionImpl(
          firstDefaults,
          {
            columns: undefined,
            tasks: undefined,
          },
        );
        const secondSection = generated.createTaskBoardSectionImpl(
          secondDefaults,
          {
            columns: undefined,
            tasks: undefined,
          },
        );
        firstSection.columns.push(
          generated.createTaskBoardColumn({ name: "Todo" }),
        );
        firstSection.tasks.push(
          generated.createTaskBoardTask({ title: "Task B" }),
        );

        return {
          defaultColumnsAreNull:
            firstDefaults.columns === null && secondDefaults.columns === null,
          sharedDefaultTasks: firstDefaults.tasks === secondDefaults.tasks,
          secondDefaultTasks: secondDefaults.tasks.length,
          sharedExplicitDefaultColumns:
            firstExplicitDefaults.columns === secondExplicitDefaults.columns,
          sharedExplicitDefaultTasks:
            firstExplicitDefaults.tasks === secondExplicitDefaults.tasks,
          secondExplicitDefaultColumns:
            secondExplicitDefaults.columns?.length ?? -1,
          secondExplicitDefaultTasks: secondExplicitDefaults.tasks.length,
          sharedSectionColumns: firstSection.columns === secondSection.columns,
          sharedSectionTasks: firstSection.tasks === secondSection.tasks,
          secondSectionColumns: secondSection.columns.length,
          secondSectionTasks: secondSection.tasks.length,
        };
      });

      expect(result.defaultColumnsAreNull).toBe(true);
      expect(result.sharedDefaultTasks).toBe(false);
      expect(result.secondDefaultTasks).toBe(0);
      expect(result.sharedExplicitDefaultColumns).toBe(false);
      expect(result.sharedExplicitDefaultTasks).toBe(false);
      expect(result.secondExplicitDefaultColumns).toBe(0);
      expect(result.secondExplicitDefaultTasks).toBe(0);
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
      const variantId =
        projectConfig.projectConfig.sectionVariantMap[sectionId];
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
