/* global CustomEvent, Event, HTMLButtonElement, HTMLElement, HTMLInputElement, HTMLSelectElement, document, window */

(() => {
  const version = "setta-topic-conversation-pane-projection-driver-v10";

  function installTopicConversationPaneProjectionDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      topicConversationPaneProjectionVersion: version,
      topicConversationAskStatus,
      topicConversationCloseOneBoundPane,
      topicConversationCreate,
      topicConversationDenyApproval,
      topicConversationNavigatorState,
      topicConversationOpenBoundPane,
      topicConversationRespondApproval,
      topicConversationShellSpeechCapture,
      topicConversationShellSpeechState,
      topicConversationPresentFromNavigator,
      topicConversationSteer,
      topicConversationStop,
      topicConversationSubmit,
      topicConversationSurfaceState,
      topicConversationSurfaceStates,
      topicConversationTogglePaneMaximized,
      topicConversationVoiceCapture,
      topicConversationWorkspaceOpenState,
    });
  }

  function topicConversationWorkspaceOpenState({ workspaceId }) {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "Open project folder",
    );
    return {
      expectedWorkspaceId: workspaceId,
      openButtonReady: button instanceof HTMLButtonElement && !button.disabled,
      workspaceId: area instanceof HTMLElement ? (area.dataset.workspaceId ?? "") : "",
    };
  }

  function topicConversationSurfaceState({ workspaceId }) {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const surface = document.querySelector('[data-testid="easy-button-surface"]');
    const helper = surface?.querySelector('[data-testid="easy-button-helper"]');
    const error = surface?.querySelector('[data-testid="easy-button-error"]');
    const input = surface?.querySelector('[data-testid="easy-button-input"]');
    return {
      captureState: datasetValue(surface, "easyButtonCapture"),
      conversationId: datasetValue(surface, "conversationId"),
      errorText: elementText(error),
      expectedWorkspaceId: workspaceId,
      helperText: elementText(helper),
      inputDisabled: inputIsDisabled(input),
      projectionStatus: datasetValue(surface, "easyButtonProjection"),
      speechState: datasetValue(surface, "easyButtonSpeech"),
      state: datasetValue(surface, "easyButtonState"),
      workspaceId: datasetValue(area, "workspaceId"),
    };
  }

  function topicConversationSurfaceStates() {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return {
      surfaces: Array.from(document.querySelectorAll('[data-testid="easy-button-surface"]')).map(
        (surface) => {
          const host = surface.closest('[data-testid="workspace-pane-host"]');
          const helper = surface.querySelector('[data-testid="easy-button-helper"]');
          const error = surface.querySelector('[data-testid="easy-button-error"]');
          const input = surface.querySelector('[data-testid="easy-button-input"]');
          const agentText = surface.querySelector('[data-testid="easy-button-agent-text"]');
          const approval = surface.querySelector('[data-testid="easy-button-approval"]');
          const artifacts = surface.querySelectorAll(
            '[data-testid="easy-button-artifacts"] [data-artifact-id]',
          );
          const summary = surface.querySelector('[data-testid="easy-button-summary-text"]');
          const statusQuestion = surface.querySelector(".easy-button-status-question");
          const statusReply = surface.querySelector(".easy-button-status-reply-text");
          const voiceCapture = surface.querySelector('[data-testid="easy-button-voice-capture"]');
          return {
            agentText: elementText(agentText),
            approvalId: datasetValue(approval, "approvalId"),
            artifactCount: artifacts.length,
            artifactText: Array.from(artifacts).map(elementText).join("\n"),
            captureState: datasetValue(surface, "easyButtonCapture"),
            captureScope: datasetValue(surface, "easyButtonCaptureScope"),
            conversationId: datasetValue(surface, "conversationId"),
            errorText: elementText(error),
            helperText: elementText(helper),
            inputDisabled: inputIsDisabled(input),
            paneId: datasetValue(host, "paneId"),
            paletteId: datasetValue(surface, "conversationPalette"),
            playbackScope: datasetValue(surface, "easyButtonPlaybackScope"),
            playbackState: datasetValue(surface, "easyButtonPlayback"),
            projectionStatus: datasetValue(surface, "easyButtonProjection"),
            queueCount: Number(datasetValue(surface, "easyButtonQueueCount") || "0"),
            speechState: datasetValue(surface, "easyButtonSpeech"),
            state: datasetValue(surface, "easyButtonState"),
            status: datasetValue(surface, "easyButtonStatus"),
            statusQuestion: elementText(statusQuestion),
            statusReplyText: elementText(statusReply),
            summaryText: elementText(summary),
            speechActivityText: elementText(
              surface.querySelector('[data-testid="easy-button-speech-activity"]'),
            ),
            title: surface.getAttribute("aria-label") ?? "",
            voiceCaptureLabel: voiceCapture?.getAttribute("aria-label") ?? "",
            voiceCaptureAvailable:
              voiceCapture instanceof HTMLButtonElement && !voiceCapture.disabled,
          };
        },
      ),
      workspaceId: datasetValue(area, "workspaceId"),
    };
  }

  function topicConversationCreate({ title }) {
    const form = document.querySelector('[data-testid="conversation-create-form"]');
    const input = form?.querySelector('input[aria-label="New topic title"]');
    if (!(input instanceof HTMLInputElement) || input.disabled || !input.form) {
      return { created: false, title };
    }
    setInputValue(input, title);
    input.form.requestSubmit();
    return { created: true, title };
  }

  function topicConversationSubmit({ conversationId, text }) {
    const surface = conversationSurface(conversationId);
    const input = surface?.querySelector('[data-testid="easy-button-input"]');
    if (!(input instanceof HTMLInputElement) || input.disabled || !input.form) {
      return { conversationId, submitted: false };
    }
    setInputValue(input, text);
    input.form.requestSubmit();
    return { conversationId, submitted: true };
  }

  function topicConversationVoiceCapture({ conversationId }) {
    const button = conversationSurface(conversationId)?.querySelector(
      '[data-testid="easy-button-voice-capture"]',
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { conversationId, requested: false };
    }
    button.click();
    return { conversationId, requested: true };
  }

  function topicConversationShellSpeechCapture() {
    const button = document.querySelector('[data-testid="shell-speech-capture-control"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { clicked: false };
    }
    button.click();
    return { clicked: true };
  }

  function topicConversationShellSpeechState() {
    const status = document.querySelector('[data-testid="shell-speech-status"]');
    const capture = status?.querySelector('[data-testid="shell-speech-capture-control"]');
    const stop = status?.querySelector('[data-testid="shell-speech-stop"]');
    return {
      captureAvailable: capture instanceof HTMLButtonElement && !capture.disabled,
      captureLabel: capture?.getAttribute("aria-label") ?? "",
      captureState: datasetValue(status, "speechCapture"),
      label: elementText(status?.querySelector('[data-testid="shell-speech-label"]')),
      playbackState: datasetValue(status, "speechPlayback"),
      sourceConversationId: datasetValue(status, "speechSourceConversation"),
      stopAvailable: stop instanceof HTMLButtonElement && !stop.disabled,
    };
  }

  function topicConversationAskStatus({ conversationId, question }) {
    const surface = conversationSurface(conversationId);
    const input = surface?.querySelector('[data-testid="easy-button-input"]');
    const button = surface?.querySelector('[data-testid="easy-button-status-request"]');
    if (
      !(input instanceof HTMLInputElement) ||
      input.disabled ||
      !(button instanceof HTMLButtonElement)
    ) {
      return { asked: false, conversationId };
    }
    setInputValue(input, question);
    if (button.disabled) {
      return { asked: false, conversationId };
    }
    button.click();
    return { asked: true, conversationId };
  }

  function topicConversationSteer({ conversationId, text }) {
    const surface = conversationSurface(conversationId);
    const input = surface?.querySelector('[data-testid="easy-button-input"]');
    const button = surface?.querySelector('[data-testid="easy-button-steer"]');
    if (
      !(input instanceof HTMLInputElement) ||
      input.disabled ||
      !(button instanceof HTMLButtonElement)
    ) {
      return { conversationId, steered: false };
    }
    setInputValue(input, text);
    if (button.disabled) {
      return { conversationId, steered: false };
    }
    button.click();
    return { conversationId, steered: true };
  }

  function topicConversationStop({ conversationId }) {
    const button = conversationSurface(conversationId)?.querySelector(
      '[data-testid="easy-button-control"]',
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { conversationId, stopped: false };
    }
    button.click();
    return { conversationId, stopped: true };
  }

  function topicConversationRespondApproval({ answer, conversationId }) {
    const approval = conversationSurface(conversationId)?.querySelector(
      '[data-testid="easy-button-approval"]',
    );
    const input = approval?.querySelector("input, select");
    if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
      setFormControlValue(input, answer);
    }
    const button = Array.from(approval?.querySelectorAll("button") ?? []).find(
      (candidate) => candidate.textContent?.trim() === (input ? "Answer" : "Approve"),
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { answered: false, conversationId };
    }
    button.click();
    return { answered: true, conversationId };
  }

  function topicConversationDenyApproval({ conversationId }) {
    const approval = conversationSurface(conversationId)?.querySelector(
      '[data-testid="easy-button-approval"]',
    );
    const button = Array.from(approval?.querySelectorAll("button") ?? []).find(
      (candidate) => candidate.textContent?.trim() === "Deny",
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { conversationId, denied: false };
    }
    button.click();
    return { conversationId, denied: true };
  }

  function topicConversationOpenBoundPane({ conversationId }) {
    window.dispatchEvent(
      new CustomEvent("setta:workspace-open-pane-request", {
        detail: {
          easyButtonConfig: { conversationId },
          subtitle: "topic conversation duplicate view",
          surfaceKind: "easy-button",
          title: "Topic conversation copy",
          tone: "cyan",
          widthSpec: { unit: "proportion", value: 1 },
        },
      }),
    );
    return { conversationId, requested: true };
  }

  function topicConversationNavigatorState({ conversationId }) {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const rows = Array.from(
      document.querySelectorAll('[data-testid="conversation-navigator-item"]'),
    ).filter((row) => datasetValue(row, "conversationId") === conversationId);
    const openViews = Array.from(
      document.querySelectorAll('[data-testid="easy-button-surface"]'),
    ).filter((surface) => datasetValue(surface, "conversationId") === conversationId);
    return {
      conversationId: rows.length === 1 ? datasetValue(rows[0], "conversationId") : "",
      focusedPaneId:
        document
          .querySelector('[data-testid="workspace-pane-host"][data-focused="true"]')
          ?.getAttribute("data-pane-id") ?? "",
      label: rows[0]?.getAttribute("aria-label") ?? "",
      maximizedPaneId: datasetValue(area, "maximizedPaneId"),
      openViewCount: openViews.length,
      rowCount: rows.length,
    };
  }

  function topicConversationPresentFromNavigator({ conversationId }) {
    const row = Array.from(
      document.querySelectorAll('[data-testid="conversation-navigator-item"]'),
    ).find((candidate) => datasetValue(candidate, "conversationId") === conversationId);
    if (!(row instanceof HTMLButtonElement)) {
      return { clicked: false, conversationId };
    }
    row.click();
    return { clicked: true, conversationId };
  }

  function topicConversationTogglePaneMaximized({ paneId }) {
    const host = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]')).find(
      (candidate) => datasetValue(candidate, "paneId") === paneId,
    );
    const button = host?.querySelector('[data-workspace-pane-action="maximize"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { clicked: false, paneId };
    }
    button.click();
    return { clicked: true, paneId };
  }

  function topicConversationCloseOneBoundPane({ conversationId }) {
    const surface = Array.from(
      document.querySelectorAll('[data-testid="easy-button-surface"]'),
    ).find((candidate) => datasetValue(candidate, "conversationId") === conversationId);
    const paneId = datasetValue(surface?.closest('[data-testid="workspace-pane-host"]'), "paneId");
    const button = Array.from(
      document.querySelectorAll('[data-workspace-pane-action="close"]'),
    ).find((candidate) => datasetValue(candidate, "paneId") === paneId);
    if (!(button instanceof HTMLButtonElement)) {
      return { clicked: false, conversationId, paneId };
    }
    button.click();
    return { clicked: true, conversationId, paneId };
  }

  function datasetValue(element, key) {
    return element instanceof HTMLElement ? (element.dataset[key] ?? "") : "";
  }

  function elementText(element) {
    return element?.textContent ?? "";
  }

  function inputIsDisabled(element) {
    return element instanceof HTMLInputElement && element.disabled;
  }

  function conversationSurface(conversationId) {
    return Array.from(document.querySelectorAll('[data-testid="easy-button-surface"]')).find(
      (surface) => datasetValue(surface, "conversationId") === conversationId,
    );
  }

  function setInputValue(input, value) {
    setFormControlValue(input, value);
  }

  function setFormControlValue(input, value) {
    const prototype =
      input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) {
      throw new Error("native input value setter is unavailable");
    }
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  installTopicConversationPaneProjectionDriver();
})();
