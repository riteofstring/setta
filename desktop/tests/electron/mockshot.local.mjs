import { join } from "node:path";
import { captureScreenshot, createElectronFixture, launchElectronCdpContext,
  stopElectronCdpContext, timestampedRecordingDir } from "./electron-cdp-harness.mjs";
const dir = timestampedRecordingDir("mock");
const fixture = await createElectronFixture("mock");
let context = null;
try {
  context = await launchElectronCdpContext({ artifactDir: join(dir, "launch"),
    extraEnv: { SETTA_E2E_WINDOW_HEIGHT: "900", SETTA_E2E_WINDOW_WIDTH: "1500" }, fixture });
  await context.client.call("Runtime.enable", {});
  const seen = [];
  context.client.on?.("Runtime.exceptionThrown", (p) => seen.push(JSON.stringify(p).slice(0, 200)));
  const target = new URL("../../../docs/mockups/fullscreen_conversation_concept.html", import.meta.url).href;
  await context.client.call("Page.navigate", { url: target });
  await new Promise((r) => setTimeout(r, 4000));
  for (const n of ["6", "9", "16"]) {
    await context.client.evaluate(`document.querySelector('[data-lod="${n}"]').click()`);
    await new Promise((r) => setTimeout(r, 2600));
    await captureScreenshot(context.client, join(dir, `tiles-${n}.png`));
    console.log(`SPAN${n} ` + await context.client.evaluate(`(() => {
      const ys=[...document.querySelectorAll('.nl-coltitle.tile')].map(e=>parseFloat(e.style.top));
      const ss=[...document.querySelectorAll('.nl-colstep')].map(e=>parseFloat(e.style.top));
      return JSON.stringify({top:Math.round(Math.min(...ys)), bottom:Math.round(Math.max(...ss)), n:ys.length});
    })()`));
  }
  console.log("EXCEPTIONS " + JSON.stringify(seen));
  console.log("DIR " + dir);
} finally { if (context !== null) await stopElectronCdpContext(context, { artifactDir: join(dir, "launch") }); }
