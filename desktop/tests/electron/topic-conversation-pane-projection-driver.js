/* global CustomEvent, HTMLButtonElement, HTMLElement, HTMLInputElement, document, window */

(() => {
  const version = "setta-topic-conversation-pane-projection-driver-v2";

  function installTopicConversationPaneProjectionDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      topicConversationPaneProjectionVersion: version,
      topicConversationOpenBoundPane,
      topicConversationSurfaceState,
      topicConversationSurfaceStates,
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
          return {
            captureState: datasetValue(surface, "easyButtonCapture"),
            conversationId: datasetValue(surface, "conversationId"),
            errorText: elementText(error),
            helperText: elementText(helper),
            inputDisabled: inputIsDisabled(input),
            paneId: datasetValue(host, "paneId"),
            projectionStatus: datasetValue(surface, "easyButtonProjection"),
            speechState: datasetValue(surface, "easyButtonSpeech"),
            state: datasetValue(surface, "easyButtonState"),
          };
        },
      ),
      workspaceId: datasetValue(area, "workspaceId"),
    };
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

  function datasetValue(element, key) {
    return element instanceof HTMLElement ? (element.dataset[key] ?? "") : "";
  }

  function elementText(element) {
    return element?.textContent ?? "";
  }

  function inputIsDisabled(element) {
    return element instanceof HTMLInputElement && element.disabled;
  }

  installTopicConversationPaneProjectionDriver();
})();
