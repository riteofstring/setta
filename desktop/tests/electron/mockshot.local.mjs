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
  await new Promise((r) => setTimeout(r, 4000));
  await context.client.evaluate(`document.querySelector('[data-lod="9"]').click()`);
  await new Promise((r) => setTimeout(r, 2500));
  const probe = `JSON.stringify([...document.querySelectorAll('.nl-coltitle.tile')].slice(0,4).map(e=>({
    t:e.textContent, top:Math.round(parseFloat(e.style.top))})).concat(
    [...document.querySelectorAll('.nl-colstep')].slice(0,4).map(e=>({s:e.textContent, top:Math.round(parseFloat(e.style.top))}))))`;
  console.log("T0 " + await context.client.evaluate(probe));
  await captureScreenshot(context.client, join(dir, "tiles-a.png"));
  await new Promise((r) => setTimeout(r, 6000));
  console.log("T1 " + await context.client.evaluate(probe));
  await captureScreenshot(context.client, join(dir, "tiles-b.png"));
  console.log("EXCEPTIONS " + JSON.stringify(seen));
  console.log("DIR " + dir);
} finally {
  if (context !== null) await stopElectronCdpContext(context, { artifactDir: join(dir, "launch") });
}
