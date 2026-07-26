import { join } from "node:path";
import process from "node:process";
import {
  captureScreenshot, createElectronFixture, launchElectronCdpContext,
  stopElectronCdpContext, timestampedRecordingDir,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
const dir = timestampedRecordingDir("mockup-shot");
const fixture = await createElectronFixture("mockup-shot");
const fakeCodex = await installFakeTopicCodex(fixture);
const views = process.argv.slice(2);
let context = null;
try {
  context = await launchElectronCdpContext({
    artifactDir: join(dir, "launch"),
    extraEnv: {
      PATH: `${fakeCodex.binDir}:${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
      SETTA_E2E_WINDOW_HEIGHT: "980", SETTA_E2E_WINDOW_WIDTH: "1400",
    },
    fixture,
  });
  const target = new URL("../../../docs/mockups/artifact_concept.html", import.meta.url).href;
  await context.client.call("Page.navigate", { url: target });
  await new Promise((r) => setTimeout(r, 2500));
  for (const view of views) {
    await context.client.evaluate(
      `document.querySelector('.tab[data-view="${view}"]').click()`,
    );
    await new Promise((r) => setTimeout(r, 600));
    await captureScreenshot(context.client, join(dir, `${view}.png`));
    console.log("SHOT " + join(dir, `${view}.png`));
  }
} finally {
  if (context !== null) await stopElectronCdpContext(context, { artifactDir: join(dir, "launch") });
}
