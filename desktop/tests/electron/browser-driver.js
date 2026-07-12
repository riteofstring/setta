/* global CSS, CustomEvent, Event, HTMLButtonElement, HTMLInputElement, HTMLTextAreaElement, InputEvent, document, window */

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

  function clickButtonContainingText({ text }) {
    const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
      candidate.innerText.includes(text),
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { body: document.body.innerText, clicked: false, reason: "missing-button" };
    }
    if (button.disabled) {
      return { body: document.body.innerText, clicked: false, reason: "disabled-button" };
    }
    button.click();
    return { body: document.body.innerText, clicked: true, reason: "clicked" };
  }

  function clickButtonContainingTextByRole({ role, text }) {
    const button = Array.from(document.querySelectorAll(`button[role="${cssEscape(role)}"]`)).find(
      (candidate) => candidate.innerText.includes(text),
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { body: document.body.innerText, clicked: false };
    }
    button.click();
    return { body: document.body.innerText, clicked: true };
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
    clickButtonContainingText,
    clickButtonContainingTextByRole,
    dispatchLayoutSnapshot,
    elementValue,
    setInputValue,
    version: "setta-e2e-driver-v12",
  };
})();
