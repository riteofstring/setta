// @vitest-environment jsdom

import { useSectionRefs } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingSectionTextFocus,
  focusOnSectionTextInput,
  isPendingSectionTextFocus,
} from "./tabbingLogic";

const SECTION_ID = "section-1";

function mountSectionRef(markup: string) {
  const ref = document.createElement("div");
  ref.innerHTML = markup;
  document.body.appendChild(ref);
  useSectionRefs.setState(() => ({
    selfOnly: { [SECTION_ID]: ref },
    withNested: {},
  }));
  return ref;
}

describe("tabbingLogic", () => {
  beforeEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    clearPendingSectionTextFocus(SECTION_ID);
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("schedules a retry when the section text input is not mounted yet", () => {
    const requestAnimationFrameMock = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
    mountSectionRef(`<div class="section-main"></div>`);

    focusOnSectionTextInput(SECTION_ID);

    expect(isPendingSectionTextFocus(SECTION_ID)).toBe(true);
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);
  });

  it("focuses a mounted section editor and clears pending state", () => {
    const requestAnimationFrameMock = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
    const ref = mountSectionRef(`
      <div data-section-main-editor>
        <div contenteditable="true" tabindex="0">hello</div>
      </div>
    `);
    const editor = ref.querySelector('[contenteditable="true"]');

    focusOnSectionTextInput(SECTION_ID);

    expect(document.activeElement).toBe(editor);
    expect(isPendingSectionTextFocus(SECTION_ID)).toBe(false);
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });

  it("keeps terminal sections pending so the terminal hook can finish focus", () => {
    const requestAnimationFrameMock = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
    const ref = mountSectionRef(`
      <div data-section-main-editor>
        <div class="xterm">
          <textarea></textarea>
        </div>
      </div>
    `);
    const terminalInput = ref.querySelector("textarea");

    focusOnSectionTextInput(SECTION_ID);

    expect(document.activeElement).toBe(terminalInput);
    expect(isPendingSectionTextFocus(SECTION_ID)).toBe(true);
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
  });
});
