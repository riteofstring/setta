import { useSectionRefs } from "state/definitions";

const pendingSectionSearchFocus = new Set<string>();
const pendingSectionTextFocus = new Set<string>();
const TERMINAL_INPUT_SELECTOR = ".xterm-helper-textarea, .xterm textarea";
const TERMINAL_INPUT_SELECTORS = [".xterm-helper-textarea", ".xterm textarea"];
const SECTION_TEXT_INPUT_SELECTORS = [
  `[data-section-main-editor] .cm-content`,
  `[data-section-main-editor] [contenteditable="true"]`,
  ...TERMINAL_INPUT_SELECTORS.map(
    (selector) => `[data-section-main-editor] ${selector}`,
  ),
  ".section-full-no-title .cm-content",
  '.section-full-no-title [contenteditable="true"]',
  ".section-main .cm-content",
  '.section-main [contenteditable="true"]',
  ...TERMINAL_INPUT_SELECTORS,
  `[contenteditable="true"]`,
  ".cm-content",
];
const MAX_SECTION_SEARCH_FOCUS_ATTEMPTS = 60;
const MAX_SECTION_TEXT_FOCUS_ATTEMPTS = 240;

export function isPendingSectionSearchFocus(sectionId: string) {
  return pendingSectionSearchFocus.has(sectionId);
}

export function clearPendingSectionSearchFocus(sectionId: string) {
  pendingSectionSearchFocus.delete(sectionId);
}

export function isPendingSectionTextFocus(sectionId: string) {
  return pendingSectionTextFocus.has(sectionId);
}

export function clearPendingSectionTextFocus(sectionId: string) {
  pendingSectionTextFocus.delete(sectionId);
}

function beginSectionTextFocus(sectionId: string, attempt: number): boolean {
  if (attempt > 0) {
    return true;
  }
  if (pendingSectionTextFocus.has(sectionId)) {
    return false;
  }
  pendingSectionTextFocus.add(sectionId);
  return true;
}

function beginSectionSearchFocus(sectionId: string, attempt: number): boolean {
  if (attempt > 0) {
    return true;
  }
  if (pendingSectionSearchFocus.has(sectionId)) {
    return false;
  }
  pendingSectionSearchFocus.add(sectionId);
  return true;
}

function scheduleSectionSearchRetry(sectionId: string, attempt: number) {
  if (attempt >= MAX_SECTION_SEARCH_FOCUS_ATTEMPTS) {
    clearPendingSectionSearchFocus(sectionId);
    return;
  }
  requestAnimationFrame(() => focusOnSectionSearch(sectionId, attempt + 1));
}

export function focusOnSectionSearch(sectionId: string, attempt = 0) {
  if (!beginSectionSearchFocus(sectionId, attempt)) {
    return;
  }
  const searchInput = document.getElementById(`${sectionId}-search`);
  if (!(searchInput instanceof HTMLElement)) {
    scheduleSectionSearchRetry(sectionId, attempt);
    return;
  }
  searchInput.focus({ preventScroll: true });
  clearPendingSectionSearchFocus(sectionId);
}

function getSectionFocusRef(sectionId: string): HTMLElement | null {
  const refs = useSectionRefs.getState();
  return refs.selfOnly[sectionId] ?? refs.withNested[sectionId] ?? null;
}

function hasRetainedSectionFocus(ref: HTMLElement | null): boolean {
  const activeElement = document.activeElement;
  return (
    ref instanceof HTMLElement &&
    activeElement instanceof HTMLElement &&
    ref.contains(activeElement)
  );
}

function tryFocusSectionTextInput(
  sectionId: string,
  ref: HTMLElement | null,
): boolean {
  const focusTarget = getSectionTextInputTarget(ref);
  if (!(focusTarget instanceof HTMLElement)) {
    return false;
  }
  focusTarget.focus({ preventScroll: true });
  if (!hasRetainedSectionFocus(ref)) {
    return false;
  }
  if (!focusTarget.matches(TERMINAL_INPUT_SELECTOR)) {
    clearPendingSectionTextFocus(sectionId);
  }
  return true;
}

function shouldAbortSectionTextFocusRetry(
  attempt: number,
  ref: HTMLElement | null,
): boolean {
  if (attempt === 0 || !(ref instanceof HTMLElement)) {
    return false;
  }
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLElement &&
    !ref.contains(activeElement) &&
    activeElement !== document.body &&
    activeElement !== document.documentElement
  );
}

function scheduleSectionTextInputRetry(sectionId: string, attempt: number) {
  if (attempt >= MAX_SECTION_TEXT_FOCUS_ATTEMPTS) {
    clearPendingSectionTextFocus(sectionId);
    return;
  }
  requestAnimationFrame(() => focusOnSectionTextInput(sectionId, attempt + 1));
}

export function focusOnSectionTextInput(sectionId: string, attempt = 0) {
  if (!beginSectionTextFocus(sectionId, attempt)) {
    return;
  }
  const ref = getSectionFocusRef(sectionId);
  if (tryFocusSectionTextInput(sectionId, ref)) {
    return;
  }
  if (shouldAbortSectionTextFocusRetry(attempt, ref)) {
    clearPendingSectionTextFocus(sectionId);
    return;
  }
  scheduleSectionTextInputRetry(sectionId, attempt);
}

function getSectionTextInputTarget(
  ref: HTMLElement | null,
): HTMLElement | null {
  if (!ref) {
    return null;
  }
  for (const selector of SECTION_TEXT_INPUT_SELECTORS) {
    const target = ref.querySelector(selector);
    if (target instanceof HTMLElement) {
      return target;
    }
  }
  return null;
}
