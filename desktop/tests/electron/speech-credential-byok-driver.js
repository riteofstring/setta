/* global HTMLButtonElement, HTMLElement, HTMLInputElement, document */

(() => {
  const version = "setta-speech-credential-byok-driver-v1";
  const driver = globalThis.__settaE2EDriver;
  if (!driver) {
    throw new Error("base Setta E2E driver is not installed");
  }

  const credentialCardSelector = '[data-testid="openai-voice-connection-card"]';
  const apiKeyInputSelector = 'input[aria-label="OpenAI API key"]';

  Object.assign(driver, {
    speechCredentialByokVersion: version,
    speechCredentialCardState,
    speechCredentialOpenSettingsPage,
    speechCredentialOpenVoicesSubtab,
  });

  function speechCredentialOpenSettingsPage() {
    if (document.querySelector("#settings-subtab-speech")) {
      return { ready: true, reason: "already-open" };
    }
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "Open settings",
    );
    if (!(button instanceof HTMLButtonElement)) {
      return { ready: false, reason: "missing-settings-button" };
    }
    if (button.disabled) {
      return { ready: false, reason: "settings-button-disabled" };
    }
    button.click();
    return { ready: false, reason: "opened-settings" };
  }

  function speechCredentialOpenVoicesSubtab() {
    const button = document.querySelector("#settings-subtab-speech");
    if (!(button instanceof HTMLButtonElement)) {
      return { ready: false, reason: "missing-voices-tab" };
    }
    if (button.getAttribute("aria-selected") !== "true") {
      button.click();
      return { ready: false, reason: "selected-voices-tab" };
    }
    return {
      ready: Boolean(document.querySelector(credentialCardSelector)),
      reason: "voices-tab-active",
    };
  }

  function speechCredentialCardState() {
    const card = credentialCard();
    const input = credentialInput(card);
    const actions = credentialActionState(card);
    return {
      ...actions,
      activeRuntimeStatusText: activeRuntimeStatusText(card),
      cardReady: isPresent(card),
      inputHasValue: credentialInputHasValue(input),
      inputType: credentialInputType(input),
      inputValueLength: credentialInputValueLength(input),
      inputVisible: isPresent(input),
      providerLabel: providerLabel(card),
      statusDetail: credentialStatusDetail(card),
      statusLabel: credentialStatusLabel(card),
      statusSummary: credentialStatusSummary(card),
    };
  }

  function isPresent(value) {
    return value !== null;
  }

  function credentialCard() {
    const card = document.querySelector(credentialCardSelector);
    return card instanceof HTMLElement ? card : null;
  }

  function credentialInput(card) {
    const input = card?.querySelector(apiKeyInputSelector);
    return input instanceof HTMLInputElement ? input : null;
  }

  function credentialInputHasValue(input) {
    return input !== null && input.value.length > 0;
  }

  function credentialInputType(input) {
    return input?.type ?? "";
  }

  function credentialInputValueLength(input) {
    return input?.value.length ?? 0;
  }

  function credentialActionState(card) {
    const buttons = Array.from(card?.querySelectorAll("button") ?? []);
    const save = buttonState(buttons, "Save and verify");
    const replace = buttonState(buttons, "Replace");
    const disconnect = buttonState(buttons, "Disconnect");
    const cancel = buttonState(buttons, "Cancel");
    return {
      cancelVisible: cancel.visible,
      disconnectEnabled: disconnect.enabled,
      disconnectVisible: disconnect.visible,
      replaceEnabled: replace.enabled,
      replaceVisible: replace.visible,
      saveEnabled: save.enabled,
      saveVisible: save.visible,
    };
  }

  function credentialStatusLabel(card) {
    const status = card?.querySelector('[data-testid="openai-voice-connection-status"]');
    return status?.textContent?.trim() ?? "";
  }

  function providerLabel(card) {
    return card?.innerText.includes("OpenAI") ? "openai" : "";
  }

  function credentialStatusSummary(card) {
    const paragraphs = credentialStatusParagraphs(card);
    return paragraphs[0]?.textContent?.trim() ?? "";
  }

  function credentialStatusDetail(card) {
    const paragraphs = credentialStatusParagraphs(card);
    return paragraphs[1]?.textContent?.trim() ?? "";
  }

  function credentialStatusParagraphs(card) {
    const header = card?.querySelector("header");
    const statusCopy = header?.nextElementSibling;
    if (!(statusCopy instanceof HTMLElement)) {
      return [];
    }
    return Array.from(statusCopy.querySelectorAll("p")).filter(
      (paragraph) => paragraph.parentElement === statusCopy,
    );
  }

  function activeRuntimeStatusText(card) {
    const active = card?.querySelector('[data-testid="active-runtime-voice-status"]');
    return active instanceof HTMLElement ? active.innerText.trim() : "";
  }

  function buttonState(buttons, label) {
    const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
    return {
      enabled: button instanceof HTMLButtonElement && !button.disabled,
      visible: button instanceof HTMLButtonElement,
    };
  }
})();
