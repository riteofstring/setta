import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const TARGET_CALLABLE = "sorted";

type LabelFocusTarget = {
  sectionId: string;
  rowId: string;
  focusTargetId: string;
};

test("clicking a callable param label focuses the matching param input target", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);

  try {
    const sectionId = await createCallableSection(page, context.projectConfigId);
    await postBackend(page, "/setCallable", {
      projectConfigId: context.projectConfigId,
      sectionId,
      callableName: TARGET_CALLABLE,
      refetchParams: true,
    });

    const sectionNode = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    await expect(sectionNode).toBeVisible();

    // Use a known non-kwarg callable param label so click-to-focus behavior is deterministic.
    const target = await getLabelFocusTarget(page, sectionId, "iterable");
    const label = page.locator(`[id="${target.rowId}"] p`).first();
    await expect(label).toBeVisible();
    await label.scrollIntoViewIfNeeded();

    const focusWorked = await page.evaluate(({ rowId, focusTargetId }) => {
      const labelEl = document.querySelector<HTMLElement>(`[id="${rowId}"] p`);
      const focusRoot = document.getElementById(focusTargetId);
      if (!labelEl || !(focusRoot instanceof HTMLElement)) {
        return false;
      }
      labelEl.click();
      const active = document.activeElement;
      return Boolean(
        active && (active.id === focusTargetId || focusRoot.contains(active)),
      );
    }, target);
    expect(focusWorked).toBe(true);
  } finally {
    await cleanupIsolatedProject(page, context);
  }
});

async function getLabelFocusTarget(
  page: Page,
  sectionId: string,
  expectedLabelSubstring: string,
): Promise<LabelFocusTarget> {
  const target = await page.evaluate(
    ({ targetSectionId, labelSubstring }) => {
      const section = document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${targetSectionId}"]`,
      );
      if (!section) {
        return null;
      }
      const rowSelector = `[id^="ParamContainer-${targetSectionId}-"][data-param-row="true"]`;
      const rows = Array.from(section.querySelectorAll<HTMLElement>(rowSelector));
      for (const row of rows) {
        const label = row.querySelector("p");
        if (!(label instanceof HTMLElement)) {
          continue;
        }
        const text = (label.textContent ?? "").trim().toLowerCase();
        if (!text.includes(labelSubstring.toLowerCase())) {
          continue;
        }
        const prefix = `ParamContainer-${targetSectionId}-`;
        if (!row.id.startsWith(prefix)) {
          continue;
        }
        const paramInfoId = row.id.slice(prefix.length);
        if (!paramInfoId) {
          continue;
        }
        const focusTargetId = `${targetSectionId}-${paramInfoId}-ParamInput`;
        if (!document.getElementById(focusTargetId)) {
          continue;
        }
        return {
          sectionId: targetSectionId,
          rowId: row.id,
          focusTargetId,
        };
      }
      return null;
    },
    { targetSectionId: sectionId, labelSubstring: expectedLabelSubstring },
  );
  if (!target) {
    throw new Error(
      `Failed to find callable param label target for "${expectedLabelSubstring}".`,
    );
  }
  return target;
}
