import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type ProjectStateResponse = {
  projectState?: {
    codeObjs?: Record<string, unknown>;
  };
};

function requireBoundingBox(
  box: { x: number; y: number; width: number; height: number } | null,
  label: string,
) {
  if (!box) {
    throw new Error(`Missing bounding box for ${label}.`);
  }
  return box;
}

function expectBoxWithinRow(
  rowBox: { x: number; y: number; width: number; height: number },
  controlBox: { x: number; y: number; width: number; height: number },
  tolerance = 2,
) {
  expect(controlBox.x).toBeGreaterThanOrEqual(rowBox.x - tolerance);
  expect(controlBox.y).toBeGreaterThanOrEqual(rowBox.y - tolerance);
  expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
    rowBox.x + rowBox.width + tolerance,
  );
  expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
    rowBox.y + rowBox.height + tolerance,
  );
}

function getNewCodeObjId(beforeIds: Set<string>, afterIds: string[]) {
  const newIds = afterIds.filter((id) => !beforeIds.has(id));
  if (newIds.length !== 1) {
    throw new Error(
      `Expected 1 new code obj id, found ${newIds.length}: ${newIds.join(", ")}`,
    );
  }
  return newIds[0];
}

async function loadProjectState(
  page: Parameters<typeof postBackend>[0],
  projectConfigId: string,
) {
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

test("callable color picker param keeps the native input within the compact row shell", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);
  const sectionIds: Array<string> = [];

  try {
    const sectionId = await createCallableSection(
      page,
      context.projectConfigId,
    );
    sectionIds.push(sectionId);

    await postBackend(page, "/setCallable", {
      projectConfigId: context.projectConfigId,
      sectionId,
      callableName: "math.sqrt",
      refetchParams: false,
    });

    const beforeState = await loadProjectState(page, context.projectConfigId);
    const beforeIds = new Set(Object.keys(beforeState.codeObjs ?? {}));

    await postBackend(page, "/addKwarg", {
      projectConfigId: context.projectConfigId,
      sectionId,
    });

    const afterState = await loadProjectState(page, context.projectConfigId);
    const paramId = getNewCodeObjId(
      beforeIds,
      Object.keys(afterState.codeObjs ?? {}),
    );

    await postBackend(page, "/changeParamImpl", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId: paramId,
      selectedId: "ColorPickerParam",
    });
    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId: paramId,
      value: "#00ff00",
    });

    const paramRow = page.locator(`#ParamContainer-${sectionId}-${paramId}`);
    const colorWrapper = paramRow.locator(".section-value").first();
    const colorInput = paramRow.locator('input[type="color"]');

    await expect(paramRow).toBeVisible();
    await expect(colorWrapper).toBeVisible();
    await expect(colorInput).toBeVisible();

    const classRead = await paramRow.evaluate((row) => {
      const wrapper = row.querySelector(".section-value");
      const input = row.querySelector('input[type="color"]');
      return {
        rowMarkup: row.innerHTML,
        wrapperClassName:
          wrapper instanceof HTMLElement ? wrapper.className : null,
        inputClassName: input instanceof HTMLElement ? input.className : null,
      };
    });

    expect(classRead.rowMarkup).not.toContain("single-cell-container");
    expect(classRead.rowMarkup).not.toContain("single-cell-child");
    expect(classRead.wrapperClassName).not.toContain("single-cell-container");
    expect(classRead.inputClassName).not.toContain("single-cell-child");

    const wrapperBox = requireBoundingBox(
      await colorWrapper.boundingBox(),
      "callable color param wrapper",
    );
    const inputBox = requireBoundingBox(
      await colorInput.boundingBox(),
      "callable color param input",
    );
    expectBoxWithinRow(wrapperBox, inputBox);
  } finally {
    if (sectionIds.length > 0) {
      await postBackend(page, "/deleteSections", {
        projectConfigId: context.projectConfigId,
        sectionIds,
      });
    }
    await cleanupIsolatedProject(page, context);
  }
});
