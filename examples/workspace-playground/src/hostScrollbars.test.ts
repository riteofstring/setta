import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hostStylesheet = readFileSync(
  new URL("./index.css", import.meta.url),
  "utf8",
);

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
