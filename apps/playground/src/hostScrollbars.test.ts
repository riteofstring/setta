import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read the stylesheet source directly: vitest replaces `.css` imports (even `?raw`) with
// empty modules, and this contract is about the authored host file, not a build output.
const hostStylesheet = readFileSync(
  new URL("./index.css", import.meta.url),
  "utf8",
);

// The host-owned scrollbar regression from the Phase 4 host-context correction: the package
// ships no scrollbar policy, so the frozen reference's host treatment — thin translucent
// #94a3b83a Firefox scrollbars on body and every descendant, and the 0.375 rem WebKit
// scrollbar that opts Chromium out of overlay scrollbars so a 550 px scroll shell reserves
// the 6 px gutter and measures main's 544 px client width — is this host's contract, frozen
// here as the literal blocks from the reference index.css at 043d3b2e9.

const FROZEN_FIREFOX_SCROLLBAR_BLOCK = `@supports (-moz-appearance: none) {
  body {
    scrollbar-width: thin;
    scrollbar-color: #94a3b83a transparent;
    overflow: hidden;
  }

  body * {
    scrollbar-width: thin;
    scrollbar-color: #94a3b83a transparent;
  }
}`;

const FROZEN_WEBKIT_SCROLLBAR_BLOCK = `@supports (not (-moz-appearance: none)) {
  body::-webkit-scrollbar {
    width: 0.375rem;
    height: 0.375rem;
    background-color: transparent;
  }

  body *::-webkit-scrollbar {
    width: 0.375rem;
    height: 0.375rem;
    background-color: transparent;
  }

  ::-webkit-scrollbar-corner {
    background: transparent;
  }

  body::-webkit-scrollbar-track,
  body *::-webkit-scrollbar-track {
    background: #94a3b83a;
  }

  body *::-webkit-scrollbar-track {
    background: transparent;
  }

  body::-webkit-scrollbar-thumb,
  body *::-webkit-scrollbar-thumb {
    background-color: #94a3b83a;
    border: 1px solid transparent;
    border-radius: 0.5rem;
  }
}`;

describe("the playground host scrollbar contract", () => {
  it("carries the frozen host's Firefox scrollbar treatment verbatim", () => {
    expect(hostStylesheet).toContain(FROZEN_FIREFOX_SCROLLBAR_BLOCK);
  });

  it("carries the frozen host's WebKit scrollbar treatment verbatim", () => {
    expect(hostStylesheet).toContain(FROZEN_WEBKIT_SCROLLBAR_BLOCK);
  });
});
