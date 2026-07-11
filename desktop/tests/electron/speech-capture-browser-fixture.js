/* global DOMException, HTMLButtonElement, HTMLElement, HTMLInputElement, Headers, Response, URL, document, getComputedStyle, navigator, structuredClone */

(() => {
  const providerURL = "https://api.openai.com/v1/realtime/calls";
  const originalFetch = globalThis.fetch.bind(globalThis);
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const peers = [];
  const playbackAudios = [];
  const mediaRequests = [];
  const tracks = [];
  const microphoneWaiters = [];
  let holdMicrophone = true;
  let eventOrdinal = 0;

  class FixtureDataChannel {
    constructor(label) {
      this.label = label;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this.onopen = null;
      this.readyState = "connecting";
      this.sent = [];
    }

    close() {
      this.readyState = "closed";
    }

    disconnect() {
      this.readyState = "closed";
      this.onclose?.();
    }

    message(event) {
      this.onmessage?.({ data: JSON.stringify(event) });
    }

    open() {
      this.readyState = "open";
      this.onopen?.();
    }

    send(data) {
      this.sent.push(JSON.parse(data));
    }
  }

  class FixturePeerConnection {
    constructor() {
      this.channel = null;
      this.closed = false;
      this.connectionState = "new";
      this.localDescription = null;
      this.onconnectionstatechange = null;
      this.remoteDescription = null;
      this.track = null;
      peers.push(this);
    }

    addTrack(track) {
      this.track = track;
    }

    close() {
      this.closed = true;
      this.connectionState = "closed";
    }

    createDataChannel(label) {
      this.channel = new FixtureDataChannel(label);
      return this.channel;
    }

    async createOffer() {
      return { sdp: "fixture-offer-sdp", type: "offer" };
    }

    async setLocalDescription(description) {
      this.localDescription = description;
    }

    async setRemoteDescription(description) {
      this.remoteDescription = description;
    }
  }

  class FixturePlaybackAudio {
    constructor(url) {
      this.currentTime = 0;
      this.listeners = { ended: new Set(), error: new Set() };
      this.pauseCount = 0;
      this.playCount = 0;
      this.playing = false;
      this.url = url;
      playbackAudios.push(this);
    }

    addEventListener(type, listener) {
      this.listeners[type]?.add(listener);
    }

    finish() {
      this.playing = false;
      for (const listener of this.listeners.ended) {
        listener();
      }
    }

    pause() {
      this.pauseCount += 1;
      this.playing = false;
    }

    play() {
      this.playCount += 1;
      this.playing = true;
      return Promise.resolve();
    }

    removeEventListener(type, listener) {
      this.listeners[type]?.delete(listener);
    }
  }

  navigator.mediaDevices.getUserMedia = async (constraints) => {
    mediaRequests.push(structuredClone(constraints));
    if (holdMicrophone) {
      await new Promise((resolve, reject) => microphoneWaiters.push({ reject, resolve }));
    }
    const stream = await originalGetUserMedia(constraints);
    tracks.push(...stream.getTracks());
    return stream;
  };

  globalThis.RTCPeerConnection = FixturePeerConnection;
  globalThis.Audio = FixturePlaybackAudio;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== providerURL) {
      return originalFetch(input, init);
    }
    const peer = latestPeer();
    peer.providerRequest = {
      authorized:
        typeof init?.headers === "object" &&
        new Headers(init.headers).get("Authorization")?.startsWith("Bearer ") === true,
      body: init?.body,
      method: init?.method,
    };
    return new Response("fixture-answer-sdp", {
      headers: { "Content-Type": "application/sdp" },
      status: 201,
    });
  };

  function latestPeer() {
    const peer = peers.at(-1);
    if (!peer) {
      throw new Error("speech capture fixture has no peer connection");
    }
    return peer;
  }

  function latestChannel() {
    const channel = latestPeer().channel;
    if (!channel) {
      throw new Error("speech capture fixture has no data channel");
    }
    return channel;
  }

  function nextEventId(prefix) {
    eventOrdinal += 1;
    return `${prefix}_${eventOrdinal}`;
  }

  function acknowledgeItem(itemId) {
    const channel = latestChannel();
    if (channel.itemAcknowledged) {
      return;
    }
    channel.itemAcknowledged = true;
    channel.message({
      event_id: nextEventId("event_committed"),
      item_id: itemId,
      type: "input_audio_buffer.committed",
    });
    channel.message({
      event_id: nextEventId("event_created"),
      item: { id: itemId, role: "user", type: "message" },
      type: "conversation.item.created",
    });
  }

  function captureWorkflowState() {
    const peer = peers.at(-1) ?? null;
    return {
      ...captureDOMState(),
      audio: {
        activeCount: playbackAudios.filter((audio) => audio.playing).length,
        count: playbackAudios.length,
        playCount: playbackAudios.reduce((total, audio) => total + audio.playCount, 0),
      },
      fixture: captureFixtureState(peer),
    };
  }

  function captureDOMState() {
    return {
      buttonAriaLabel: elementAttribute('[data-testid="easy-button-control"]', "aria-label"),
      buttonDisabled: buttonDisabled('[data-testid="easy-button-control"]'),
      capture: surfaceData("easyButtonCapture"),
      captureError: elementText('[data-testid="easy-button-capture-error"]'),
      captureLine: elementText('[data-testid="easy-button-capture-line"]', false),
      captureLineCount: document.querySelectorAll('[data-testid="easy-button-capture-line"]')
        .length,
      capturing: surfaceData("easyButtonCapturing"),
      helper: elementText('[data-testid="easy-button-helper"]'),
      inputDisabled: inputState().disabled,
      inputFocused: inputState().focused,
      inputValue: inputState().value,
      ringAnimations: Array.from(document.querySelectorAll(".easy-button-ring")).map(
        (ring) => getComputedStyle(ring).animationName,
      ),
      speech: surfaceData("easyButtonSpeech"),
      terminalPaneCount: document.querySelectorAll(
        '[data-testid="workspace-pane-host"][data-surface-kind="terminal"]:not([data-pane-id=""])',
      ).length,
    };
  }

  function captureFixtureState(peer) {
    return {
      activeTrackCount: tracks.filter((track) => track.readyState !== "ended").length,
      ...channelState(peer?.channel ?? null),
      mediaRequests: structuredClone(mediaRequests),
      peerClosed: peer?.closed ?? false,
      ...providerRequestState(peer?.providerRequest ?? null),
    };
  }

  function channelState(channel) {
    if (!channel) {
      return { channelClosed: false, commitCount: 0, dataChannelLabel: "" };
    }
    return {
      channelClosed: channel.readyState === "closed",
      commitCount: channel.sent.filter((event) => event.type === "input_audio_buffer.commit")
        .length,
      dataChannelLabel: channel.label,
    };
  }

  function providerRequestState(request) {
    if (!request) {
      return { providerAuthorized: false, providerBody: "", providerMethod: "" };
    }
    return {
      providerAuthorized: request.authorized,
      providerBody: request.body,
      providerMethod: request.method,
    };
  }

  function elementAttribute(selector, attribute) {
    return document.querySelector(selector)?.getAttribute(attribute) ?? "";
  }

  function buttonDisabled(selector) {
    const button = document.querySelector(selector);
    return !(button instanceof HTMLButtonElement) || button.disabled;
  }

  function elementText(selector, trim = true) {
    const text = document.querySelector(selector)?.textContent ?? "";
    return trim ? text.trim() : text;
  }

  function surfaceData(field) {
    const surface = document.querySelector('[data-testid="easy-button-surface"]');
    return surface instanceof HTMLElement ? (surface.dataset[field] ?? "") : "";
  }

  function inputState() {
    const input = document.querySelector('[data-testid="easy-button-input"]');
    return input instanceof HTMLInputElement
      ? { disabled: input.disabled, focused: document.activeElement === input, value: input.value }
      : { disabled: true, focused: false, value: "" };
  }

  globalThis.__settaSpeechCaptureFixture = {
    allowMicrophone() {
      holdMicrophone = false;
      for (const waiter of microphoneWaiters.splice(0)) {
        waiter.resolve();
      }
    },
    denyMicrophone() {
      for (const waiter of microphoneWaiters.splice(0)) {
        waiter.reject(new DOMException("fixture microphone denied", "NotAllowedError"));
      }
    },
    disconnect() {
      latestChannel().disconnect();
    },
    emitCompleted(transcript) {
      const itemId = "item_fixture";
      acknowledgeItem(itemId);
      latestChannel().message({
        content_index: 0,
        event_id: nextEventId("event_completed"),
        item_id: itemId,
        transcript,
        type: "conversation.item.input_audio_transcription.completed",
      });
    },
    emitDelta(delta) {
      const itemId = "item_fixture";
      acknowledgeItem(itemId);
      latestChannel().message({
        content_index: 0,
        delta,
        event_id: nextEventId("event_delta"),
        item_id: itemId,
        type: "conversation.item.input_audio_transcription.delta",
      });
    },
    emitTranscriptionFailed() {
      const itemId = "item_fixture";
      acknowledgeItem(itemId);
      latestChannel().message({
        content_index: 0,
        error: {
          code: "audio_unintelligible",
          message: "fixture provider body must stay hidden",
          type: "transcription_error",
        },
        event_id: nextEventId("event_failed"),
        item_id: itemId,
        type: "conversation.item.input_audio_transcription.failed",
      });
    },
    finishAudio() {
      const audio = playbackAudios.findLast((candidate) => candidate.playing);
      if (!audio) {
        throw new Error("speech capture fixture has no active playback audio");
      }
      audio.finish();
    },
    holdMicrophone() {
      holdMicrophone = true;
    },
    openProviderSession() {
      const channel = latestChannel();
      channel.open();
      channel.message({
        event_id: nextEventId("event_session"),
        session: { id: `session_fixture_${peers.length}`, type: "transcription" },
        type: "session.created",
      });
    },
    state() {
      return captureWorkflowState();
    },
  };
})();
