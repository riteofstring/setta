/* global Event, HTMLButtonElement, HTMLInputElement, HTMLSelectElement, document, window */

(() => {
  const version = "setta-topic-conversation-presentation-configuration-driver-v1";
  const driver = globalThis.__settaE2EDriver;
  if (!driver) {
    throw new Error("base Setta E2E driver is not installed");
  }
  Object.assign(driver, {
    presentationConfigurationConversationState,
    presentationConfigurationFindTopic,
    presentationConfigurationGlobalState,
    presentationConfigurationOpenConversation,
    presentationConfigurationOpenGlobalTab,
    presentationConfigurationOpenSettings,
    presentationConfigurationReadConversation,
    presentationConfigurationReadGlobal,
    presentationConfigurationSaveConversation,
    presentationConfigurationSaveGlobal,
    presentationConfigurationSelectGlobal,
    presentationConfigurationSetConversation,
    presentationConfigurationUpdateNarratorVoice,
    topicConversationPresentationConfigurationVersion: version,
  });

  function presentationConfigurationOpenSettings() {
    if (document.querySelector("#settings-subtab-speech")) {
      return { opened: false, ready: true };
    }
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "Open settings",
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { opened: false, ready: false };
    }
    button.click();
    return { opened: true, ready: false };
  }

  function presentationConfigurationOpenGlobalTab() {
    const button = document.querySelector("#settings-subtab-speech");
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  }

  function presentationConfigurationGlobalState() {
    const form = document.querySelector('[data-testid="presentation-configuration-settings"]');
    if (!form) {
      return unavailableGlobalState();
    }
    const master = configurationCard(form, "Master voice");
    const narrator = configurationCard(form, "Default narrator voice");
    return {
      catalogStatus: elementText(form.querySelector('[role="status"]')),
      masterOptionCount: optionCount(master.select),
      masterSaveEnabled: buttonEnabled(master.save),
      masterSelection: selectValue(master.select),
      narratorDefaultOptionCount: optionCount(narrator.select),
      narratorDefaultSaveEnabled: buttonEnabled(narrator.save),
      narratorDefaultSelection: selectValue(narrator.select),
      ready: true,
    };
  }

  function unavailableGlobalState() {
    return {
      catalogStatus: "",
      masterOptionCount: 0,
      masterSaveEnabled: false,
      masterSelection: "",
      narratorDefaultOptionCount: 0,
      narratorDefaultSaveEnabled: false,
      narratorDefaultSelection: "",
      ready: false,
    };
  }

  function presentationConfigurationSelectGlobal({ target, value }) {
    const form = document.querySelector('[data-testid="presentation-configuration-settings"]');
    const label = target === "master" ? "Master voice" : "Default narrator voice";
    const card = configurationCard(form, label);
    return { changed: setSelectValue(card.select, value), target, value };
  }

  function presentationConfigurationSaveGlobal({ target }) {
    const form = document.querySelector('[data-testid="presentation-configuration-settings"]');
    const label = target === "master" ? "Master voice" : "Default narrator voice";
    const button = configurationCard(form, label).save;
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { saved: false, target };
    }
    button.click();
    return { saved: true, target };
  }

  async function presentationConfigurationReadGlobal() {
    const speech = window.setta.speech;
    if (!speech.readMasterVoiceSelection || !speech.readNarratorVoiceDefault) {
      throw new Error("global voice configuration API is unavailable");
    }
    const [master, narratorDefault] = await Promise.all([
      speech.readMasterVoiceSelection(),
      speech.readNarratorVoiceDefault(),
    ]);
    return { master, narratorDefault };
  }

  function presentationConfigurationOpenConversation({ conversationId }) {
    const details = conversationConfiguration(conversationId);
    if (!details) {
      return { conversationId, opened: false };
    }
    details.open = true;
    details.dispatchEvent(new Event("toggle"));
    return { conversationId, opened: true };
  }

  function presentationConfigurationConversationState({ conversationId }) {
    const surface = conversationSurface(conversationId);
    const details = conversationConfiguration(conversationId);
    if (!details) {
      return unavailableConversationState(conversationId);
    }
    const palette = details.querySelector('select[aria-label="Conversation color selection"]');
    const voice = details.querySelector(
      'select[aria-label="Conversation narrator voice selection"]',
    );
    const speech = details.querySelector('input[aria-label="Speak narrator updates"]');
    const save = Array.from(details.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Save",
    );
    return {
      conversationId,
      narratorSpeechEnabled: speech instanceof HTMLInputElement && speech.checked,
      narratorVoiceOptionCount: optionCount(voice),
      narratorVoiceSelection: selectValue(voice),
      open: details.open,
      paletteOptionCount: optionCount(palette),
      paletteSelection: selectValue(palette),
      ready: true,
      saveEnabled: buttonEnabled(save),
      surfacePalette: surface?.dataset.conversationPalette ?? "",
    };
  }

  function unavailableConversationState(conversationId) {
    return {
      conversationId,
      narratorSpeechEnabled: false,
      narratorVoiceOptionCount: 0,
      narratorVoiceSelection: "",
      open: false,
      paletteOptionCount: 0,
      paletteSelection: "",
      ready: false,
      saveEnabled: false,
      surfacePalette: "",
    };
  }

  function presentationConfigurationSetConversation({
    conversationId,
    narratorSpeechEnabled,
    narratorVoiceSelection,
    paletteSelection,
  }) {
    const details = conversationConfiguration(conversationId);
    if (!details) {
      return { changed: false, conversationId };
    }
    const palette = details.querySelector('select[aria-label="Conversation color selection"]');
    const voice = details.querySelector(
      'select[aria-label="Conversation narrator voice selection"]',
    );
    const speech = details.querySelector('input[aria-label="Speak narrator updates"]');
    const paletteChanged = setSelectValue(palette, paletteSelection);
    const voiceChanged = setSelectValue(voice, narratorVoiceSelection);
    const speechChanged = setCheckboxValue(speech, narratorSpeechEnabled);
    return {
      changed: paletteChanged || voiceChanged || speechChanged,
      conversationId,
      paletteChanged,
      speechChanged,
      voiceChanged,
    };
  }

  function presentationConfigurationSaveConversation({ conversationId }) {
    const details = conversationConfiguration(conversationId);
    const button = Array.from(details?.querySelectorAll("button") ?? []).find(
      (candidate) => candidate.textContent?.trim() === "Save",
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { conversationId, saved: false };
    }
    button.click();
    return { conversationId, saved: true };
  }

  async function presentationConfigurationReadConversation({ conversationId, workspaceId }) {
    return window.setta.conversations.read({ conversationId, workspaceId });
  }

  async function presentationConfigurationUpdateNarratorVoice({
    conversationId,
    selection,
    workspaceId,
  }) {
    const snapshot = await window.setta.conversations.read({ conversationId, workspaceId });
    const profile = snapshot.presentationProfile;
    return window.setta.conversations.updatePresentation({
      conversationId,
      settings: {
        narratorSpeechEnabled: profile.narratorSpeechEnabled,
        narratorVoiceSelection: selection,
        paletteSelection: {
          requestedPaletteId: profile.requestedPaletteId,
          selection: profile.paletteSelection,
        },
      },
      workspaceId,
    });
  }

  async function presentationConfigurationFindTopic({ title, workspaceId }) {
    const page = await window.setta.conversations.list({
      cursor: null,
      limit: 100,
      query: title,
      workspaceId,
    });
    const item = page.items.find((candidate) => candidate.conversation.title === title);
    if (!item) {
      return { found: false, snapshot: null };
    }
    const snapshot = await window.setta.conversations.read({
      conversationId: item.conversation.id,
      workspaceId,
    });
    return { found: true, snapshot };
  }

  function configurationCard(form, label) {
    const fieldset = Array.from(form?.querySelectorAll("fieldset") ?? []).find(
      (candidate) => candidate.querySelector("h3")?.textContent?.trim() === label,
    );
    return {
      save: Array.from(fieldset?.querySelectorAll("button") ?? []).find(
        (candidate) => candidate.textContent?.trim() === "Save",
      ),
      select: fieldset?.querySelector("select") ?? null,
    };
  }

  function conversationConfiguration(conversationId) {
    // The config now lives in the pane title bar (portaled out of the surface),
    // so look it up on the host rather than inside the surface element.
    const host = conversationSurface(conversationId)?.closest(
      '[data-testid="workspace-pane-host"]',
    );
    return host?.querySelector('[data-testid="conversation-presentation-configuration"]') ?? null;
  }

  function conversationSurface(conversationId) {
    return Array.from(document.querySelectorAll('[data-testid="easy-button-surface"]')).find(
      (candidate) => candidate.getAttribute("data-conversation-id") === conversationId,
    );
  }

  function setSelectValue(element, value) {
    if (!(element instanceof HTMLSelectElement) || element.disabled) {
      return false;
    }
    if (!Array.from(element.options).some((option) => option.value === value)) {
      return false;
    }
    if (element.value === value) {
      return false;
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (!setter) {
      return false;
    }
    setter.call(element, value);
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  function setCheckboxValue(element, value) {
    if (!(element instanceof HTMLInputElement) || element.disabled || element.checked === value) {
      return false;
    }
    element.click();
    return element.checked === value;
  }

  function selectValue(element) {
    return element instanceof HTMLSelectElement ? element.value : "";
  }

  function optionCount(element) {
    return element instanceof HTMLSelectElement ? element.options.length : 0;
  }

  function buttonEnabled(element) {
    return element instanceof HTMLButtonElement && !element.disabled;
  }

  function elementText(element) {
    return element?.textContent?.trim() ?? "";
  }
})();
