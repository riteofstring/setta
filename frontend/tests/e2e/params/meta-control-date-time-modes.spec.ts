import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
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
        metaControlParamId?: string | null;
        codeObjVariantMap?: Record<string, string>;
      }
    >;
  };
};

async function createMetaControlSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "MetaControl",
    },
  );
  const sectionId = response?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId for MetaControl creation.");
  }
  return sectionId;
}

async function loadLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<LatestProjectStateResponse> {
  return (
    (await postBackend<LatestProjectStateResponse>(
      page,
      "/getLatestProjectState",
      {
        projectConfigId,
      },
    )) ?? {}
  );
}

function getMetaControlParamId(
  latest: LatestProjectStateResponse,
  sectionId: string,
): string | null {
  const variantId =
    latest.projectState?.projectConfig?.sectionVariantMap?.[sectionId];
  if (!variantId) {
    return null;
  }
  const implId = latest.projectState?.sectionVariants?.[variantId]?.impl;
  if (!implId) {
    return null;
  }
  const impl = latest.projectState?.sectionImpls?.[implId];
  if (!impl || impl.type !== "MetaControl") {
    return null;
  }
  if (impl.metaControlParamId) {
    return impl.metaControlParamId;
  }
  const paramIds = Object.keys(impl.codeObjVariantMap ?? {});
  if (paramIds.length === 0) {
    return null;
  }
  return paramIds[0] ?? null;
}

async function waitForMetaControlParamId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  for (let idx = 0; idx < 80; idx += 1) {
    const latest = await loadLatestProjectState(page, projectConfigId);
    const paramId = getMetaControlParamId(latest, sectionId);
    if (paramId) {
      return paramId;
    }
    await page.waitForTimeout(50);
  }
  throw new Error("Timed out waiting for meta control param id.");
}

function requireBoundingBox(
  box: { x: number; y: number; width: number; height: number } | null,
  label: string,
) {
  if (!box) {
    throw new Error(`Missing bounding box for ${label}.`);
  }
  return box;
}

function expectStableSectionSize(
  before: { width: number; height: number },
  after: { width: number; height: number },
  tolerance = 2,
) {
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(tolerance);
}

function expectBoxWithinSection(
  sectionBox: { x: number; y: number; width: number; height: number },
  controlBox: { x: number; y: number; width: number; height: number },
  tolerance = 1,
) {
  expect(controlBox.x).toBeGreaterThanOrEqual(sectionBox.x - tolerance);
  expect(controlBox.y).toBeGreaterThanOrEqual(sectionBox.y - tolerance);
  expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
    sectionBox.x + sectionBox.width + tolerance,
  );
  expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
    sectionBox.y + sectionBox.height + tolerance,
  );
}

test("meta control time defaults to display and can switch to input mode", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);
  const sectionIds: Array<string> = [];

  try {
    const sectionId = await createMetaControlSection(
      page,
      context.projectConfigId,
    );
    sectionIds.push(sectionId);
    const paramInfoId = await waitForMetaControlParamId(
      page,
      context.projectConfigId,
      sectionId,
    );

    await postBackend(page, "/changeParamImpl", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: "TimeParam",
    });

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        timeControlMode: "display",
        timeDisplayFormat: "twelve_hour",
      },
    });
    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      value: "13:45",
    });

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();
    await expect(sectionNode.getByText("1:45 PM")).toBeVisible();
    await expect(sectionNode.locator('input[type="time"]')).toHaveCount(0);
    const displaySectionBoxBefore = requireBoundingBox(
      await sectionNode.boundingBox(),
      "display-only time section",
    );
    const displayTextBoxBefore = requireBoundingBox(
      await sectionNode.getByText("1:45 PM").boundingBox(),
      "display-only time text",
    );
    expectBoxWithinSection(displaySectionBoxBefore, displayTextBoxBefore);

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        timeControlMode: "input",
        timeDisplayFormat: "twelve_hour",
      },
    });

    const timeInput = sectionNode.locator('input[type="time"]');
    await expect(timeInput).toBeVisible();
    await expect(timeInput).toHaveValue("13:45");
    const inputSectionBox = requireBoundingBox(
      await sectionNode.boundingBox(),
      "time input section",
    );
    const timeInputBox = requireBoundingBox(
      await timeInput.boundingBox(),
      "time input",
    );
    expectStableSectionSize(displaySectionBoxBefore, inputSectionBox);
    expectBoxWithinSection(inputSectionBox, timeInputBox);

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        timeControlMode: "display",
        timeDisplayFormat: "twelve_hour",
      },
    });
    await expect(sectionNode.getByText("1:45 PM")).toBeVisible();
    await expect(sectionNode.locator('input[type="time"]')).toHaveCount(0);
    const displaySectionBoxAfter = requireBoundingBox(
      await sectionNode.boundingBox(),
      "restored display-only time section",
    );
    const displayTextBoxAfter = requireBoundingBox(
      await sectionNode.getByText("1:45 PM").boundingBox(),
      "restored display-only time text",
    );
    expectStableSectionSize(displaySectionBoxBefore, displaySectionBoxAfter);
    expectBoxWithinSection(displaySectionBoxAfter, displayTextBoxAfter);

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        timeControlMode: "input",
        timeDisplayFormat: "twelve_hour",
      },
    });
    await expect(timeInput).toBeVisible();
    await expect(timeInput).toHaveValue("13:45");
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

test("meta control calendar renders calendar UI", async ({ page }) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);
  const sectionIds: Array<string> = [];

  try {
    const sectionId = await createMetaControlSection(
      page,
      context.projectConfigId,
    );
    sectionIds.push(sectionId);
    const paramInfoId = await waitForMetaControlParamId(
      page,
      context.projectConfigId,
      sectionId,
    );

    await postBackend(page, "/changeParamImpl", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: "DateParam",
    });

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        dateControlMode: "calendar",
        dateSelectionMode: "multiple",
        dateCalendarWeekStart: "monday",
      },
    });
    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      value: '["2026-02-01","2026-02-03"]',
    });

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();
    await expect(
      sectionNode.getByRole("button", { name: "Prev", exact: true }),
    ).toBeVisible();
    await expect(
      sectionNode.getByRole("button", { name: "Next", exact: true }),
    ).toBeVisible();
    await expect(sectionNode.getByText("2 selected")).toBeVisible();
    await expect(sectionNode.locator('input[type="date"]')).toHaveCount(0);
    const calendarSectionBoxBefore = requireBoundingBox(
      await sectionNode.boundingBox(),
      "calendar meta control section",
    );

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        dateControlMode: "input",
        dateSelectionMode: "single",
        dateCalendarWeekStart: "monday",
      },
    });
    await expect(sectionNode.locator('input[type="text"]')).toBeVisible();
    await expect(
      sectionNode.getByRole("button", { name: "Prev", exact: true }),
    ).toHaveCount(0);
    const inputSectionBox = requireBoundingBox(
      await sectionNode.boundingBox(),
      "calendar input-mode section",
    );
    expect(
      Math.abs(inputSectionBox.width - calendarSectionBoxBefore.width),
    ).toBeLessThanOrEqual(2);

    await postBackend(page, "/updateParamImplConfig", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      newConfig: {
        dateControlMode: "calendar",
        dateSelectionMode: "multiple",
        dateCalendarWeekStart: "monday",
      },
    });
    await expect(
      sectionNode.getByRole("button", { name: "Prev", exact: true }),
    ).toBeVisible();
    const calendarSectionBoxAfter = requireBoundingBox(
      await sectionNode.boundingBox(),
      "restored calendar section",
    );
    expect(
      Math.abs(calendarSectionBoxAfter.width - calendarSectionBoxBefore.width),
    ).toBeLessThanOrEqual(2);
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

test("meta control text area keeps the editor within the compact section shell", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);
  const sectionIds: Array<string> = [];

  try {
    const sectionId = await createMetaControlSection(
      page,
      context.projectConfigId,
    );
    sectionIds.push(sectionId);
    const paramInfoId = await waitForMetaControlParamId(
      page,
      context.projectConfigId,
      sectionId,
    );

    await postBackend(page, "/changeParamImpl", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: "TextAreaParam",
    });

    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      value: "alpha\nbeta\ngamma",
    });

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    const editorShell = sectionNode.locator(
      `[id="${sectionId}-${paramInfoId}-MetaControl"]`,
    );

    await expect(sectionNode).toBeVisible();
    await expect(editorShell).toContainText("alpha");
    await expect(editorShell).toContainText("beta");
    await expect(editorShell).toContainText("gamma");

    const classRead = await sectionNode.evaluate((node) => {
      const shell = node.querySelector(
        'div[class*="rounded-lg border"]',
      ) as HTMLDivElement | null;
      const editor = node.querySelector(
        '[id$="-MetaControl"]',
      ) as HTMLElement | null;
      return {
        shellClassName: shell?.className ?? null,
        editorClassName: editor?.className ?? null,
      };
    });

    expect(classRead.shellClassName).not.toContain("single-cell-container");
    expect(classRead.editorClassName).not.toContain("single-cell-child");

    const sectionBox = requireBoundingBox(
      await sectionNode.boundingBox(),
      "text area meta control section",
    );
    const editorBox = requireBoundingBox(
      await editorShell.boundingBox(),
      "text area editor shell",
    );
    expectBoxWithinSection(sectionBox, editorBox);
    expect(editorBox.height).toBeGreaterThan(80);

    await editorShell.click();
    const liveEditor = sectionNode.locator(".cm-editor");
    await expect(liveEditor).toBeVisible();

    const sectionBoxAfterActivation = requireBoundingBox(
      await sectionNode.boundingBox(),
      "text area meta control section after activation",
    );
    const liveEditorBox = requireBoundingBox(
      await liveEditor.boundingBox(),
      "text area live editor",
    );
    expectStableSectionSize(sectionBox, sectionBoxAfterActivation);
    expectBoxWithinSection(sectionBoxAfterActivation, liveEditorBox);
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

test("meta control color picker keeps the native input within the compact section shell", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);
  const sectionIds: Array<string> = [];

  try {
    const sectionId = await createMetaControlSection(
      page,
      context.projectConfigId,
    );
    sectionIds.push(sectionId);
    const paramInfoId = await waitForMetaControlParamId(
      page,
      context.projectConfigId,
      sectionId,
    );

    await postBackend(page, "/changeParamImpl", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: "ColorPickerParam",
    });

    await postBackend(page, "/setParamEnteredValue", {
      projectConfigId: context.projectConfigId,
      sectionId,
      paramInfoId,
      value: "#00ff00",
    });

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    const colorInput = sectionNode.locator('input[type="color"]');

    await expect(sectionNode).toBeVisible();
    await expect(colorInput).toBeVisible();

    const nativeClassRead = await sectionNode.evaluate((node) => {
      const wrapper = node.querySelector(".section-value");
      const input = node.querySelector('input[type="color"]');
      return {
        sectionMarkup: node.innerHTML,
        wrapperClassName:
          wrapper instanceof HTMLElement ? wrapper.className : null,
        inputClassName: input instanceof HTMLElement ? input.className : null,
      };
    });

    expect(nativeClassRead.sectionMarkup).not.toContain(
      "single-cell-container",
    );
    expect(nativeClassRead.sectionMarkup).not.toContain("single-cell-child");
    expect(nativeClassRead.wrapperClassName).not.toContain(
      "single-cell-container",
    );
    expect(nativeClassRead.inputClassName).not.toContain("single-cell-child");

    const nativeSectionBox = requireBoundingBox(
      await sectionNode.boundingBox(),
      "native color meta control section",
    );
    const nativeInputBox = requireBoundingBox(
      await colorInput.boundingBox(),
      "native color meta control input",
    );
    expectBoxWithinSection(nativeSectionBox, nativeInputBox);
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
