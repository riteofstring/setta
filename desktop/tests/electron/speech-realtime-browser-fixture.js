/* global MessageEvent, Response, TextEncoder, navigator, queueMicrotask */

(() => {
  const fixtureVersion = "setta-speech-realtime-browser-fixture-v1";
  if (globalThis.__settaSpeechRealtimeBrowserFixture?.version === fixtureVersion) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const originalPeerConnection = globalThis.RTCPeerConnection;
  const originalAudio = globalThis.Audio;
  const activeAudio = new Set();
  const state = {
    audioAutoEnd: true,
    audioCreateCount: 0,
    audioEndCount: 0,
    audioPauseCount: 0,
    audioPlayCount: 0,
    channelOpen: false,
    commitCount: 0,
    connectionCount: 0,
    mediaRequestCount: 0,
    stoppedTrackCount: 0,
    transcript: "Keep this pane transcript exact.",
  };

  class ScriptedAudio {
    constructor(url) {
      this.currentTime = 0;
      this.listeners = { ended: new Set(), error: new Set() };
      this.url = url;
      activeAudio.add(this);
      state.audioCreateCount += 1;
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
    }

    open() {
      this.readyState = "open";
      state.channelOpen = true;
      this.onopen?.();
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
      queueMicrotask(() => {
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
    }

    addTrack() {}

    close() {
      this.connectionState = "closed";
    }

    createDataChannel(label) {
      if (label !== "oai-events") {
        throw new Error(`unexpected scripted Realtime data channel ${label}`);
      }
      this.channel = new ScriptedDataChannel();
      return this.channel;
    }

    async createOffer() {
      return { sdp: "scripted-offer-sdp", type: "offer" };
    }

    async setLocalDescription() {}

    async setRemoteDescription() {
      queueMicrotask(() => this.channel?.open());
    }
  }

  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (constraints?.audio !== true || constraints?.video !== false) {
      return originalGetUserMedia(constraints);
    }
    state.mediaRequestCount += 1;
    const track = {
      enabled: true,
      kind: "audio",
      readyState: "live",
      stop() {
        this.readyState = "ended";
        state.stoppedTrackCount += 1;
      },
    };
    return {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    };
  };

  globalThis.fetch = async (url, init) => {
    if (url !== "https://api.openai.com/v1/realtime/calls") {
      return originalFetch(url, init);
    }
    const answer = "scripted-answer-sdp";
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
      globalThis.Audio = originalAudio;
      globalThis.fetch = originalFetch;
      globalThis.RTCPeerConnection = originalPeerConnection;
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      delete globalThis.__settaSpeechRealtimeBrowserFixture;
    },
    setTranscript(transcript) {
      state.transcript = transcript;
    },
    setAudioAutoEnd(autoEnd) {
      state.audioAutoEnd = autoEnd;
    },
    snapshot() {
      return { ...state };
    },
    version: fixtureVersion,
  };
})();
