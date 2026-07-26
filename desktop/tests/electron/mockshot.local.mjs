import { join } from "node:path";
import process from "node:process";
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
  await context.client.call("Log.enable", {}).catch(() => {});
  const seen = [];
  context.client.on?.("Runtime.exceptionThrown", (p) => seen.push(JSON.stringify(p).slice(0, 400)));
  const target = new URL("../../../docs/mockups/fullscreen_conversation_concept.html", import.meta.url).href;
  await context.client.call("Page.navigate", { url: target });
  await new Promise((r) => setTimeout(r, 4000));
  console.log("EXCEPTIONS " + JSON.stringify(seen));
  const probe = await context.client.evaluate(`JSON.stringify({
    hasDirector: typeof renderDirector, onDirector: typeof onDirector !== "undefined" ? onDirector : "undef",
    convs: typeof CONVS !== "undefined" ? CONVS.length : "undef"
  })`).catch((e) => "probe failed: " + e.message);
  console.log("PROBE " + probe);
  await captureScreenshot(context.client, join(dir, "director.png"));
  // arrow to the first thread
  await context.client.evaluate(`document.getElementById('convNext').click()`);
  await new Promise((r) => setTimeout(r, 2600));
  await captureScreenshot(context.client, join(dir, "thread.png"));
  const state = await context.client.evaluate(`JSON.stringify({
    title: document.getElementById('convTitle').textContent,
    dots: document.getElementById('convDots').innerHTML.slice(0,140),
    placeholder: document.getElementById('chatInput').placeholder,
    highlights: [...document.querySelectorAll('#highlights .hl-short')].map(e=>e.textContent),
  })`);
  console.log("THREAD " + state);
  console.log("DIR " + dir);
} finally {
  if (context !== null) await stopElectronCdpContext(context, { artifactDir: join(dir, "launch") });
}
