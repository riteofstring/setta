import { expect, test, type ConsoleMessage } from "@playwright/test";
import {
  addKwargFromFrontend,
  cleanupIsolatedProject,
  createCallableSection,
  createTextBlockSection,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
  setCallableFromFrontend,
  setCodeObjNameFromFrontend,
  setOverviewTab,
  setParamEnteredValueFromFrontend,
  setSectionNameFromFrontend,
  setSectionSizesFromFrontend,
} from "../../helpers";
import {
  createMetaControlCodeParamSection,
  createSectionVariantFromFrontend,
  type CreateTopLevelSectionResponse,
  findTopLevelTerminalSectionId,
  getBackendCallableTypeErrorMessage,
  getBackendParamTypeErrorMessage,
  getFirstParamInfoId,
  getGeneratedPythonSectionSize,
  getPythonTarget,
  getSectionChildren,
  hasPythonTarget,
  isIgnorableConsoleError,
  loadCodegenProjectState,
  loadLatestCodegenProjectState,
  openCodegenAccordions,
  READY_SELECTOR,
  setCallableFromUi,
  setGenCodePrefixFromFrontend,
  setGenCodeSuffixFromFrontend,
  setParamValueFromFrontend,
  setSectionVariantFromFrontend,
} from "./python-codegen-target.helpers";

test("python codegen toggle persists and reconciles the generated code section", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setOverviewTab(page, "RunInstructions");
  const projectContext = await openIsolatedProject(page);

  try {
    await openCodegenAccordions(page);

    const pythonToggle = page.getByTestId(
      "run-instructions-python-codegen-toggle",
    );
    await expect(pythonToggle).toHaveAttribute("aria-checked", "true");

    const initialState = await loadCodegenProjectState(page);
    expect(hasPythonTarget(initialState)).toBe(true);
    if (!initialState.singletonSections.GenPythonCode) {
      throw new Error("Expected generated python singleton section.");
    }
    const initialGeneratedCodeNode = page.locator(
      `.setta-gpu-flow__node[data-id="${initialState.singletonSections.GenPythonCode}"]`,
    );
    await expect(initialGeneratedCodeNode).toHaveCount(1);

    await pythonToggle.click();
    await expect(pythonToggle).toHaveAttribute("aria-checked", "false");
    await expect(
      page.getByTestId("run-instructions-codegen-policy-disabled-message"),
    ).toBeVisible();
    await expect
      .poll(async () => hasPythonTarget(await loadCodegenProjectState(page)))
      .toBe(false);
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections.GenPythonCode,
      )
      .toBeNull();
    await expect(initialGeneratedCodeNode).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);

    const pythonToggleAfterDisableReload = page.getByTestId(
      "run-instructions-python-codegen-toggle",
    );
    await expect(pythonToggleAfterDisableReload).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(
      page.getByTestId("run-instructions-codegen-policy-disabled-message"),
    ).toBeVisible();

    await pythonToggleAfterDisableReload.click();
    await expect(pythonToggleAfterDisableReload).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(
      page.getByTestId("run-instructions-codegen-policy-disabled-message"),
    ).toHaveCount(0);
    await expect
      .poll(async () => hasPythonTarget(await loadCodegenProjectState(page)))
      .toBe(true);

    const reenabledState = await loadCodegenProjectState(page);
    if (!reenabledState.singletonSections.GenPythonCode) {
      throw new Error("Expected regenerated python code singleton section.");
    }
    await expect(
      page.locator(
        `.setta-gpu-flow__node[data-id="${reenabledState.singletonSections.GenPythonCode}"]`,
      ),
    ).toHaveCount(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);
    await expect(
      page.getByTestId("run-instructions-python-codegen-toggle"),
    ).toHaveAttribute("aria-checked", "true");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("python metadata toggle persists and reconciles the metadata section", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setOverviewTab(page, "RunInstructions");
  const projectContext = await openIsolatedProject(page);

  try {
    await openCodegenAccordions(page);

    const metadataToggle = page.getByTestId(
      "run-instructions-python-metadata-toggle",
    );
    await expect(metadataToggle).toHaveAttribute("aria-checked", "false");
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections
            .GenPythonMetadata,
      )
      .toBeNull();

    await metadataToggle.click();
    await expect(metadataToggle).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(async () =>
        Boolean(
          (await loadCodegenProjectState(page)).singletonSections
            .GenPythonMetadata,
        ),
      )
      .toBe(true);

    const enabledState = await loadCodegenProjectState(page);
    if (!enabledState.singletonSections.GenPythonMetadata) {
      throw new Error("Expected generated python metadata singleton section.");
    }
    const metadataNode = page.locator(
      `.setta-gpu-flow__node[data-id="${enabledState.singletonSections.GenPythonMetadata}"]`,
    );
    await expect(metadataNode).toHaveCount(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);

    const metadataToggleAfterEnableReload = page.getByTestId(
      "run-instructions-python-metadata-toggle",
    );
    await expect(metadataToggleAfterEnableReload).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(metadataNode).toHaveCount(1);

    await metadataToggleAfterEnableReload.click();
    await expect(metadataToggleAfterEnableReload).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections
            .GenPythonMetadata,
      )
      .toBeNull();
    await expect(metadataNode).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);
    await expect(
      page.getByTestId("run-instructions-python-metadata-toggle"),
    ).toHaveAttribute("aria-checked", "false");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python updates for callable and param changes and reports missing param type errors", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await setGenCodePrefixFromFrontend(
      page,
      projectContext.projectConfigId,
      "import math\n",
    );

    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }
    const generatedCodeContent = page.locator(
      `.setta-gpu-flow__node[data-id="${generatedSectionId}"] [data-section-main-editor] .cm-content`,
    );
    await expect(generatedCodeContent).toBeVisible();

    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    await setCallableFromUi(page, sectionId, "math.sqrt");

    const paramInfoId = await getFirstParamInfoId(page, sectionId);
    const paramContainer = page.locator(
      `[id="ParamContainer-${sectionId}-${paramInfoId}"]`,
    );
    await expect(paramContainer).toBeVisible();

    await expect(generatedCodeContent).toContainText("math.sqrt");
    const generatedCodeAfterCallable =
      (await generatedCodeContent.textContent()) ?? "";
    expect(generatedCodeAfterCallable).toContain("math.sqrt");

    await expect
      .poll(async () =>
        getBackendParamTypeErrorMessage(
          page,
          projectContext.projectConfigId,
          sectionId,
          paramInfoId,
        ),
      )
      .toMatch(/argument|parameter/i);

    await expect
      .poll(async () => (await paramContainer.getAttribute("class")) ?? "")
      .toMatch(/bg-red-200/);

    await setParamValueFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      paramInfoId,
      value: "3",
    });

    await expect
      .poll(async () => (await generatedCodeContent.textContent()) ?? "")
      .not.toBe(generatedCodeAfterCallable);
    await expect(generatedCodeContent).toContainText("math.sqrt");
    await expect(generatedCodeContent).toContainText("3");

    await expect
      .poll(async () =>
        getBackendParamTypeErrorMessage(
          page,
          projectContext.projectConfigId,
          sectionId,
          paramInfoId,
        ),
      )
      .toBeNull();

    await expect
      .poll(async () => (await paramContainer.getAttribute("class")) ?? "")
      .not.toMatch(/bg-red-200/);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python updates when switching callable section variants", async ({
  page,
}) => {
  test.setTimeout(90000);
  await seedLocalStorage(page, {
    overviewTab: "Overview",
    overviewVis: true,
    uiEditorVis: true,
    uiEditorTab: { Callable: "SectionVariantsConfig" },
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }
    const generatedCodeContent = page.locator(
      `.setta-gpu-flow__node[data-id="${generatedSectionId}"] [data-section-main-editor] .cm-content`,
    );
    await expect(generatedCodeContent).toBeVisible();

    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    const sectionNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();
    await sectionNode.click();

    const originalVariantId = (await loadCodegenProjectState(page))
      .projectConfig.sectionVariantMap[sectionId];
    if (!originalVariantId) {
      throw new Error("Expected original callable section variant.");
    }
    const generatedCodeWithoutCallable = (
      (await generatedCodeContent.textContent()) ?? ""
    ).replace(/\s+/g, " ");

    const secondVariantId = await createSectionVariantFromFrontend(
      page,
      projectContext.projectConfigId,
      sectionId,
    );

    await setCallableFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      callableName: "sorted",
      refetchParams: false,
    });

    await expect
      .poll(async () =>
        ((await generatedCodeContent.textContent()) ?? "").replace(/\s+/g, " "),
      )
      .toContain("sorted");

    await setSectionVariantFromFrontend(
      page,
      projectContext.projectConfigId,
      sectionId,
      originalVariantId,
    );

    await expect
      .poll(async () =>
        ((await generatedCodeContent.textContent()) ?? "").replace(/\s+/g, " "),
      )
      .toBe(generatedCodeWithoutCallable);

    await setSectionVariantFromFrontend(
      page,
      projectContext.projectConfigId,
      sectionId,
      secondVariantId,
    );

    await expect
      .poll(async () =>
        ((await generatedCodeContent.textContent()) ?? "").replace(/\s+/g, " "),
      )
      .toContain("sorted");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

// Importing a previously missing callable module should clear the generated
// Python symbol error and auto-populate the callable params without any manual
// refetch action from the user.
test("generated python import fixes auto-refetch callable params without manual refresh", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    await setCallableFromUi(page, sectionId, "math.sqrt");

    await expect
      .poll(async () =>
        getBackendCallableTypeErrorMessage(
          page,
          projectContext.projectConfigId,
          sectionId,
        ),
      )
      .toMatch(/not defined|unknown/i);

    await setGenCodePrefixFromFrontend(
      page,
      projectContext.projectConfigId,
      "import math\n",
    );

    await expect
      .poll(async () =>
        getBackendCallableTypeErrorMessage(
          page,
          projectContext.projectConfigId,
          sectionId,
        ),
      )
      .toBeNull();

    const firstParam = page
      .locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"] [id^="ParamContainer-${sectionId}-"]`,
      )
      .first();
    await expect(firstParam).toBeVisible({ timeout: 20000 });
    await expect(firstParam.locator(".section-key").first()).toHaveText(/x/i);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("ui config does not crash when callable params appear and the callable is reselected", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    const sectionNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();
    const sectionChrome = sectionNode
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();
    await expect(sectionChrome).toBeVisible();

    await sectionChrome.click();
    const uiConfigTab = page.getByTestId("ui-editor-tab-ui-config");
    await expect(uiConfigTab).toBeVisible();
    await uiConfigTab.click();

    await setCallableFromUi(page, sectionId, "math.sqrt");
    await setGenCodePrefixFromFrontend(
      page,
      projectContext.projectConfigId,
      "import math\n",
    );

    const paramInfoId = await getFirstParamInfoId(page, sectionId);
    await expect(
      sectionNode.locator(`[id="ParamContainer-${sectionId}-${paramInfoId}"]`),
    ).toBeVisible();

    const latestState = await loadCodegenProjectState(page);
    const generatedSectionId = latestState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }

    await page
      .locator(`.setta-gpu-flow__node[data-id="${generatedSectionId}"]`)
      .click();
    await sectionChrome.click();

    await expect(page.getByText("Unhandled Thrown Error!")).toHaveCount(0);
    await expect(page.locator("#UiEditorPane")).toBeVisible();
    await expect(
      sectionNode.locator(`[id="ParamContainer-${sectionId}-${paramInfoId}"]`),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("ui config shows the current callable param type and applies slider selection", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    const sectionNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();
    const sectionChrome = sectionNode
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();
    await expect(sectionChrome).toBeVisible();

    await sectionChrome.click();
    const uiConfigTab = page.getByTestId("ui-editor-tab-ui-config");
    await expect(uiConfigTab).toBeVisible();
    await uiConfigTab.click();

    await setCallableFromUi(page, sectionId, "math.sqrt");
    await setGenCodePrefixFromFrontend(
      page,
      projectContext.projectConfigId,
      "import math\n",
    );

    const paramInfoId = await getFirstParamInfoId(page, sectionId);
    await expect(
      sectionNode.locator(`[id="ParamContainer-${sectionId}-${paramInfoId}"]`),
    ).toBeVisible();

    await sectionChrome.click();
    await uiConfigTab.click();
    await expect(page.locator("#UiEditorPane")).toContainText("x");

    const uiTypeInput = page
      .locator(`#UiEditorPane input[placeholder="Search"]`)
      .first();
    await expect(uiTypeInput).toBeVisible();
    await expect(uiTypeInput).toHaveValue("CodeParam");

    await uiTypeInput.click();
    await page.getByText("SliderParam", { exact: true }).click();

    await expect(uiTypeInput).toHaveValue("SliderParam");
    await expect(
      page.locator(`#UiEditorPane input[placeholder="min"]`),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python updates when text section text changes", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }
    const generatedCodeContent = page.locator(
      `.setta-gpu-flow__node[data-id="${generatedSectionId}"] [data-section-main-editor] .cm-content`,
    );
    await expect(generatedCodeContent).toBeVisible();

    const { sectionId } = await createTextBlockSection(
      page,
      projectContext.projectConfigId,
      "__pw_python_codegen_text__",
    );
    const generatedCodeBeforeTextUpdate =
      (await generatedCodeContent.textContent()) ?? "";

    await postBackend(page, "/setTextBlockText", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      text: "hello from text block",
    });

    await expect
      .poll(async () => (await generatedCodeContent.textContent()) ?? "")
      .toContain("hello from text block");
    await expect
      .poll(async () => (await generatedCodeContent.textContent()) ?? "")
      .not.toBe(generatedCodeBeforeTextUpdate);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python updates when a list section is moved into a dict section", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const dictResponse = (await createTopLevelSectionFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      implType: "Dict",
      name: "Settings",
      position: { x: 280, y: 100 },
    })) as CreateTopLevelSectionResponse | null;
    const dictSectionId = dictResponse?.sectionId;
    if (!dictSectionId) {
      throw new Error("Expected created dict section id.");
    }

    const listResponse = (await createTopLevelSectionFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      implType: "ListRoot",
      name: "Items",
      position: { x: 40, y: 100 },
    })) as CreateTopLevelSectionResponse | null;
    const listSectionId = listResponse?.sectionId;
    if (!listSectionId) {
      throw new Error("Expected created list section id.");
    }

    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }
    const generatedCodeContent = page.locator(
      `.setta-gpu-flow__node[data-id="${generatedSectionId}"] [data-section-main-editor] .cm-content`,
    );
    await expect(generatedCodeContent).toBeVisible();
    await expect(generatedCodeContent).toContainText("state.Settings = {}");
    await expect(generatedCodeContent).toContainText("state.Items = []");

    await Promise.all([
      page.waitForRequest("**/moveSections"),
      page.evaluate(
        async ({ sectionId, parentSectionId }) => {
          const { moveSectionsWithBackend } = await import(
            "/src/state/actions/sections/moveSections"
          );
          moveSectionsWithBackend({
            sectionIds: [sectionId],
            newParentId: parentSectionId,
            newIndex: 0,
            positionsById: null,
          });
        },
        { sectionId: listSectionId, parentSectionId: dictSectionId },
      ),
    ]);

    await expect
      .poll(async () => {
        const latestState = await loadLatestCodegenProjectState(
          page,
          projectContext.projectConfigId,
        );
        const children = getSectionChildren(latestState, dictSectionId);
        return {
          parentId: latestState.parentSectionMap[listSectionId] ?? null,
          childIDs: children,
        };
      })
      .toMatchObject({
        parentId: dictSectionId,
        childIDs: [listSectionId],
      });

    await expect
      .poll(async () => (await generatedCodeContent.textContent()) ?? "")
      .not.toContain("state.Items = []");
    await expect(generatedCodeContent).toContainText(
      "state.Settings__Items = []",
    );
    await expect(generatedCodeContent).toContainText(
      "'Items': state.Settings__Items",
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python run hides internal readiness markers across repeated runs and survives reload", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const pageErrors: string[] = [];
  const onPageError = (error: Error) => {
    const message = error?.stack || error?.message || String(error);
    if (!pageErrors.includes(message)) {
      pageErrors.push(message);
    }
  };
  page.on("pageerror", onPageError);
  page.on("console", (message: ConsoleMessage) => {
    const text = message.text();
    if (message.type() === "error" && !isIgnorableConsoleError(text)) {
      // Keep the listener installed so Playwright surfaces these in test logs,
      // but do not fail the test on benign unload-time fetch cancellations.
    }
  });

  try {
    await setGenCodePrefixFromFrontend(
      page,
      projectContext.projectConfigId,
      "import math\nRUN_MARKER = 'RUN_OK_MARKER'\n",
    );

    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    await setSectionNameFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      name: "root_value",
    });
    await setCallableFromUi(page, sectionId, "math.sqrt");

    const paramInfoId = await getFirstParamInfoId(page, sectionId);
    await setParamValueFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      paramInfoId,
      value: "9",
    });
    await setGenCodeSuffixFromFrontend(
      page,
      projectContext.projectConfigId,
      "state = SettaState()\nprint(RUN_MARKER, state.root_value)\n",
    );

    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }

    await page.evaluate(async (id) => {
      const { runCodeBlock } = await import(
        "/src/state/actions/runOrImportCode"
      );
      await runCodeBlock(id);
    }, generatedSectionId);

    await expect
      .poll(async () =>
        findTopLevelTerminalSectionId(await loadCodegenProjectState(page)),
      )
      .not.toBeNull();

    const loadedState = await loadCodegenProjectState(page);
    const createdTerminalId = findTopLevelTerminalSectionId(loadedState);
    if (!createdTerminalId) {
      throw new Error(
        "Expected generated-entry run to create a top-level terminal.",
      );
    }
    const terminalNode = page.locator(
      `.setta-gpu-flow__node[data-id="${createdTerminalId}"]`,
    );
    await expect(terminalNode).toBeVisible();
    await expect
      .poll(async () => {
        const box = await terminalNode.boundingBox();
        if (!box) {
          return null;
        }
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      })
      .toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
    const terminalBox = await terminalNode.boundingBox();
    if (!terminalBox) {
      throw new Error("Expected generated-entry terminal bounds.");
    }
    expect(terminalBox.width).toBeGreaterThan(650);
    expect(terminalBox.height).toBeGreaterThan(190);
    await expect
      .poll(async () => {
        return ((await terminalNode.textContent()) ?? "").replace(/\s+/g, " ");
      })
      .toContain("RUN_OK_MARKER");
    await expect
      .poll(async () => {
        const output = (await terminalNode.textContent()) ?? "";
        return output.includes("python3") || output.includes("python");
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const output = (await terminalNode.textContent()) ?? "";
        return (output.match(/RUN_OK_MARKER/g) ?? []).length;
      })
      .toBe(1);
    await expect
      .poll(async () => {
        const output = ((await terminalNode.textContent()) ?? "").replace(
          /\r/g,
          "",
        );
        const markerIndex = output.indexOf("RUN_OK_MARKER");
        if (markerIndex < 0) {
          return false;
        }
        return /\n%\s*\n/.test(output.slice(markerIndex));
      })
      .toBe(false);
    await expect
      .poll(async () => {
        const output = ((await terminalNode.textContent()) ?? "").replace(
          /\r/g,
          "",
        );
        const firstNonEmptyLine =
          output
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.length > 0) ?? "";
        return firstNonEmptyLine;
      })
      .not.toBe("%");

    await Promise.all([
      page.waitForRequest("**/runCode"),
      page.evaluate(async (id) => {
        const { runCodeBlock } = await import(
          "/src/state/actions/runOrImportCode"
        );
        await runCodeBlock(id);
      }, generatedSectionId),
    ]);
    await Promise.all([
      page.waitForRequest("**/runCode"),
      page.evaluate(async (id) => {
        const { runCodeBlock } = await import(
          "/src/state/actions/runOrImportCode"
        );
        await runCodeBlock(id);
      }, generatedSectionId),
    ]);
    await expect
      .poll(async () => {
        return ((await terminalNode.textContent()) ?? "").replace(/\s+/g, " ");
      })
      .not.toContain("SETTA_RDY");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);

    const reloadedTerminalNode = page.locator(
      `.setta-gpu-flow__node[data-id="${createdTerminalId}"]`,
    );
    await expect(reloadedTerminalNode).toBeVisible();
    await expect
      .poll(async () => {
        return ((await reloadedTerminalNode.textContent()) ?? "").replace(
          /\s+/g,
          " ",
        );
      })
      .toContain("RUN_OK_MARKER");
    await expect(reloadedTerminalNode).not.toContainText("SETTA_RDY");
    await expect(page.locator(".setta-gpu-flow__pane")).toBeVisible();
    await expect(
      page.getByText("Unexpected Application Error", { exact: true }),
    ).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  } finally {
    page.off("pageerror", onPageError);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python keeps its resized section size after param dict mutations", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }

    const generatedResizable = page.locator(
      `[id="${generatedSectionId}-CustomResizable"]`,
    );
    await expect(generatedResizable).toBeVisible();
    const initialBox = await generatedResizable.boundingBox();
    if (!initialBox) {
      throw new Error("Expected generated python resizable bounds.");
    }

    await setSectionSizesFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionSizes: {
        [generatedSectionId]: {
          width: 760,
          height: 280,
        },
      },
    });

    await expect
      .poll(async () => getGeneratedPythonSectionSize(page))
      .toEqual({ width: 760, height: 280 });

    await expect
      .poll(async () => (await generatedResizable.boundingBox())?.width ?? 0)
      .toBeGreaterThan(initialBox.width + 120);

    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve viewport bounds for dict placement.");
    }
    const sectionResponse = await createTopLevelSectionFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      implType: "Dict",
      viewportBounds,
    });
    const sectionId = sectionResponse?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating dict section.");
    }

    await addKwargFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
    });
    const paramInfoId = await getFirstParamInfoId(page, sectionId);

    await setCodeObjNameFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      codeObjId: paramInfoId,
      name: "renamed_key",
    });
    await setParamEnteredValueFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      paramInfoId,
      value: "123",
    });

    await expect
      .poll(async () => getGeneratedPythonSectionSize(page))
      .toEqual({ width: 760, height: 280 });

    await expect
      .poll(async () => (await generatedResizable.boundingBox())?.width ?? 0)
      .toBeGreaterThan(initialBox.width + 120);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("python section override persists through Run Instructions edits", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setOverviewTab(page, "RunInstructions");
  const projectContext = await openIsolatedProject(page);

  try {
    const { sectionId, sectionName } = await createTextBlockSection(
      page,
      projectContext.projectConfigId,
      "__pw_python_codegen_section_override__",
    );

    await openCodegenAccordions(page);
    await page
      .getByTestId("run-instructions-section-override-select")
      .selectOption({ label: sectionName });
    await page.getByTestId("run-instructions-section-override-add").click();
    const overrideRow = page.getByTestId(
      `run-instructions-section-override-${sectionId}`,
    );
    await expect(overrideRow).toBeVisible();
    await page
      .getByTestId(`run-instructions-section-override-mode-${sectionId}`)
      .selectOption("exclude");

    await expect
      .poll(async () => {
        const state = await loadCodegenProjectState(page);
        return (
          getPythonTarget(state).sectionPolicy?.sectionOverrides?.[sectionId]
            ?.mode ?? null
        );
      })
      .toBe("exclude");
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections.GenPythonCode,
      )
      .not.toBeNull();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);
    await expect(
      page.getByTestId(`run-instructions-section-override-${sectionId}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`run-instructions-section-override-mode-${sectionId}`),
    ).toHaveValue("exclude");

    await page
      .getByTestId(`run-instructions-section-override-remove-${sectionId}`)
      .click();
    await expect(
      page.getByTestId(`run-instructions-section-override-${sectionId}`),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const state = await loadCodegenProjectState(page);
        return (
          getPythonTarget(state).sectionPolicy?.sectionOverrides?.[sectionId] ??
          null
        );
      })
      .toBeNull();
    await expect(
      page.getByTestId("run-instructions-section-override-select"),
    ).toHaveValue("");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("python code obj override persists through Run Instructions edits", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setOverviewTab(page, "RunInstructions");
  const projectContext = await openIsolatedProject(page);

  try {
    const sectionName = "__pw_python_codegen_codeobj_section__";
    const paramName = "__pw_python_codegen_codeobj_param__";
    const paramValue = "1 + 2";
    const { paramInfoId } = await createMetaControlCodeParamSection(
      page,
      projectContext.projectConfigId,
      sectionName,
      paramName,
      paramValue,
    );

    await openCodegenAccordions(page);
    await page
      .getByTestId("run-instructions-codeobj-override-select")
      .selectOption({ label: `${sectionName} / ${paramName}` });
    await page.getByTestId("run-instructions-codeobj-override-add").click();
    const overrideRow = page.getByTestId(
      `run-instructions-codeobj-override-${paramInfoId}`,
    );
    await expect(overrideRow).toBeVisible();
    await page
      .getByTestId(
        `run-instructions-codeobj-override-representation-${paramInfoId}`,
      )
      .selectOption("string");

    await expect
      .poll(async () => {
        const state = await loadCodegenProjectState(page);
        return (
          getPythonTarget(state).codeObjValuePolicy?.codeObjOverrides?.[
            paramInfoId
          ]?.representation ?? null
        );
      })
      .toBe("string");
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections.GenPythonCode,
      )
      .not.toBeNull();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);
    await expect(
      page.getByTestId(
        `run-instructions-codeobj-override-representation-${paramInfoId}`,
      ),
    ).toHaveValue("string");

    await page
      .getByTestId(`run-instructions-codeobj-override-remove-${paramInfoId}`)
      .click();
    await expect(
      page.getByTestId(`run-instructions-codeobj-override-${paramInfoId}`),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const state = await loadCodegenProjectState(page);
        return (
          getPythonTarget(state).codeObjValuePolicy?.codeObjOverrides?.[
            paramInfoId
          ] ?? null
        );
      })
      .toBeNull();
    await expect(
      page.getByTestId("run-instructions-codeobj-override-select"),
    ).toHaveValue("");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
