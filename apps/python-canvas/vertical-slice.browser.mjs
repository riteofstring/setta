import assert from "node:assert/strict";

import {
  fetchCanonicalSnapshot,
  runAgainstProductionApp,
} from "./browser-processes.mjs";
import { evaluate, navigate, waitFor } from "./browser-page.mjs";

// The browser suite is intentionally a later, separately authorized standard
// check. When it is run, this public walkthrough starts an absent temporary
// project with --project and --create, renames it through the labelled UI,
// restarts the launcher without --create, and proves the V2 snapshot persists.
await runAgainstProductionApp(
  async ({ backendOrigin, client, previewOrigin, restart }) => {
    const initialSnapshot = await fetchCanonicalSnapshot(backendOrigin);
    assert.equal(initialSnapshot.version, "v2");
    assert.equal(initialSnapshot.callables.length, 0);

    await navigate(client, previewOrigin);
    await waitFor(
      client,
      "labelled project controls",
      `(() => {
      const projectName = document.querySelector("label[for='python-canvas-project-name']");
      const callableName = document.querySelector("label[for='python-canvas-new-callable']");
      return projectName?.textContent === "Project name" &&
        callableName?.textContent === "New callable name";
    })()`,
    );
    await renameProjectThroughPublicControl(
      client,
      "Browser walkthrough project",
    );
    await waitFor(
      client,
      "renamed project response",
      `fetch("/api/v2/project").then(async (response) =>
      response.ok && (await response.json()).project.name === "Browser walkthrough project",
    )`,
    );

    await restart();
    const restoredSnapshot = await fetchCanonicalSnapshot(backendOrigin);
    assert.equal(restoredSnapshot.version, "v2");
    assert.equal(restoredSnapshot.project.name, "Browser walkthrough project");
    assert.deepEqual(restoredSnapshot.callables, []);

    await navigate(client, previewOrigin);
    await waitFor(
      client,
      "restored project name",
      `document.querySelector("input[name='project-name']")?.value === "Browser walkthrough project"`,
    );
  },
);

async function renameProjectThroughPublicControl(client, name) {
  const renamed = await evaluate(
    client,
    `(() => {
      const input = document.querySelector("input[name='project-name']");
      if (!(input instanceof HTMLInputElement) || input.form === null) {
        return false;
      }
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, ${JSON.stringify(name)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.form.requestSubmit();
      return true;
    })()`,
  );
  assert.equal(renamed, true, "Project name control was not available.");
}
