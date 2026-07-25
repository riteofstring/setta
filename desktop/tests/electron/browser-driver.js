/* global CSS, CustomEvent, Event, HTMLButtonElement, HTMLElement, HTMLInputElement, HTMLTextAreaElement, InputEvent, document, window */

(() => {
  function bodyText() {
    return { body: document.body.innerText };
  }

  function buttonByKind(kind, value) {
    if (kind === "aria-label") {
      return document.querySelector(`button[aria-label="${cssEscape(value)}"]`);
    }
    if (kind === "text") {
      return Array.from(document.querySelectorAll("button")).find(
        (candidate) => candidate.textContent?.trim() === value,
      );
    }
    throw new Error(`unsupported button lookup kind: ${kind}`);
  }

  function clickButton({ kind, value }) {
    const button = buttonByKind(kind, value);
    if (!(button instanceof HTMLButtonElement)) {
      return { body: document.body.innerText, clicked: false, reason: "missing-button" };
    }
    if (button.disabled) {
      return { body: document.body.innerText, clicked: false, reason: "disabled-button" };
    }
    button.click();
    return { body: document.body.innerText, clicked: true, reason: "clicked" };
  }

  function dispatchLayoutSnapshot({ trigger }) {
    window.dispatchEvent(
      new CustomEvent("setta:record-layout-snapshot", {
        detail: { trigger },
      }),
    );
    return true;
  }

  function elementValue({ selector }) {
    const element = document.querySelector(selector);
    return { value: "value" in (element ?? {}) ? element.value : null };
  }

  function masterOverlayOpenState() {
    return {
      open: Boolean(document.querySelector('[data-testid="master-overlay"]')),
    };
  }

  function emptyMasterOverlayInteraction() {
    return { decisionText: "", inputId: "", resultKind: "", status: "", transcript: "" };
  }

  function elementText(element) {
    return element?.textContent ?? "";
  }

  function datasetValue(element, key) {
    return element instanceof HTMLElement ? (element.dataset[key] ?? "") : "";
  }

  function queryText(root, selector) {
    return root ? elementText(root.querySelector(selector)) : "";
  }

  function masterOverlayRoutedInteraction() {
    const root = document.querySelector('[data-testid="master-active-interaction"]');
    if (!(root instanceof HTMLElement)) {
      return emptyMasterOverlayInteraction();
    }
    const result = root.querySelector(".setta-master-overlay-result");
    return {
      decisionText: queryText(result, "p"),
      inputId: root.dataset.masterInputId ?? "",
      resultKind: datasetValue(result, "masterResultKind"),
      status: root.dataset.masterRoutingStatus ?? "",
      transcript: queryText(root, '[data-testid="master-active-request"] p'),
    };
  }

  function masterOverlayVoiceButtonState() {
    const button = document.querySelector('[data-testid="master-overlay-voice-capture"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { label: "", ready: false };
    }
    return {
      label: button.getAttribute("aria-label") ?? "",
      ready: !button.disabled,
    };
  }

  function masterOverlayVoiceClick() {
    const button = document.querySelector('[data-testid="master-overlay-voice-capture"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  }

  function setInputValue({ selector, value }) {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
      return false;
    }
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function cssEscape(value) {
    return CSS.escape(String(value));
  }

  globalThis.__settaE2EDriver = {
    ...globalThis.__settaE2EDriver,
    bodyText,
    clickButton,
    dispatchLayoutSnapshot,
    elementValue,
    masterOverlayOpenState,
    masterOverlayRoutedInteraction,
    masterOverlayVoiceButtonState,
    masterOverlayVoiceClick,
    setInputValue,
    version: "setta-e2e-driver-v13",
  };
})();
