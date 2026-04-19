// @vitest-environment jsdom

import { useSectionRefs } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingSectionSearchFocus,
  clearPendingSectionTextFocus,
  focusOnSectionSearch,
  focusOnSectionTextInput,
  isPendingSectionSearchFocus,
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
    clearPendingSectionSearchFocus(SECTION_ID);
    clearPendingSectionTextFocus(SECTION_ID);
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("retries callable search focus until the search input mounts", () => {
    const retries: FrameRequestCallback[] = [];
    const requestAnimationFrameMock = vi.fn(
      (callback: FrameRequestCallback) => {
        retries.push(callback);
        return 1;
      },
    );
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);

    focusOnSectionSearch(SECTION_ID);

    expect(isPendingSectionSearchFocus(SECTION_ID)).toBe(true);
    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1);

    const search = document.createElement("input");
    search.id = `${SECTION_ID}-search`;
    document.body.appendChild(search);
    const retry = retries[0];
    if (retry) {
      retry(0);
    }

    expect(document.activeElement).toBe(search);
    expect(isPendingSectionSearchFocus(SECTION_ID)).toBe(false);
  });

  it("focuses a mounted callable search input without scheduling a retry", () => {
    const requestAnimationFrameMock = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrameMock);
    const search = document.createElement("input");
    search.id = `${SECTION_ID}-search`;
    document.body.appendChild(search);

    focusOnSectionSearch(SECTION_ID);

    expect(document.activeElement).toBe(search);
    expect(isPendingSectionSearchFocus(SECTION_ID)).toBe(false);
    expect(requestAnimationFrameMock).not.toHaveBeenCalled();
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
