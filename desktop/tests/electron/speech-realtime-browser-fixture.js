/* global MessageEvent, Response, TextEncoder, navigator, performance, queueMicrotask */

(() => {
  const fixtureVersion = "setta-speech-realtime-browser-fixture-v2";
  if (globalThis.__settaSpeechRealtimeBrowserFixture?.version === fixtureVersion) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const originalPeerConnection = globalThis.RTCPeerConnection;
  const originalAudio = globalThis.Audio;
  const activeAudio = new Set();
  let activeChannel = null;
  let timingContext = {};
  const delays = {
    dataChannelOpenMs: 0,
    webRTCAnswerMs: 0,
  };
  const timing = {
    events: [],
    sequence: 0,
  };
  const state = {
    audioAutoEnd: true,
    audioCreateCount: 0,
    audioEndCount: 0,
    audioMaximumConcurrentCount: 0,
    audioPauseCount: 0,
    audioPlayCount: 0,
    channelOpen: false,
    commitCount: 0,
    connectionCount: 0,
    deltaCount: 0,
    mediaRequestCount: 0,
    stoppedTrackCount: 0,
    transcript: "Keep this pane transcript exact.",
  };
  markTiming("fixture_installed");

  class ScriptedAudio {
    constructor(url) {
      this.currentTime = 0;
      this.listeners = { ended: new Set(), error: new Set() };
      this.url = url;
      activeAudio.add(this);
      state.audioCreateCount += 1;
      state.audioMaximumConcurrentCount = Math.max(
        state.audioMaximumConcurrentCount,
        activeAudio.size,
      );
    }

    addEventListener(type, listener) {
      this.listeners[type].add(listener);
    }

    pause() {
      state.audioPauseCount += 1;
      activeAudio.delete(this);
    }

    play() {
      state.audioPlayCount += 1;
      markTiming("speech_audio_play", { url: this.url });
      if (state.audioAutoEnd) {
        queueMicrotask(() => this.finish());
      }
      return Promise.resolve();
    }

    removeEventListener(type, listener) {
      this.listeners[type].delete(listener);
    }

    finish() {
      if (!activeAudio.delete(this)) {
        return;
      }
      state.audioEndCount += 1;
      markTiming("speech_audio_ended", { url: this.url });
      for (const listener of this.listeners.ended) {
        listener();
      }
    }
  }

  class ScriptedDataChannel {
    constructor() {
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this.onopen = null;
      this.readyState = "connecting";
    }

    close() {
      this.readyState = "closed";
      if (activeChannel === this) {
        activeChannel = null;
      }
    }

    open() {
      this.readyState = "open";
      state.channelOpen = true;
      markTiming("realtime_data_channel_open");
      this.onopen?.();
      markTiming("realtime_session_created");
      this.emit({
        event_id: "event_session_scripted",
        session: { id: "session_scripted", type: "transcription" },
        type: "session.created",
      });
    }

    send(payload) {
      const event = JSON.parse(payload);
      if (event.type !== "input_audio_buffer.commit") {
        throw new Error(`unexpected scripted Realtime client event ${event.type}`);
      }
      state.commitCount += 1;
      markTiming("transcript_commit_sent", { commitCount: state.commitCount });
      queueMicrotask(() => {
        markTiming("transcript_completed_emitted", { commitCount: state.commitCount });
        this.emit({
          content_index: 0,
          event_id: `event_completed_${state.commitCount}`,
          item_id: `item_scripted_${state.commitCount}`,
          transcript: state.transcript,
          type: "conversation.item.input_audio_transcription.completed",
          usage: { seconds: 1, type: "duration" },
        });
      });
    }

    emitTranscriptDelta(delta) {
      if (this.readyState !== "open") {
        throw new Error("scripted Realtime data channel is not open");
      }
      state.deltaCount += 1;
      markTiming("transcript_delta_emitted", { deltaLength: delta.length });
      this.emit({
        content_index: 0,
        delta,
        event_id: `event_delta_${state.deltaCount}`,
        item_id: `item_scripted_${state.commitCount + 1}`,
        type: "conversation.item.input_audio_transcription.delta",
      });
    }

    emit(event) {
      this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(event) }));
    }
  }

  class ScriptedPeerConnection {
    constructor() {
      this.channel = null;
      this.connectionState = "new";
      this.onconnectionstatechange = null;
      state.connectionCount += 1;
      markTiming("webrtc_peer_created", { connectionCount: state.connectionCount });
    }

    addTrack(track, stream) {
      markTiming("webrtc_track_added", {
        audioTrackCount: stream?.getAudioTracks?.().length ?? null,
        kind: track?.kind ?? "",
        readyState: track?.readyState ?? "",
      });
    }

    close() {
      this.connectionState = "closed";
      markTiming("webrtc_peer_closed");
    }

    createDataChannel(label) {
      if (label !== "oai-events") {
        throw new Error(`unexpected scripted Realtime data channel ${label}`);
      }
      this.channel = new ScriptedDataChannel();
      activeChannel = this.channel;
      markTiming("realtime_data_channel_created", { label });
      return this.channel;
    }

    async createOffer() {
      markTiming("webrtc_offer_created");
      return { sdp: "scripted-offer-sdp", type: "offer" };
    }

    async setLocalDescription() {
      markTiming("webrtc_local_description_set");
    }

    async setRemoteDescription() {
      markTiming("webrtc_remote_description_set");
      scheduleAfterDelay(delays.dataChannelOpenMs, () => this.channel?.open());
    }
  }

  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (constraints?.audio !== true || constraints?.video !== false) {
      return originalGetUserMedia(constraints);
    }
    state.mediaRequestCount += 1;
    markTiming("microphone_request", { mediaRequestCount: state.mediaRequestCount });
    const track = {
      enabled: true,
      kind: "audio",
      readyState: "live",
      stop() {
        this.readyState = "ended";
        state.stoppedTrackCount += 1;
        markTiming("microphone_track_stopped", {
          stoppedTrackCount: state.stoppedTrackCount,
        });
      },
    };
    markTiming("microphone_grant", { mediaRequestCount: state.mediaRequestCount });
    return {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    };
  };

  globalThis.fetch = async (url, init) => {
    if (url !== "https://api.openai.com/v1/realtime/calls") {
      return originalFetch(url, init);
    }
    markTiming("webrtc_answer_request", {
      bodyBytes:
        typeof init?.body === "string" ? new TextEncoder().encode(init.body).byteLength : 0,
      webRTCAnswerMs: delays.webRTCAnswerMs,
    });
    await waitForDelay(delays.webRTCAnswerMs);
    const answer = "scripted-answer-sdp";
    markTiming("webrtc_answer_response", { webRTCAnswerMs: delays.webRTCAnswerMs });
    return new Response(answer, {
      headers: {
        "Content-Length": String(new TextEncoder().encode(answer).byteLength),
        "Content-Type": "application/sdp",
      },
      status: 201,
    });
  };
  globalThis.RTCPeerConnection = ScriptedPeerConnection;
  globalThis.Audio = ScriptedAudio;
  globalThis.__settaSpeechRealtimeBrowserFixture = {
    finishAllAudio() {
      for (const audio of [...activeAudio]) {
        audio.finish();
      }
    },
    restore() {
      activeChannel = null;
      globalThis.Audio = originalAudio;
      globalThis.fetch = originalFetch;
      globalThis.RTCPeerConnection = originalPeerConnection;
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      delete globalThis.__settaSpeechRealtimeBrowserFixture;
    },
    setTranscript(transcript) {
      state.transcript = transcript;
    },
    emitTranscriptDelta(delta) {
      if (!activeChannel) {
        throw new Error("scripted Realtime data channel is unavailable");
      }
      activeChannel.emitTranscriptDelta(delta);
    },
    setAudioAutoEnd(autoEnd) {
      state.audioAutoEnd = autoEnd;
    },
    setDelays(nextDelays) {
      if (Object.prototype.hasOwnProperty.call(nextDelays, "dataChannelOpenMs")) {
        delays.dataChannelOpenMs = validDelayMs(nextDelays.dataChannelOpenMs, "dataChannelOpenMs");
      }
      if (Object.prototype.hasOwnProperty.call(nextDelays, "webRTCAnswerMs")) {
        delays.webRTCAnswerMs = validDelayMs(nextDelays.webRTCAnswerMs, "webRTCAnswerMs");
      }
    },
    setTimingContext(context) {
      if (!isRecord(context)) {
        throw new Error("scripted Realtime timing context must be an object");
      }
      timingContext = { ...context };
    },
    markTiming(name, detail = {}) {
      markTiming(name, detail);
    },
    snapshot() {
      return {
        ...state,
        audioActiveCount: activeAudio.size,
        delays: { ...delays },
        timing: {
          context: { ...timingContext },
          events: timing.events.map((event) => ({
            ...event,
            detail: { ...event.detail },
          })),
        },
      };
    },
    version: fixtureVersion,
  };

  function markTiming(name, detail = {}) {
    const event = {
      detail: { ...timingContext, ...detail },
      epochMs: Date.now(),
      name,
      performanceMs: performance.now(),
      sequence: timing.sequence,
    };
    timing.sequence += 1;
    timing.events.push(event);
    return event;
  }

  function waitForDelay(delayMs) {
    if (delayMs === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      globalThis.setTimeout(resolve, delayMs);
    });
  }

  function scheduleAfterDelay(delayMs, callback) {
    if (delayMs === 0) {
      queueMicrotask(callback);
      return;
    }
    globalThis.setTimeout(callback, delayMs);
  }

  function validDelayMs(value, field) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
    return value;
  }

  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
})();
