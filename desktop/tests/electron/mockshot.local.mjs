import { join } from "node:path";
import {
  captureScreenshot, createElectronFixture, launchElectronCdpContext,
  stopElectronCdpContext, timestampedRecordingDir,
} from "./electron-cdp-harness.mjs";
const dir = timestampedRecordingDir("mock");
const fixture = await createElectronFixture("mock");
let context = null;
try {
  context = await launchElectronCdpContext({
    artifactDir: join(dir, "launch"),
    extraEnv: { SETTA_E2E_WINDOW_HEIGHT: "900", SETTA_E2E_WINDOW_WIDTH: "1500" },
    fixture,
  });
  await context.client.call("Runtime.enable", {});
  const seen = [];
  context.client.on?.("Runtime.exceptionThrown", (p) => seen.push(JSON.stringify(p).slice(0, 240)));
  const target = new URL("../../../docs/mockups/fullscreen_conversation_concept.html", import.meta.url).href;
  await context.client.call("Page.navigate", { url: target });
  await new Promise((r) => setTimeout(r, 4500));
  await captureScreenshot(context.client, join(dir, "lod-3.png"));
  console.log("NOTE3 " + await context.client.evaluate(`document.getElementById('lodNote').textContent`));
  await context.client.evaluate(`document.querySelector('[data-lod="9"]').click()`);
  await new Promise((r) => setTimeout(r, 3000));
  await captureScreenshot(context.client, join(dir, "lod-9.png"));
  console.log("NOTE9 " + await context.client.evaluate(`document.getElementById('lodNote').textContent`));
  // and it must vanish on a thread view
  await context.client.evaluate(`document.getElementById('convNext').click()`);
  await new Promise((r) => setTimeout(r, 2600));
  console.log("ON_THREAD_HIDDEN " + await context.client.evaluate(`document.getElementById('lodbar').hidden`));
  console.log("EXCEPTIONS " + JSON.stringify(seen));
  console.log("DIR " + dir);
} finally {
  if (context !== null) await stopElectronCdpContext(context, { artifactDir: join(dir, "launch") });
}
