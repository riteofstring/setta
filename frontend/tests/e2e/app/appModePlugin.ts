import type { Page } from "@playwright/test";
import path from "path";

import { postBackend } from "../helpers";

export async function enableFirstPartyAppSubsystemPlugin(page: Page) {
  const pluginRoot = path.resolve(
    process.cwd(),
    "../plugins/setta-json-render-app-gen",
  );
  await postBackend(page, "/plugins/link", {
    localPluginRoot: pluginRoot,
    scope: "workspace",
    enable: true,
    force: true,
  });
  await postBackend(page, "/plugins/rescan", {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");
}
