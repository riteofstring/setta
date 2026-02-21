import { expect, test, type Page } from "@playwright/test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const PLUGIN_ID = "setta-fixture-full";
const ENABLED_SETTING_ID = "plugin::setta-fixture-full::enabled";
const LABEL_SETTING_ID = "plugin::setta-fixture-full::label";
const PLUGIN_PANE_TAB_SELECTOR =
  "#overview-plugin-pane-tab-setta-fixture-full-full-settings-pane";

type ToolError = {
  code: string;
  message: string;
};

type GetUISettingValueResult = {
  value: unknown;
  error: ToolError | null;
};

type SetUISettingValueResult = {
  newValue: unknown;
  changed: boolean;
  error: ToolError | null;
};

type RevealUISettingResult = {
  emittedRevealCount: number;
  statuses: Array<{
    status: "revealed" | "failed";
    error: ToolError | null;
  }>;
};

type CallToolResponse<TStructured> = {
  isError: boolean;
  structuredContent?: TStructured;
};

function prepareFrontendOnlyFullFixture(): {
  pluginRoot: string;
  tempRoot: string;
} {
  const fixturePluginRoot = path.resolve(
    process.cwd(),
    "../tests/fixtures/plugins/full",
  );
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "setta-plugin-ui-"));
  const pluginRoot = path.join(tempRoot, "full-plugin");
  fs.cpSync(fixturePluginRoot, pluginRoot, { recursive: true });

  const manifestPath = path.join(pluginRoot, "setta.plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<
    string,
    unknown
  >;
  delete manifest.backend;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return { pluginRoot, tempRoot };
}

async function callMcpTool<TStructured>(
  page: Page,
  projectConfigId: string,
  tool: string,
  argumentsPayload: Record<string, unknown>,
): Promise<TStructured> {
  const rawResponse = await page.request.post(
    `${BACKEND_ORIGIN}/__setta__/tools/call`,
    {
      data: {
        tool,
        arguments: argumentsPayload,
        agenticContext: {
          projectConfigId,
          allowUnscoped: true,
        },
      },
      timeout: 15000,
    },
  );
  const rawText = await rawResponse.text();
  if (!rawResponse.ok()) {
    const detail = rawText ? ` ${rawText}` : "";
    throw new Error(
      `MCP tool call failed (${rawResponse.status()}): ${tool}${detail}`,
    );
  }

  const response = JSON.parse(rawText) as CallToolResponse<TStructured>;
  if (response.isError) {
    throw new Error(`Tool ${tool} returned isError=true.`);
  }
  if (response.structuredContent === undefined) {
    throw new Error(`Missing structuredContent for ${tool}.`);
  }
  return response.structuredContent;
}

test("plugin UI settings tools mutate and reveal plugin settings", async ({
  page,
}) => {
  const preparedFixture = prepareFrontendOnlyFullFixture();

  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);

  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: preparedFixture.pluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/config", {
      pluginId: PLUGIN_ID,
      config: {
        enabled: true,
        label: "fixture-default",
      },
    });
    await postBackend(page, "/plugins/rescan", {});

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const pluginPaneTab = page.locator(PLUGIN_PANE_TAB_SELECTOR);
    await expect(pluginPaneTab).toBeVisible({ timeout: 30000 });
    await pluginPaneTab.click();

    const labelSettingNode = page.locator(
      `[data-fixture-full-setting="${LABEL_SETTING_ID}"]`,
    );
    await expect(labelSettingNode).toBeVisible();

    const initialGet = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: LABEL_SETTING_ID,
      },
    );
    expect(initialGet.error).toBeNull();

    const nextLabelValue = `playwright-${Date.now()}`;
    const setResult = await callMcpTool<SetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "set_ui_setting_value",
      {
        settingId: LABEL_SETTING_ID,
        value: nextLabelValue,
      },
    );
    expect(setResult.error).toBeNull();
    expect(setResult.changed).toBe(true);
    expect(setResult.newValue).toBe(nextLabelValue);

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: LABEL_SETTING_ID,
        durationMs: 8000,
      },
    );
    expect(revealResult.emittedRevealCount).toBe(1);
    expect(revealResult.statuses[0]?.status).toBe("revealed");
    expect(revealResult.statuses[0]?.error).toBeNull();

    await expect(labelSettingNode).toHaveClass(/setta-fixture-full-reveal/);

    const updatedGet = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: LABEL_SETTING_ID,
      },
    );
    expect(updatedGet.error).toBeNull();
    expect(updatedGet.value).toBe(nextLabelValue);
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: PLUGIN_ID,
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
    fs.rmSync(preparedFixture.tempRoot, { recursive: true, force: true });
  }
});

test("plugin UI settings tools return plugin_unavailable when plugin is disabled", async ({
  page,
}) => {
  const preparedFixture = prepareFrontendOnlyFullFixture();

  await setOverviewTab(page, "Overview");
  const projectContext = await openIsolatedProject(page);

  try {
    await postBackend(page, "/plugins/link", {
      localPluginRoot: preparedFixture.pluginRoot,
      scope: "workspace",
      enable: true,
      force: true,
    });
    await postBackend(page, "/plugins/config", {
      pluginId: PLUGIN_ID,
      config: {
        enabled: true,
        label: "fixture-default",
      },
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await postBackend(page, "/plugins/disable", {
      pluginId: PLUGIN_ID,
    });
    await postBackend(page, "/plugins/rescan", {});
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    await expect(page.locator(PLUGIN_PANE_TAB_SELECTOR)).toHaveCount(0);

    const getResult = await callMcpTool<GetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "get_ui_setting_value",
      {
        settingId: ENABLED_SETTING_ID,
      },
    );
    expect(getResult.error?.code).toBe("plugin_unavailable");

    const setResult = await callMcpTool<SetUISettingValueResult>(
      page,
      projectContext.projectConfigId,
      "set_ui_setting_value",
      {
        settingId: ENABLED_SETTING_ID,
        value: true,
      },
    );
    expect(setResult.error?.code).toBe("plugin_unavailable");

    const revealResult = await callMcpTool<RevealUISettingResult>(
      page,
      projectContext.projectConfigId,
      "reveal_ui_setting",
      {
        settingId: ENABLED_SETTING_ID,
      },
    );
    expect(revealResult.emittedRevealCount).toBe(0);
    expect(revealResult.statuses[0]?.status).toBe("failed");
    expect(revealResult.statuses[0]?.error?.code).toBe("plugin_unavailable");
  } finally {
    await postBackend(page, "/plugins/uninstall", {
      pluginId: PLUGIN_ID,
      scope: "workspace",
    }).catch(() => null);
    await postBackend(page, "/plugins/rescan", {}).catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
    fs.rmSync(preparedFixture.tempRoot, { recursive: true, force: true });
  }
});
