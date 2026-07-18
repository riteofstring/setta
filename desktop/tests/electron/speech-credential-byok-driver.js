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
    speechCredentialOpenSettingsPane,
    speechCredentialOpenVoicesSubtab,
  });

  function speechCredentialOpenSettingsPane() {
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
      cardReady: isPresent(card),
      inputHasValue: credentialInputHasValue(input),
      inputType: credentialInputType(input),
      inputVisible: isPresent(input),
      providerLabel: providerLabel(card),
      statusLabel: credentialStatusLabel(card),
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

  function credentialActionState(card) {
    const buttons = Array.from(card?.querySelectorAll("button") ?? []);
    const save = buttonState(buttons, "Save and verify");
    const replace = buttonState(buttons, "Replace");
    const disconnect = buttonState(buttons, "Disconnect");
    return {
      disconnectVisible: disconnect.visible,
      replaceVisible: replace.visible,
      saveEnabled: save.enabled,
    };
  }

  function credentialStatusLabel(card) {
    const status = card?.querySelector('[data-testid="openai-voice-connection-status"]');
    return status?.textContent?.trim() ?? "";
  }

  function providerLabel(card) {
    return card?.innerText.includes("OpenAI") ? "openai" : "";
  }

  function buttonState(buttons, label) {
    const button = buttons.find((candidate) => candidate.textContent?.trim() === label);
    return {
      enabled: button instanceof HTMLButtonElement && !button.disabled,
      visible: button instanceof HTMLButtonElement,
    };
  }
})();
