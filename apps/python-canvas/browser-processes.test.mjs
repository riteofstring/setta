import assert from "node:assert/strict";
import test from "node:test";

import { headlessChromeArguments } from "./browser-processes.mjs";

test("Headless Chrome uses an isolated muted renderer profile", () => {
  const profileDirectory = "/tmp/setta-python-canvas-isolated-profile";
  const arguments_ = headlessChromeArguments(profileDirectory);

  for (const requiredArgument of [
    "--headless=new",
    "--mute-audio",
    "--password-store=basic",
    "--use-mock-keychain",
  ]) {
    assert.ok(
      arguments_.includes(requiredArgument),
      `Headless Chrome is missing ${requiredArgument}.`,
    );
  }
  assert.deepEqual(
    arguments_.filter((argument) => argument.startsWith("--user-data-dir=")),
    [`--user-data-dir=${profileDirectory}`],
  );
});
