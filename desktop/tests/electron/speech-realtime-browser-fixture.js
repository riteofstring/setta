/* global AudioContext, MessageEvent, Response, TextEncoder, navigator, performance, queueMicrotask, sessionStorage */

(() => {
  const fixtureVersion = "setta-speech-realtime-browser-fixture-v4";
  if (globalThis.__settaSpeechRealtimeBrowserFixture?.version === fixtureVersion) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const originalPeerConnection = globalThis.RTCPeerConnection;
  const originalAudio = globalThis.Audio;
  const originalSetTimeout = globalThis.setTimeout.bind(globalThis);
  const originalClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const finalizedSnapshotsStorageKey = "setta.speechRealtimeBrowserFixture.finalizedSnapshots.v1";
  const activeAudio = new Set();
  let activeChannel = null;
  const activeMicrophones = new Set();
  const activeProcessedTrackObservers = new Set();
  const processedAudioMarkersByRun = new Map();
  const pendingTranscriptCompletions = [];
  let timingContext = {};
  const delays = {
    dataChannelOpenMs: 0,
    webRTCAnswerStatus: 201,
    webRTCAnswerMs: 0,
  };
  let durationTimerOverride = null;
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
    durationTimerOverrideCount: 0,
    mediaRequestCount: 0,
    peerCloseCount: 0,
    pendingTranscriptCompletionCount: 0,
    processedAudioMarkerCount: 0,
    processedTrackObserverClosedCount: 0,
    processedTrackObserverCount: 0,
    requireProcessedAudioMarker: true,
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
      const runId = currentRunId();
      const emitCompletion = () => {
        markTiming("transcript_completed_emitted", { commitCount: state.commitCount });
        this.emit({
          content_index: 0,
          event_id: `event_completed_${state.commitCount}`,
          item_id: `item_scripted_${state.commitCount}`,
          transcript: state.transcript,
          type: "conversation.item.input_audio_transcription.completed",
          usage: { seconds: 1, type: "duration" },
        });
      };
      if (state.requireProcessedAudioMarker && !processedAudioMarkersByRun.has(runId)) {
        state.pendingTranscriptCompletionCount += 1;
        markTiming("transcript_completion_waiting_for_processed_marker", {
          commitCount: state.commitCount,
          runId,
        });
        pendingTranscriptCompletions.push({ emitCompletion, runId });
        return;
      }
      queueMicrotask(emitCompletion);
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
      this.processedTrackObservers = [];
      state.connectionCount += 1;
      markTiming("webrtc_peer_created", { connectionCount: state.connectionCount });
    }

    addTrack(track, stream) {
      markTiming("webrtc_track_added", {
        audioTrackCount: stream?.getAudioTracks?.().length ?? null,
        kind: track?.kind ?? "",
        readyState: track?.readyState ?? "",
      });
      const observer = observeProcessedTrack(track, stream);
      if (observer) {
        this.processedTrackObservers.push(observer);
      }
    }

    close() {
      if (this.connectionState === "closed") {
        return;
      }
      this.connectionState = "closed";
      state.peerCloseCount += 1;
      this.channel?.close();
      for (const observer of this.processedTrackObservers.splice(0)) {
        observer.close();
      }
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
    const stream = await createScriptedMicrophoneStream();
    markTiming("microphone_grant", { mediaRequestCount: state.mediaRequestCount });
    return stream;
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
    markTiming("webrtc_answer_response", {
      status: delays.webRTCAnswerStatus,
      webRTCAnswerMs: delays.webRTCAnswerMs,
    });
    return new Response(answer, {
      headers: {
        "Content-Length": String(new TextEncoder().encode(answer).byteLength),
        "Content-Type": "application/sdp",
      },
      status: delays.webRTCAnswerStatus,
    });
  };
  globalThis.RTCPeerConnection = ScriptedPeerConnection;
  globalThis.Audio = ScriptedAudio;
  const recordFinalizedSnapshot = () => {
    markTiming("fixture_pagehide_observed");
    queueMicrotask(() => {
      markTiming("fixture_pagehide_finalized");
      persistFinalizedSnapshot("pagehide");
    });
  };
  globalThis.addEventListener("pagehide", recordFinalizedSnapshot, { once: true });
  globalThis.__settaSpeechRealtimeBrowserFixture = {
    finishAllAudio() {
      for (const audio of [...activeAudio]) {
        audio.finish();
      }
    },
    restore() {
      activeChannel = null;
      closeActiveMicrophones();
      closeActiveProcessedTrackObservers();
      globalThis.Audio = originalAudio;
      globalThis.fetch = originalFetch;
      globalThis.RTCPeerConnection = originalPeerConnection;
      globalThis.clearTimeout = originalClearTimeout;
      globalThis.setTimeout = originalSetTimeout;
      globalThis.removeEventListener("pagehide", recordFinalizedSnapshot);
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
      if (Object.prototype.hasOwnProperty.call(nextDelays, "webRTCAnswerStatus")) {
        delays.webRTCAnswerStatus = validHTTPStatus(
          nextDelays.webRTCAnswerStatus,
          "webRTCAnswerStatus",
        );
      }
      if (Object.prototype.hasOwnProperty.call(nextDelays, "webRTCAnswerMs")) {
        delays.webRTCAnswerMs = validDelayMs(nextDelays.webRTCAnswerMs, "webRTCAnswerMs");
      }
    },
    setDurationTimerOverride(override) {
      if (!isRecord(override)) {
        throw new Error("duration timer override must be an object");
      }
      durationTimerOverride = {
        fromMs: validDelayMs(override.fromMs, "durationTimerOverride.fromMs"),
        toMs: validDelayMs(override.toMs, "durationTimerOverride.toMs"),
      };
      installDurationTimerOverride();
    },
    clearDurationTimerOverride() {
      durationTimerOverride = null;
      globalThis.clearTimeout = originalClearTimeout;
      globalThis.setTimeout = originalSetTimeout;
    },
    setRequireProcessedAudioMarker(required) {
      if (typeof required !== "boolean") {
        throw new Error("processed audio marker requirement must be boolean");
      }
      state.requireProcessedAudioMarker = required;
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
    counters() {
      return countersState();
    },
    hasTimingEvent(runId, name) {
      return timing.events.some((event) => event.name === name && event.detail?.runId === runId);
    },
    snapshot() {
      return snapshotState();
    },
    finalizedSnapshots() {
      return persistedFinalizedSnapshots();
    },
    version: fixtureVersion,
  };

  function markTiming(name, detail = {}) {
    return markTimingWithContext(name, timingContext, detail);
  }

  function markTimingWithContext(name, context, detail = {}) {
    const event = {
      detail: { ...context, ...detail },
      epochMs: Date.now(),
      name,
      performanceMs: performance.now(),
      sequence: timing.sequence,
    };
    timing.sequence += 1;
    timing.events.push(event);
    return event;
  }

  function snapshotState() {
    return {
      ...state,
      audioActiveCount: activeAudio.size,
      delays: { ...delays },
      durationTimerOverride: durationTimerOverride ? { ...durationTimerOverride } : null,
      pendingTranscriptCompletionRuns: pendingTranscriptCompletions.map((completion) => ({
        runId: completion.runId,
      })),
      processedAudioMarkersByRun: Object.fromEntries(processedAudioMarkersByRun.entries()),
      timing: {
        context: { ...timingContext },
        events: timing.events.map((event) => ({
          ...event,
          detail: { ...event.detail },
        })),
      },
    };
  }

  function countersState() {
    return {
      audioActiveCount: activeAudio.size,
      audioEndCount: state.audioEndCount,
      audioPauseCount: state.audioPauseCount,
      audioPlayCount: state.audioPlayCount,
      commitCount: state.commitCount,
      mediaRequestCount: state.mediaRequestCount,
    };
  }

  function persistFinalizedSnapshot(reason) {
    const snapshots = persistedFinalizedSnapshots();
    snapshots.push({
      reason,
      snapshot: snapshotState(),
    });
    sessionStorage.setItem(finalizedSnapshotsStorageKey, JSON.stringify(snapshots.slice(-8)));
  }

  function persistedFinalizedSnapshots() {
    const raw = sessionStorage.getItem(finalizedSnapshotsStorageKey);
    if (raw === null) {
      return [];
    }
    const snapshots = JSON.parse(raw);
    if (!Array.isArray(snapshots)) {
      throw new Error("scripted speech fixture finalized snapshot storage drifted");
    }
    return snapshots;
  }

  async function createScriptedMicrophoneStream() {
    if (typeof AudioContext !== "function") {
      throw new Error("scripted speech fixture requires AudioContext");
    }
    const context = new AudioContext({ latencyHint: "interactive" });
    let resource = null;
    try {
      if (context.state !== "running") {
        await context.resume();
      }
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.04;
      oscillator.frequency.value = 440;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      const track = destination.stream.getAudioTracks()[0];
      if (!track) {
        throw new Error("scripted speech fixture could not create an audio track");
      }
      resource = { context, destination, gain, oscillator, stopped: false, track };
      activeMicrophones.add(resource);
      installScriptedTrackStop(resource);
      return destination.stream;
    } catch (error) {
      if (resource) {
        activeMicrophones.delete(resource);
      }
      await context.close();
      throw error;
    }
  }

  function installScriptedTrackStop(resource) {
    const originalStop = resource.track.stop.bind(resource.track);
    const scriptedStop = () => {
      if (resource.stopped) {
        return;
      }
      resource.stopped = true;
      resource.oscillator.stop();
      resource.oscillator.disconnect();
      resource.gain.disconnect();
      originalStop();
      activeMicrophones.delete(resource);
      void resource.context.close();
      state.stoppedTrackCount += 1;
      markTiming("microphone_track_stopped", {
        stoppedTrackCount: state.stoppedTrackCount,
      });
    };
    resource.track.stop = scriptedStop;
  }

  function closeActiveMicrophones() {
    for (const resource of [...activeMicrophones]) {
      resource.track.stop();
    }
  }

  function observeProcessedTrack(track, stream) {
    if (track?.kind !== "audio" || !stream?.getAudioTracks) {
      return null;
    }
    const observerContext = { ...timingContext };
    const observer = createProcessedTrackObserver(track, stream, observerContext);
    activeProcessedTrackObservers.add(observer);
    return observer;
  }

  function createProcessedTrackObserver(track, stream, observerContext) {
    const context = new AudioContext({ latencyHint: "interactive" });
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    const source = context.createMediaStreamSource(stream);
    const sink = context.createGain();
    sink.gain.value = 0;
    source.connect(analyser);
    analyser.connect(sink);
    sink.connect(context.destination);
    const samples = new Float32Array(analyser.fftSize);
    let closed = false;
    state.processedTrackObserverCount += 1;
    markTimingWithContext("processed_track_observer_started", observerContext, {
      observerCount: state.processedTrackObserverCount,
      processedTrackId: track.id,
      processedTrackReadyState: track.readyState,
    });
    void context.resume().catch((error) => {
      markTimingWithContext("processed_track_observer_resume_failed", observerContext, {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    const interval = globalThis.setInterval(() => {
      if (closed) {
        return;
      }
      analyser.getFloatTimeDomainData(samples);
      const rms = rootMeanSquare(samples);
      if (rms < 0.003) {
        return;
      }
      const runId = contextRunId(observerContext);
      processedAudioMarkersByRun.set(runId, {
        observerCount: state.processedTrackObserverCount,
        rms,
      });
      state.processedAudioMarkerCount += 1;
      markTimingWithContext("processed_audio_marker_observed", observerContext, {
        activeMicrophoneCount: activeMicrophones.size,
        processedAudioMarkerCount: state.processedAudioMarkerCount,
        rms,
        stoppedTrackCount: state.stoppedTrackCount,
      });
      flushPendingTranscriptCompletions(runId);
      observer.close();
    }, 20);
    const observer = {
      close() {
        if (closed) {
          return;
        }
        closed = true;
        globalThis.clearInterval(interval);
        activeProcessedTrackObservers.delete(observer);
        state.processedTrackObserverClosedCount += 1;
        source.disconnect();
        analyser.disconnect();
        sink.disconnect();
        void context.close();
        markTimingWithContext("processed_track_observer_closed", observerContext, {
          observerClosedCount: state.processedTrackObserverClosedCount,
        });
      },
    };
    return observer;
  }

  function flushPendingTranscriptCompletions(runId) {
    for (let index = pendingTranscriptCompletions.length - 1; index >= 0; index -= 1) {
      const completion = pendingTranscriptCompletions[index];
      if (completion.runId !== runId) {
        continue;
      }
      pendingTranscriptCompletions.splice(index, 1);
      queueMicrotask(completion.emitCompletion);
    }
  }

  function closeActiveProcessedTrackObservers() {
    for (const observer of [...activeProcessedTrackObservers]) {
      observer.close();
    }
  }

  function rootMeanSquare(samples) {
    let total = 0;
    for (const sample of samples) {
      total += sample * sample;
    }
    return Math.sqrt(total / samples.length);
  }

  function waitForDelay(delayMs) {
    if (delayMs === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      originalSetTimeout(resolve, delayMs);
    });
  }

  function scheduleAfterDelay(delayMs, callback) {
    if (delayMs === 0) {
      queueMicrotask(callback);
      return;
    }
    originalSetTimeout(callback, delayMs);
  }

  function installDurationTimerOverride() {
    globalThis.clearTimeout = originalClearTimeout;
    globalThis.setTimeout = (handler, delayMs, ...args) => {
      const requestedDelayMs = Number(delayMs);
      const shouldOverride =
        durationTimerOverride !== null && requestedDelayMs === durationTimerOverride.fromMs;
      if (shouldOverride) {
        state.durationTimerOverrideCount += 1;
        markTiming("duration_timer_shortened", {
          fromMs: durationTimerOverride.fromMs,
          toMs: durationTimerOverride.toMs,
        });
        return originalSetTimeout(handler, durationTimerOverride.toMs, ...args);
      }
      return originalSetTimeout(handler, delayMs, ...args);
    };
  }

  function validDelayMs(value, field) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
    return value;
  }

  function validHTTPStatus(value, field) {
    if (!Number.isSafeInteger(value) || value < 100 || value > 599) {
      throw new Error(`${field} must be an HTTP status code`);
    }
    return value;
  }

  function currentRunId() {
    return contextRunId(timingContext);
  }

  function contextRunId(context) {
    return typeof context.runId === "string" && context.runId !== ""
      ? context.runId
      : "__default__";
  }

  function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
})();
