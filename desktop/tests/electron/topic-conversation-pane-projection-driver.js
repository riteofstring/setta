/* global CustomEvent, Event, HTMLButtonElement, HTMLElement, HTMLInputElement, HTMLSelectElement, MutationObserver, document, window */

(() => {
  const version = "setta-topic-conversation-pane-projection-driver-v28";

  function installTopicConversationPaneProjectionDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      topicConversationPaneProjectionVersion: version,
      topicConversationArchiveFromNavigator,
      topicConversationCloseOneBoundPane,
      topicConversationDenyApproval,
      topicConversationEndSide,
      topicConversationFirstRunState,
      topicConversationInstallCaptureTimingObserver,
      topicConversationNavigatorState,
      topicConversationOpenParent,
      topicConversationOpenBoundPane,
      topicConversationRespondApproval,
      topicConversationShellSpeechCapture,
      topicConversationShellSpeechState,
      topicConversationPresentFromNavigator,
      topicConversationRequestPresentation,
      topicConversationRenderedScrollOwners,
      topicConversationStartupState,
      topicConversationSubmitAndClose,
      topicConversationStop,
      topicConversationSubmit,
      topicConversationSendSide,
      topicConversationSurfaceState,
      topicConversationSurfaceStates,
      topicConversationTogglePaneMaximized,
      topicConversationVoiceCapture,
      topicConversationWorkspaceAvailabilityState,
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

  function topicConversationFirstRunState() {
    const newConversationButton = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === "New conversation",
    );
    return {
      chooseFolder: Boolean(document.querySelector('[data-testid="choose-project-folder"]')),
      easyButtons: document.querySelectorAll('[data-testid="easy-button-surface"]').length,
      emptyState: Boolean(document.querySelector('[data-testid="workspace-empty-state"]')),
      newTopic:
        newConversationButton instanceof HTMLButtonElement && !newConversationButton.disabled,
      search: Boolean(document.querySelector('[aria-label="Search conversations"]')),
    };
  }

  function topicConversationWorkspaceAvailabilityState({ conversationId }) {
    const surfaces = Array.from(
      document.querySelectorAll('[data-testid="easy-button-surface"]'),
    ).filter((surface) => datasetValue(surface, "conversationId") === conversationId);
    const surface = surfaces[0];
    const input = surface?.querySelector('[data-testid="easy-button-input"]');
    return {
      inputDisabled: input instanceof HTMLInputElement ? input.disabled : true,
      placeholder: input instanceof HTMLInputElement ? input.placeholder : "",
      projectionStatus: datasetValue(surface, "easyButtonProjection"),
      surfaceCount: surfaces.length,
      unavailableNotice: Boolean(
        document.querySelector('[data-testid="workspace-unavailable-notice"]'),
      ),
    };
  }

  function topicConversationStartupState({ conversationId }) {
    const visibleHosts = Array.from(
      document.querySelectorAll('[data-testid="workspace-pane-host"][data-visible="true"]'),
    );
    const matchingSurface = Array.from(
      document.querySelectorAll('[data-testid="easy-button-surface"]'),
    ).find((surface) => datasetValue(surface, "conversationId") === conversationId);
    const matchingHost = matchingSurface?.closest('[data-testid="workspace-pane-host"]');
    const startupPane = document.querySelector('[data-testid="initial-easy-button-pane"]');
    return {
      actionCount: matchingHost?.querySelectorAll("[data-workspace-pane-action]").length ?? 0,
      createControlPresent:
        document.querySelector('[data-testid="conversation-create-form"]') !== null,
      easyButtonPaneCount: visibleHosts.filter(
        (host) => datasetValue(host, "surfaceKind") === "easy-button",
      ).length,
      emptyFramePaneCount: visibleHosts.filter(
        (host) => datasetValue(host, "surfaceKind") === "empty-frame",
      ).length,
      matchingSurfaceCount: Array.from(
        document.querySelectorAll('[data-testid="easy-button-surface"]'),
      ).filter((surface) => datasetValue(surface, "conversationId") === conversationId).length,
      paneId: datasetValue(matchingHost, "paneId"),
      searchControlPresent:
        document.querySelector('input[aria-label="Search conversations"]') !== null,
      startupPanePresent: startupPane !== null,
      startupState: datasetValue(startupPane, "startupState"),
      topBarSpeechStatusPresent: Boolean(
        document
          .querySelector('[data-testid="shell-top-bar"]')
          ?.querySelector('[data-testid="shell-speech-status"]'),
      ),
      voiceOffPresent: Array.from(document.querySelectorAll("body *")).some(
        (element) => element.childElementCount === 0 && element.textContent?.trim() === "Voice off",
      ),
      visiblePaneCount: visibleHosts.length,
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
        topicConversationSurfaceSnapshot,
      ),
      workspaceId: datasetValue(area, "workspaceId"),
    };
  }

  function topicConversationRenderedScrollOwners({ conversationId }) {
    const surface = conversationSurface(conversationId);
    if (!(surface instanceof HTMLElement)) {
      return [];
    }
    return Array.from(surface.querySelectorAll("*")).flatMap((element) => {
      if (!(element instanceof HTMLElement)) {
        return [];
      }
      const style = window.getComputedStyle(element);
      const overflowY = style.overflowY;
      const scrollOwner = overflowY === "auto" || overflowY === "scroll";
      const scrollable = element.scrollHeight > element.clientHeight + 1;
      if (!scrollOwner && !scrollable) {
        return [];
      }
      return [
        {
          className: element.className,
          clientHeight: Math.round(element.clientHeight),
          dataTestId: element.getAttribute("data-testid") ?? "",
          overflowY,
          scrollHeight: Math.round(element.scrollHeight),
          tagName: element.tagName.toLowerCase(),
        },
      ];
    });
  }

  function topicConversationSurfaceSnapshot(surface) {
    const elements = conversationSurfaceElements(surface);
    const voice = conversationSurfaceVoiceControl(elements.control);
    return {
      agentText: elementText(elements.agentText),
      agentTextPresent: elements.agentText !== null,
      archived: datasetValue(surface, "easyButtonArchived") === "true",
      approvalId: datasetValue(elements.approval, "approvalId"),
      artifactCount: elements.artifacts.length,
      artifactText: Array.from(elements.artifacts).map(elementText).join("\n"),
      captureState: datasetValue(surface, "easyButtonCapture"),
      captureScope: datasetValue(surface, "easyButtonCaptureScope"),
      clarificationText: elementText(elements.clarification),
      conversationId: datasetValue(surface, "conversationId"),
      errorText: elementText(elements.error),
      eventCursorSequence: numericDatasetValue(surface, "easyButtonEventCursor"),
      forkParentConversationId: datasetValue(elements.lineage, "forkParentConversationId"),
      forkParentTitle: elementText(elements.lineage),
      helperPresent: elements.helper !== null,
      helperText: elementText(elements.helper),
      highlightedMilestoneCount: elements.highlights.length,
      hostAccentDark: elements.host.style.getPropertyValue("--conversation-accent-dark"),
      hostConversationId: datasetValue(elements.host, "conversationId"),
      hostFocusRing: computedStyleValue(elements.host, "--workspace-pane-focus-ring"),
      hostFocusShadow: computedStyleValue(elements.host, "--workspace-pane-focus-shadow"),
      hostPaletteId: datasetValue(elements.host, "conversationPalette"),
      inputDisabled: inputIsDisabled(elements.input),
      intentState: datasetValue(surface, "easyButtonIntent"),
      intentText: elementText(elements.currentFocus),
      paneId: datasetValue(elements.host, "paneId"),
      paletteId: datasetValue(surface, "conversationPalette"),
      playbackScope: datasetValue(surface, "easyButtonPlaybackScope"),
      playbackState: datasetValue(surface, "easyButtonPlayback"),
      projectionStatus: datasetValue(surface, "easyButtonProjection"),
      queueCount: numericDatasetValue(surface, "easyButtonQueueCount"),
      sideId: datasetValue(elements.side, "sideConversationId"),
      sideParentStatus: datasetValue(elements.sideParentStatus, "parentConversationStatus"),
      sideStatus: datasetValue(elements.side, "sideConversationStatus"),
      sideTranscriptText: elementText(elements.sideTranscript),
      speechActivityText: elementText(elements.speechActivity),
      speechState: datasetValue(surface, "easyButtonSpeech"),
      speechTranscriptText: elementText(elements.speechTranscript),
      state: datasetValue(surface, "easyButtonState"),
      status: datasetValue(surface, "easyButtonStatus"),
      statusLabel: elementText(elements.statusLabel),
      statusQuestion: elementText(elements.statusQuestion),
      statusReplyText: elementText(elements.statusReply),
      summaryText: elementText(elements.summary),
      title: attributeValue(surface, "aria-label"),
      topBarBackgroundImage: computedStyleValue(elements.topBar, "background-image"),
      trajectoryEventCount: numericDatasetValue(surface, "easyButtonTrajectoryCount"),
      trajectoryHasEarlier: datasetValue(surface, "easyButtonTrajectoryHasEarlier") === "true",
      voiceCaptureAvailable: voice.available,
      voiceCaptureLabel: voice.label,
    };
  }

  function conversationSurfaceElements(surface) {
    const host = surface.closest('[data-testid="workspace-pane-host"]');
    if (!(host instanceof HTMLElement)) {
      throw new Error("Easy Button surface is missing its workspace pane host");
    }
    return {
      agentText: surface.querySelector('[data-testid="easy-button-agent-text"]'),
      approval: surface.querySelector('[data-testid="easy-button-approval"]'),
      artifacts: surface.querySelectorAll(
        '[data-testid="easy-button-artifacts"] [data-artifact-id]',
      ),
      clarification: surface.querySelector('[data-testid="easy-button-clarification"]'),
      control: surface.querySelector('[data-testid="easy-button-control"]'),
      error: surface.querySelector('[data-testid="easy-button-error"]'),
      helper: surface.querySelector('[data-testid="easy-button-helper"]'),
      currentFocus: surface.querySelector('[data-testid="easy-button-current-focus"]'),
      highlights: surface.querySelectorAll('[data-testid="easy-button-highlights"] li'),
      host,
      input: surface.querySelector('[data-testid="easy-button-input"]'),
      lineage: surface.querySelector('[data-testid="easy-button-fork-lineage"]'),
      side: surface.querySelector('[data-testid="easy-button-side-conversation"]'),
      sideParentStatus: surface.querySelector('[data-testid="easy-button-side-parent-status"]'),
      sideTranscript: surface.querySelector('[data-testid="easy-button-side-transcript"]'),
      speechActivity: surface.querySelector('[data-testid="easy-button-speech-activity"]'),
      speechTranscript: surface.querySelector('[data-testid="easy-button-speech-transcript"]'),
      statusLabel: surface.querySelector(".easy-button-status-label"),
      statusQuestion: surface.querySelector(".easy-button-status-question"),
      statusReply: surface.querySelector(".easy-button-status-reply-text"),
      summary: surface.querySelector('[data-testid="easy-button-summary-text"]'),
      topBar: host.querySelector(".workspace-pane-top-bar"),
    };
  }

  function conversationSurfaceVoiceControl(control) {
    if (!(control instanceof HTMLButtonElement)) {
      return { available: false, label: "" };
    }
    switch (control.getAttribute("data-easy-button-control-mode")) {
      case "talk":
      case "stop-listening":
        return { available: !control.disabled, label: attributeValue(control, "aria-label") };
      default:
        return { available: false, label: "" };
    }
  }

  function topicConversationSubmit({ conversationId, paneId = null, text }) {
    const surface = conversationSurface(conversationId, paneId);
    const input = surface?.querySelector('[data-testid="easy-button-input"]');
    if (!(input instanceof HTMLInputElement) || input.disabled || !input.form) {
      return { conversationId, submitted: false };
    }
    setInputValue(input, text);
    input.form.requestSubmit();
    return { conversationId, submitted: true };
  }

  function topicConversationSubmitAndClose({ conversationId, text }) {
    const submitted = topicConversationSubmit({ conversationId, text });
    if (!submitted.submitted) {
      return { closing: false, conversationId, submitted: false };
    }
    const closing = topicConversationCloseOneBoundPane({ conversationId });
    return {
      closing: closing.clicked,
      conversationId,
      paneId: closing.paneId,
      submitted: true,
    };
  }

  function topicConversationSendSide({ conversationId, text }) {
    const surface = conversationSurface(conversationId);
    const input = surface?.querySelector('[data-testid="easy-button-side-input"]');
    const button = surface?.querySelector('[data-testid="easy-button-side-submit"]');
    if (
      !(input instanceof HTMLInputElement) ||
      input.disabled ||
      !(button instanceof HTMLButtonElement)
    ) {
      return { conversationId, sent: false };
    }
    setInputValue(input, text);
    if (button.disabled) {
      return { conversationId, sent: false };
    }
    button.click();
    return { conversationId, sent: true };
  }

  function topicConversationEndSide({ conversationId }) {
    const button = conversationSurface(conversationId)?.querySelector(
      '[data-testid="easy-button-side-end"]',
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { conversationId, ended: false };
    }
    button.click();
    return { conversationId, ended: true };
  }

  function topicConversationOpenParent({ conversationId }) {
    const button = conversationSurface(conversationId)?.querySelector(
      '[data-testid="easy-button-open-parent"]',
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { conversationId, opened: false };
    }
    button.click();
    return { conversationId, opened: true };
  }

  function topicConversationVoiceCapture({ conversationId }) {
    const surface = conversationSurface(conversationId);
    const button = surface?.querySelector('[data-testid="easy-button-control"]');
    const mode = button?.getAttribute("data-easy-button-control-mode") ?? "";
    const controlIsVoice = mode === "talk" || mode === "stop-listening";
    if (!controlIsVoice || !(button instanceof HTMLButtonElement) || button.disabled) {
      return { conversationId, requested: false };
    }
    button.click();
    return { conversationId, requested: true };
  }

  function topicConversationShellSpeechCapture() {
    const button =
      document.querySelector('[data-testid="master-overlay-voice-capture"]') ??
      document.querySelector('[data-testid="shell-speech-capture-control"]');
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
      transcriptText: elementText(status?.querySelector('[data-testid="shell-speech-transcript"]')),
    };
  }

  function topicConversationInstallCaptureTimingObserver({ conversationId = null, destination }) {
    const target = captureTimingTarget(destination, conversationId);
    const fixture = globalThis.__settaSpeechRealtimeBrowserFixture;
    if (!fixture) {
      throw new Error("speech realtime browser fixture is not installed");
    }
    if (!(target.element instanceof HTMLElement)) {
      throw new Error("capture timing target is missing");
    }
    let marked = false;
    const mark = () => {
      if (marked || target.element.getAttribute(target.attribute) !== "recording") {
        return;
      }
      marked = true;
      fixture.markTiming("recording_observed", {
        attribute: target.attribute,
        destination,
      });
      observer.disconnect();
    };
    const observer = new MutationObserver(mark);
    observer.observe(target.element, { attributes: true, attributeFilter: [target.attribute] });
    mark();
    return { installed: true };
  }

  function captureTimingTarget(destination, conversationId) {
    if (destination === "pane") {
      return {
        attribute: "data-easy-button-capture",
        element: conversationSurface(conversationId),
      };
    }
    if (destination === "master") {
      return {
        attribute: "data-speech-capture",
        element: document.querySelector('[data-testid="shell-speech-status"]'),
      };
    }
    throw new Error(`unsupported capture timing destination: ${destination}`);
  }

  function topicConversationStop({ conversationId }) {
    // Stopping a run is now a small composer control; the giant button is always
    // the voice/talk affordance.
    const button = conversationSurface(conversationId)?.querySelector(
      '[data-testid="easy-button-stop-run"]',
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
          subtitle: "topic conversation pane",
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
    const rowPresentation = conversationNavigatorRowPresentation(rows[0]);
    const duplicateViewButtonCount = Array.from(
      document.querySelectorAll('[data-testid="conversation-open-new-view"]'),
    ).filter((button) => datasetValue(button, "conversationId") === conversationId).length;
    return {
      ...rowPresentation,
      conversationId: rows.length === 1 ? rowPresentation.conversationId : "",
      duplicateViewButtonCount,
      focusedPaneId:
        document
          .querySelector('[data-testid="workspace-pane-host"][data-focused="true"]')
          ?.getAttribute("data-pane-id") ?? "",
      maximizedPaneId: datasetValue(area, "maximizedPaneId"),
      openViewCount: openViews.length,
      rowCount: rows.length,
    };
  }

  function conversationNavigatorRowPresentation(row) {
    if (!(row instanceof HTMLElement)) {
      return {
        accentDark: "",
        conversationId: "",
        current: "",
        label: "",
        paletteId: "",
        parentConversationId: "",
        presentationBoxShadow: "",
        presentationFocusRing: "",
        presentationTransitionDuration: "",
      };
    }
    return {
      accentDark: row.style.getPropertyValue("--conversation-accent-dark"),
      conversationId: datasetValue(row, "conversationId"),
      current: row.getAttribute("aria-current") ?? "",
      label: row.getAttribute("aria-label") ?? "",
      paletteId: datasetValue(row, "conversationPalette"),
      parentConversationId: datasetValue(row, "parentConversationId"),
      presentationBoxShadow: computedStyleValue(row, "box-shadow"),
      presentationFocusRing: computedStyleValue(row, "--conversation-focus-ring"),
      presentationTransitionDuration: computedStyleValue(row, "transition-duration"),
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

  async function topicConversationRequestPresentation({ conversationId, title, workspaceId }) {
    const detail = {
      completion: null,
      request: { conversationId, title, workspaceId },
    };
    window.dispatchEvent(new CustomEvent("setta:conversation-pane-navigation-request", { detail }));
    if (!(detail.completion instanceof Promise)) {
      return { kind: "blocked", reason: "conversation pane coordinator unavailable" };
    }
    return detail.completion;
  }

  function topicConversationArchiveFromNavigator({ confirm = true, conversationId }) {
    const button = Array.from(
      document.querySelectorAll('[data-testid="conversation-archive"]'),
    ).find((candidate) => datasetValue(candidate, "conversationId") === conversationId);
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { archived: false, conversationId };
    }
    const originalConfirm = window.confirm;
    window.confirm = () => confirm;
    try {
      button.click();
    } finally {
      window.confirm = originalConfirm;
    }
    return { archived: confirm, conversationId };
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

  function topicConversationCloseOneBoundPane({ confirmSide = false, conversationId }) {
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
    const originalConfirm = window.confirm;
    if (confirmSide) {
      window.confirm = () => {
        window.confirm = originalConfirm;
        return true;
      };
    }
    button.click();
    return { clicked: true, conversationId, paneId };
  }

  function datasetValue(element, key) {
    return element instanceof HTMLElement ? (element.dataset[key] ?? "") : "";
  }

  function numericDatasetValue(element, key) {
    return Number(datasetValue(element, key));
  }

  function attributeValue(element, name) {
    return element?.getAttribute(name) ?? "";
  }

  function elementText(element) {
    return element?.textContent ?? "";
  }

  function computedStyleValue(element, property) {
    return element instanceof HTMLElement
      ? window.getComputedStyle(element).getPropertyValue(property).trim()
      : "";
  }

  function inputIsDisabled(element) {
    return element instanceof HTMLInputElement && element.disabled;
  }

  function conversationSurface(conversationId, paneId = null) {
    return Array.from(document.querySelectorAll('[data-testid="easy-button-surface"]')).find(
      (surface) => {
        if (datasetValue(surface, "conversationId") !== conversationId) {
          return false;
        }
        if (paneId === null) {
          return true;
        }
        const host = surface.closest('[data-testid="workspace-pane-host"]');
        return datasetValue(host, "paneId") === paneId;
      },
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
