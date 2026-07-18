/* global AudioBufferSourceNode, AudioContext, AudioWorkletNode, Blob, MediaStream, RTCPeerConnection, URL, atob, fetch, performance */

(() => {
  const fixtureVersion = "setta-instant-voice-capture-phase0-live-openai-v1";
  const completedEventType = "conversation.item.input_audio_transcription.completed";
  const deltaEventType = "conversation.item.input_audio_transcription.delta";
  const errorEventType = "error";
  const sessionCreatedEventType = "session.created";
  const gateFailureMessageTypes = new Set(["error", "overflow"]);
  const gateMessageRecorders = {
    closed: (runner, message) => runner.record("gate_closed", { metrics: message.metrics }),
    drained: (runner, message) =>
      runner.record("gate_drained", {
        metrics: message.metrics,
        workletFrame: message.workletFrame,
      }),
    finish_started: (runner, message) =>
      runner.record("gate_finish_started", { queuedFrames: message.queuedFrames }),
    input_marker_retained: (runner, message) =>
      runner.record(`input_${message.marker}_retained`, {
        retainedFrames: message.retainedFrames,
        workletFrame: message.workletFrame,
      }),
    ready: (runner, message) => runner.record("gate_ready", { metrics: message.metrics }),
    released: (runner, message) =>
      runner.record("gate_released", { queuedFrames: message.queuedFrames }),
  };

  if (globalThis.__settaInstantVoiceCaptureLiveOpenAI?.version === fixtureVersion) {
    return;
  }

  globalThis.__settaInstantVoiceCaptureLiveOpenAI = {
    run,
    version: fixtureVersion,
  };

  async function run(options) {
    const runner = new LiveOpenAISmokeRunner(options);
    return runner.run();
  }

  class LiveOpenAISmokeRunner {
    constructor(options) {
      if (!options || typeof options !== "object") {
        throw new Error("live OpenAI smoke options must be an object");
      }
      if (typeof options.workletSource !== "string" || options.workletSource.trim() === "") {
        throw new Error("live OpenAI smoke requires workletSource");
      }
      if (typeof options.audioBase64 !== "string" || options.audioBase64.trim() === "") {
        throw new Error("live OpenAI smoke requires audioBase64");
      }
      if (!isTranscriptionSession(options.session)) {
        throw new Error("live OpenAI smoke requires a redacted app transcription session");
      }
      this.audioBase64 = options.audioBase64;
      this.expectedPhrase = requiredString(options.expectedPhrase, "expectedPhrase");
      this.session = options.session;
      this.transcriptTimeoutMs = positiveInteger(
        options.transcriptTimeoutMs ?? 45_000,
        "transcriptTimeoutMs",
      );
      this.workletSource = options.workletSource;
      this.channel = null;
      this.events = [];
      this.eventSequence = 0;
      this.failures = [];
      this.sourceEnded = Promise.resolve();
      this.waiters = [];
      this.resources = {
        context: null,
        objectURL: null,
        peer: null,
        tracks: [],
      };
    }

    async run() {
      this.assertBrowserSupport();
      let graph = null;
      try {
        const context = new AudioContext({ latencyHint: "interactive" });
        this.resources.context = context;
        await context.resume();
        this.record("audio_context_resumed", {
          sampleRate: context.sampleRate,
          state: context.state,
        });
        await this.installWorkletModule(context);
        const speechBuffer = await this.decodeSpeechAudio(context);
        graph = this.createAudioGraph(context, speechBuffer);
        await this.waitForEvent("gate_ready");
        await this.waitForEvent("probe_ready");
        this.startSyntheticInput(context, graph.rawDestination, speechBuffer);
        await this.waitForEvent("input_prefix_retained");
        const peer = await this.connectOpenAI(graph.processedStream);
        this.record("webrtc_ready", peer);
        this.assertNoOutputMarker("prefix", "before release");
        graph.gate.port.postMessage({ type: "release" });
        this.record("release_sent");
        await this.waitForEvent("gate_released");
        await this.waitForEvent("output_prefix_observed");
        await this.sourceEnded;
        await this.stopRawInputAndDrain(context, graph);
        await this.waitForEvent("gate_drained");
        this.commitAudio();
        const transcript = await this.waitForTranscript();
        const result = this.result(graph, peer, transcript);
        this.assertResult(result);
        return result;
      } finally {
        await this.close(graph);
      }
    }

    assertBrowserSupport() {
      const missing = [];
      if (typeof AudioContext !== "function") {
        missing.push("AudioContext");
      }
      if (typeof AudioWorkletNode !== "function") {
        missing.push("AudioWorkletNode");
      }
      if (typeof Blob !== "function") {
        missing.push("Blob");
      }
      if (typeof MediaStream !== "function") {
        missing.push("MediaStream");
      }
      if (typeof RTCPeerConnection !== "function") {
        missing.push("RTCPeerConnection");
      }
      if (missing.length > 0) {
        throw new Error(`live OpenAI smoke browser support is missing: ${missing.join(", ")}`);
      }
    }

    async installWorkletModule(context) {
      const blob = new Blob([this.workletSource], { type: "text/javascript" });
      const objectURL = URL.createObjectURL(blob);
      this.resources.objectURL = objectURL;
      await context.audioWorklet.addModule(objectURL);
      this.record("worklet_module_loaded", {
        sourceBytes: this.workletSource.length,
      });
    }

    async decodeSpeechAudio(context) {
      const bytes = bytesFromBase64(this.audioBase64);
      const decoded = await context.decodeAudioData(bytes.buffer);
      this.record("speech_audio_decoded", {
        channels: decoded.numberOfChannels,
        durationSeconds: roundMs(decoded.duration),
        frames: decoded.length,
        sampleRate: decoded.sampleRate,
      });
      return decoded;
    }

    createAudioGraph(context, speechBuffer) {
      const sampleRate = context.sampleRate;
      const markerFrames = Math.max(512, Math.round(sampleRate * 0.025));
      const gate = new AudioWorkletNode(context, "setta-phase0-audio-gate", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          capacityFrames: Math.max(
            Math.round(sampleRate * 20),
            speechBuffer.length + Math.round(sampleRate * 2),
          ),
          markerFrames,
          markerThreshold: 0.35,
          postRollFrames: Math.round(sampleRate * 0.12),
        },
      });
      const probe = new AudioWorkletNode(context, "setta-phase0-audio-probe", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          markerFrames,
          markerThreshold: 0.35,
        },
      });
      gate.onprocessorerror = () => this.fail(new Error("live OpenAI audio gate failed"));
      probe.onprocessorerror = () => this.fail(new Error("live OpenAI audio probe failed"));
      gate.port.onmessage = (event) => this.acceptGateMessage(event.data);
      probe.port.onmessage = (event) => this.acceptProbeMessage(event.data);

      const rawDestination = context.createMediaStreamDestination();
      const rawTrack = rawDestination.stream.getAudioTracks()[0];
      if (!rawTrack) {
        throw new Error("live OpenAI smoke raw destination did not expose an audio track");
      }
      this.resources.tracks.push(rawTrack);

      const rawSource = context.createMediaStreamSource(rawDestination.stream);
      const processedDestination = context.createMediaStreamDestination();
      rawSource.connect(gate);
      gate.connect(processedDestination);

      const processedTrack = processedDestination.stream.getAudioTracks()[0];
      if (!processedTrack) {
        throw new Error("live OpenAI smoke processed destination did not expose an audio track");
      }
      this.resources.tracks.push(processedTrack);

      const processedProbeSource = context.createMediaStreamSource(processedDestination.stream);
      const mutedProbeOutput = context.createGain();
      mutedProbeOutput.gain.value = 0;
      processedProbeSource.connect(probe);
      probe.connect(mutedProbeOutput);
      mutedProbeOutput.connect(context.destination);

      this.record("audio_graph_created", {
        markerFrames,
        processedAudioTracks: processedDestination.stream.getAudioTracks().length,
        processedTrackKind: processedTrack.kind,
        processedTrackReadyState: processedTrack.readyState,
        rawTrackKind: rawTrack.kind,
        rawTrackReadyState: rawTrack.readyState,
        sampleRate,
      });

      return {
        gate,
        mutedProbeOutput,
        probe,
        processedDestination,
        processedProbeSource,
        processedStream: processedDestination.stream,
        rawDestination,
        rawSource,
        rawTrack,
        source: null,
      };
    }

    startSyntheticInput(context, rawDestination, speechBuffer) {
      const buffer = this.createMarkedSpeechBuffer(context, speechBuffer);
      const source = new AudioBufferSourceNode(context, { buffer });
      source.connect(rawDestination);
      this.sourceEnded = new Promise((resolve) => {
        source.onended = () => {
          this.record("speech_source_ended");
          resolve();
        };
      });
      source.start(context.currentTime + 0.05);
      this.resources.source = source;
      this.record("speech_source_started", {
        durationSeconds: roundMs(buffer.duration),
        phrase: this.expectedPhrase,
      });
    }

    createMarkedSpeechBuffer(context, speechBuffer) {
      const sampleRate = context.sampleRate;
      const prefixFrames = Math.round(sampleRate * 0.08);
      const preSpeechSilenceFrames = Math.round(sampleRate * 0.22);
      const postSpeechSilenceFrames = Math.round(sampleRate * 0.12);
      const tailFrames = Math.round(sampleRate * 0.09);
      const trailingSilenceFrames = Math.round(sampleRate * 0.24);
      const speechFrames = speechBuffer.length;
      const speechStartFrame = prefixFrames + preSpeechSilenceFrames;
      const tailStartFrame = speechStartFrame + speechFrames + postSpeechSilenceFrames;
      const totalFrames = tailStartFrame + tailFrames + trailingSilenceFrames;
      const buffer = context.createBuffer(1, totalFrames, sampleRate);
      const samples = buffer.getChannelData(0);
      samples.fill(0.52, 0, prefixFrames);
      copyMonoSpeech(samples, speechStartFrame, speechBuffer);
      samples.fill(-0.52, tailStartFrame, tailStartFrame + tailFrames);
      this.record("marked_speech_buffer_created", {
        prefixFrames,
        speechFrames,
        tailFrames,
        totalFrames,
      });
      return buffer;
    }

    async connectOpenAI(stream) {
      const track = stream.getAudioTracks()[0];
      if (!track) {
        throw new Error("live OpenAI processed stream did not contain an audio track");
      }
      const peer = new RTCPeerConnection();
      this.resources.peer = peer;
      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      const channelOpen = this.waitForDataChannelOpen(channel);
      const sessionCreated = this.waitForRealtimeSessionCreated(channel);
      const peerFailure = this.waitForPeerConnectionFailure(peer);
      peer.addTrack(track, stream);
      this.record("webrtc_track_added", {
        localTrackKind: track.kind,
        localTrackReadyState: track.readyState,
        streamAudioTracks: stream.getAudioTracks().length,
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      this.record("webrtc_offer_created", {
        offerHasAudioMLine: typeof offer.sdp === "string" && offer.sdp.includes("\nm=audio "),
      });
      const response = await fetch(this.session.webRTCURL, {
        body: offer.sdp,
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/sdp",
          Authorization: `Bearer ${this.session.clientSecret}`,
          "Content-Type": "application/sdp",
        },
        method: "POST",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
      if (!response.ok) {
        throw new Error(
          `live OpenAI WebRTC answer failed with HTTP ${response.status}: ${(
            await response.text()
          ).slice(0, 512)}`,
        );
      }
      const answerSDP = await response.text();
      this.record("webrtc_answer_response", {
        answerBytes: answerSDP.length,
        status: response.status,
      });
      await peer.setRemoteDescription({ sdp: answerSDP, type: "answer" });
      this.record("webrtc_remote_description_set", {
        answerHasAudioMLine: answerSDP.includes("\nm=audio "),
      });
      await Promise.race([Promise.all([channelOpen, sessionCreated]), peerFailure]);
      channel.onerror = () => this.fail(new Error("live OpenAI data channel failed"));
      channel.onclose = () => this.record("realtime_data_channel_closed");
      peer.onconnectionstatechange = () => {
        this.record("webrtc_connection_state", { state: peer.connectionState });
        if (peer.connectionState === "failed") {
          this.fail(new Error(`live OpenAI WebRTC state became ${peer.connectionState}`));
        }
      };
      return {
        answerHasAudioMLine: answerSDP.includes("\nm=audio "),
        dataChannelReadyState: channel.readyState,
        offerHasAudioMLine: typeof offer.sdp === "string" && offer.sdp.includes("\nm=audio "),
        peerConnectionState: peer.connectionState,
      };
    }

    waitForDataChannelOpen(channel) {
      if (channel.readyState === "open") {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        const failOpen = (message) => {
          cleanup();
          reject(new Error(message));
        };
        const handleOpen = () => {
          cleanup();
          this.record("realtime_data_channel_open");
          resolve();
        };
        const handleError = () => failOpen("live OpenAI data channel failed before opening");
        const handleClose = () => failOpen("live OpenAI data channel closed before opening");
        const cleanup = () => {
          globalThis.clearTimeout(timeout);
          channel.removeEventListener("close", handleClose);
          channel.removeEventListener("error", handleError);
          channel.removeEventListener("open", handleOpen);
        };
        const timeout = globalThis.setTimeout(
          () => failOpen("live OpenAI data channel did not open"),
          15_000,
        );
        channel.addEventListener("close", handleClose, { once: true });
        channel.addEventListener("error", handleError, { once: true });
        channel.addEventListener("open", handleOpen, { once: true });
      });
    }

    waitForRealtimeSessionCreated(channel) {
      return new Promise((resolve, reject) => {
        const acceptMessage = (event) => {
          const message = decodeRealtimeMessage(event.data);
          this.acceptRealtimeMessage(message);
          return message;
        };
        const failSessionCreated = (error) => {
          cleanup();
          reject(error);
        };
        const handleMessage = (event) => {
          let message;
          try {
            message = acceptMessage(event);
          } catch (error) {
            failSessionCreated(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          if (message.type === sessionCreatedEventType) {
            cleanup();
            channel.onmessage = acceptMessage;
            resolve();
          }
        };
        const handleError = () =>
          failSessionCreated(new Error("live OpenAI data channel failed before session.created"));
        const handleClose = () =>
          failSessionCreated(new Error("live OpenAI data channel closed before session.created"));
        const cleanup = () => {
          globalThis.clearTimeout(timeout);
          if (channel.onmessage === handleMessage) {
            channel.onmessage = null;
          }
          channel.removeEventListener("close", handleClose);
          channel.removeEventListener("error", handleError);
        };
        const timeout = globalThis.setTimeout(
          () => failSessionCreated(new Error("live OpenAI session.created was not received")),
          15_000,
        );
        channel.onmessage = handleMessage;
        channel.addEventListener("close", handleClose, { once: true });
        channel.addEventListener("error", handleError, { once: true });
      });
    }

    waitForPeerConnectionFailure(peer) {
      return new Promise((_, reject) => {
        peer.onconnectionstatechange = () => {
          this.record("webrtc_connection_state", { state: peer.connectionState });
          if (peer.connectionState === "failed") {
            reject(new Error(`live OpenAI WebRTC state became ${peer.connectionState}`));
          }
        };
      });
    }

    async stopRawInputAndDrain(context, graph) {
      const source = this.resources.source;
      const rawStopTime = performance.now();
      graph.rawTrack.stop();
      const rawTrackReadyStateAfterStop = graph.rawTrack.readyState;
      if (source) {
        try {
          source.stop(context.currentTime);
        } catch (error) {
          this.record("speech_source_stop_ignored", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      graph.rawSource.disconnect();
      graph.gate.port.postMessage({ type: "finish" });
      this.record("raw_track_stopped", {
        rawTrackReadyStateAfterStop,
        rawStopTime,
      });
      this.record("finish_sent");
    }

    commitAudio() {
      if (!this.channel || this.channel.readyState !== "open") {
        throw new Error("live OpenAI data channel is not ready for commit");
      }
      this.channel.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      this.record("transcript_commit_sent");
    }

    waitForTranscript() {
      const existing = this.firstEvent("transcript_completed");
      if (existing) {
        return Promise.resolve(existing.detail.transcript);
      }
      return new Promise((resolve, reject) => {
        const timeout = globalThis.setTimeout(() => {
          reject(new Error("live OpenAI transcript was not completed"));
        }, this.transcriptTimeoutMs);
        this.waiters.push({
          name: "transcript_completed",
          reject,
          resolve: (event) => {
            globalThis.clearTimeout(timeout);
            resolve(event.detail.transcript);
          },
        });
      });
    }

    acceptRealtimeMessage(message) {
      switch (message.type) {
        case sessionCreatedEventType:
          this.record("realtime_session_created", {
            providerSessionId: stringOrNull(message.session?.id),
          });
          break;
        case deltaEventType:
          this.record("transcript_delta_received", {
            characters: typeof message.delta === "string" ? message.delta.length : 0,
          });
          break;
        case completedEventType:
          this.record("transcript_completed", {
            transcript: requiredString(message.transcript, "completed transcript"),
            usageType: stringOrNull(message.usage?.type),
          });
          break;
        case errorEventType:
          this.fail(new Error(`live OpenAI realtime error: ${JSON.stringify(message.error)}`));
          break;
        default:
          this.record("realtime_event_received", { type: stringOrNull(message.type) });
          break;
      }
    }

    acceptGateMessage(message) {
      if (gateFailureMessageTypes.has(message?.type)) {
        this.fail(new Error(`live OpenAI audio gate failed: ${JSON.stringify(message)}`));
        return;
      }
      const recorder = gateMessageRecorders[message?.type];
      if (recorder) {
        recorder(this, message);
        return;
      }
      this.record("gate_unknown_message", { message });
    }

    acceptProbeMessage(message) {
      switch (message?.type) {
        case "ready":
          this.record("probe_ready", { metrics: message.metrics });
          break;
        case "output_marker_observed":
          this.record(`output_${message.marker}_observed`, {
            observedFrames: message.observedFrames,
            workletFrame: message.workletFrame,
          });
          break;
        default:
          this.record("probe_unknown_message", { message });
          break;
      }
    }

    record(name, detail = {}) {
      const event = {
        detail,
        name,
        performanceMs: performance.now(),
        sequence: this.eventSequence,
      };
      this.eventSequence += 1;
      this.events.push(event);
      this.resolveWaiters();
      return event;
    }

    waitForEvent(name) {
      const existing = this.firstEvent(name);
      if (existing) {
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const timeout = globalThis.setTimeout(() => {
          reject(new Error(`timed out waiting for ${name}`));
        }, 15_000);
        this.waiters.push({
          name,
          reject,
          resolve: (event) => {
            globalThis.clearTimeout(timeout);
            resolve(event);
          },
        });
      });
    }

    resolveWaiters() {
      const pending = [];
      for (const waiter of this.waiters) {
        const event = this.firstEvent(waiter.name);
        if (event) {
          waiter.resolve(event);
        } else {
          pending.push(waiter);
        }
      }
      this.waiters = pending;
    }

    fail(error) {
      this.failures.push(error);
      for (const waiter of this.waiters) {
        waiter.reject(error);
      }
      this.waiters = [];
      throw error;
    }

    assertNoOutputMarker(marker, label) {
      const release = this.firstEvent("release_sent");
      const event = this.firstEvent(`output_${marker}_observed`);
      if (!event) {
        return;
      }
      if (!release || event.performanceMs < release.performanceMs) {
        throw new Error(`live OpenAI output ${marker} marker was observed ${label}`);
      }
    }

    result(graph, peer, transcript) {
      const measurements = {
        commitToCompletedTranscriptMs: elapsedMs(
          this.events,
          "transcript_commit_sent",
          "transcript_completed",
        ),
        inputPrefixToWebRTCReadyMs: elapsedMs(this.events, "input_prefix_retained", "webrtc_ready"),
        rawStopToDrainMs: elapsedMs(this.events, "raw_track_stopped", "gate_drained"),
        releaseToOutputPrefixMs: elapsedMs(this.events, "release_sent", "output_prefix_observed"),
        sourceStartToCompletedTranscriptMs: elapsedMs(
          this.events,
          "speech_source_started",
          "transcript_completed",
        ),
      };
      return {
        events: this.events.map((event) => ({
          ...event,
          detail: { ...event.detail },
          performanceMs: roundMs(event.performanceMs),
        })),
        expectedPhrase: this.expectedPhrase,
        graph: {
          processedAudioTracks: graph.processedStream.getAudioTracks().length,
          processedTrackKind: graph.processedStream.getAudioTracks()[0]?.kind ?? null,
          processedTrackReadyState: graph.processedStream.getAudioTracks()[0]?.readyState ?? null,
          rawTrackReadyState: graph.rawTrack.readyState,
        },
        measurements,
        peer,
        status: "passed",
        transcript,
      };
    }

    assertResult(result) {
      assertRequiredEvents(this.events, [
        "input_prefix_retained",
        "webrtc_ready",
        "release_sent",
        "output_prefix_observed",
        "raw_track_stopped",
        "gate_drained",
        "transcript_commit_sent",
        "transcript_completed",
      ]);
      assertEventNotEarlier(
        requiredEvent(this.events, "webrtc_ready"),
        requiredEvent(this.events, "input_prefix_retained"),
        "WebRTC readiness",
        "prefix retention",
      );
      assertEventNotEarlier(
        requiredEvent(this.events, "output_prefix_observed"),
        requiredEvent(this.events, "release_sent"),
        "processed prefix output",
        "release",
      );
      assertEventNotEarlier(
        requiredEvent(this.events, "transcript_commit_sent"),
        requiredEvent(this.events, "gate_drained"),
        "commit",
        "gate drain",
      );
      if (result.graph.processedAudioTracks !== 1 || result.graph.processedTrackKind !== "audio") {
        throw new Error(`live OpenAI processed graph drifted: ${JSON.stringify(result.graph)}`);
      }
      if (result.graph.rawTrackReadyState !== "ended") {
        throw new Error(`live OpenAI raw track was not stopped: ${JSON.stringify(result.graph)}`);
      }
      for (const [field, value] of Object.entries(result.measurements)) {
        if (!Number.isFinite(value)) {
          throw new Error(`live OpenAI smoke measurement ${field} was not finite`);
        }
      }
    }

    async close(graph) {
      this.rejectWaitersOnClose();
      graph?.gate?.port.postMessage({ type: "close" });
      this.channel?.close?.();
      this.resources.peer?.close?.();
      stopLiveTracks(this.resources.tracks);
      disconnectGraph(this.resources, graph);
      await closeContext(this.resources.context);
      revokeObjectURL(this.resources.objectURL);
    }

    rejectWaitersOnClose() {
      for (const waiter of this.waiters) {
        waiter.reject(new Error("live OpenAI smoke runner closed"));
      }
      this.waiters = [];
    }

    firstEvent(name) {
      return this.events.find((event) => event.name === name) ?? null;
    }
  }

  function copyMonoSpeech(target, offset, speechBuffer) {
    const channels = [];
    for (let channel = 0; channel < speechBuffer.numberOfChannels; channel += 1) {
      channels.push(speechBuffer.getChannelData(channel));
    }
    const peak = channels.reduce(
      (currentPeak, channel) =>
        Math.max(
          currentPeak,
          channel.reduce((channelPeak, sample) => Math.max(channelPeak, Math.abs(sample)), 0),
        ),
      0,
    );
    const scale = peak > 0.78 ? 0.78 / peak : 1;
    for (let index = 0; index < speechBuffer.length; index += 1) {
      let sample = 0;
      for (const channel of channels) {
        sample += channel[index] ?? 0;
      }
      target[offset + index] = (sample / channels.length) * scale;
    }
  }

  function bytesFromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function decodeRealtimeMessage(data) {
    if (typeof data !== "string") {
      throw new Error("live OpenAI realtime event was not text");
    }
    const message = JSON.parse(data);
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw new Error("live OpenAI realtime event was not an object");
    }
    return message;
  }

  function isTranscriptionSession(value) {
    return (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof value.clientSecret === "string" &&
      value.clientSecret !== "" &&
      typeof value.webRTCURL === "string" &&
      value.webRTCURL !== ""
    );
  }

  function requiredString(value, field) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${field} must be a non-empty string`);
    }
    return value;
  }

  function stringOrNull(value) {
    return typeof value === "string" ? value : null;
  }

  function requiredEvent(events, name) {
    const event = events.find((candidate) => candidate.name === name);
    if (!event) {
      throw new Error(`live OpenAI smoke missing event ${name}`);
    }
    return event;
  }

  function assertRequiredEvents(events, names) {
    const eventNames = new Set(events.map((event) => event.name));
    for (const name of names) {
      if (!eventNames.has(name)) {
        throw new Error(`live OpenAI smoke missing event ${name}`);
      }
    }
  }

  function assertEventNotEarlier(event, precedingEvent, eventLabel, precedingLabel) {
    if (event.performanceMs < precedingEvent.performanceMs) {
      throw new Error(`live OpenAI ${eventLabel} happened before ${precedingLabel}`);
    }
  }

  function stopLiveTracks(tracks) {
    for (const track of tracks) {
      if (track.readyState !== "ended") {
        track.stop();
      }
    }
  }

  function disconnectGraph(resources, graph) {
    disconnectIfPresent(resources.source);
    disconnectIfPresent(graph?.rawSource);
    disconnectIfPresent(graph?.gate);
    disconnectIfPresent(graph?.processedProbeSource);
    disconnectIfPresent(graph?.probe);
    disconnectIfPresent(graph?.mutedProbeOutput);
  }

  function disconnectIfPresent(node) {
    node?.disconnect?.();
  }

  async function closeContext(context) {
    if (context) {
      await context.close();
    }
  }

  function revokeObjectURL(objectURL) {
    if (objectURL) {
      URL.revokeObjectURL(objectURL);
    }
  }

  function elapsedMs(events, startName, endName) {
    const start = requiredEvent(events, startName);
    const end = requiredEvent(events, endName);
    return roundMs(end.performanceMs - start.performanceMs);
  }

  function roundMs(value) {
    return Math.round(value * 10) / 10;
  }

  function positiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${field} must be a positive integer`);
    }
    return value;
  }
})();
