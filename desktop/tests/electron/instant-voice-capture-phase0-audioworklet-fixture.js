/* global AudioBufferSourceNode, AudioContext, AudioWorkletNode, Blob, MediaStream, RTCPeerConnection, URL, performance */

(() => {
  const fixtureVersion = "setta-instant-voice-capture-phase0-audioworklet-v1";
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
  if (globalThis.__settaInstantVoiceCaptureAudioWorkletFeasibility?.version === fixtureVersion) {
    return;
  }

  globalThis.__settaInstantVoiceCaptureAudioWorkletFeasibility = {
    run,
    version: fixtureVersion,
  };

  async function run(options) {
    const runner = new AudioWorkletFeasibilityRunner(options);
    return runner.run();
  }

  class AudioWorkletFeasibilityRunner {
    constructor(options) {
      if (!options || typeof options !== "object") {
        throw new Error("AudioWorklet feasibility options must be an object");
      }
      if (typeof options.workletSource !== "string" || options.workletSource.trim() === "") {
        throw new Error("AudioWorklet feasibility requires workletSource");
      }
      this.workletSource = options.workletSource;
      this.simulatedWebRTCReadyDelayMs = nonNegativeInteger(
        options.simulatedWebRTCReadyDelayMs ?? 300,
        "simulatedWebRTCReadyDelayMs",
      );
      this.events = [];
      this.eventSequence = 0;
      this.waiters = [];
      this.resources = {
        context: null,
        objectURL: null,
        peerConnections: [],
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
        graph = this.createAudioGraph(context);
        await this.waitForEvent("gate_ready");
        await this.waitForEvent("probe_ready");
        await this.startSyntheticInput(context, graph.rawDestination);
        await this.waitForEvent("input_prefix_retained");
        this.record("simulated_webrtc_delay_started", {
          delayMs: this.simulatedWebRTCReadyDelayMs,
        });
        await delay(this.simulatedWebRTCReadyDelayMs);
        const peer = await this.connectLoopbackPeer(graph.processedStream);
        this.record("webrtc_ready", peer);
        this.assertNoOutputMarker("prefix", "before release");
        this.assertNoOutputMarker("tail", "before release");
        graph.gate.port.postMessage({ type: "release" });
        this.record("release_sent");
        await this.waitForEvent("gate_released");
        await this.waitForEvent("output_prefix_observed");
        await this.waitForEvent("input_tail_retained");
        await this.stopRawInputAndDrain(context, graph);
        await this.waitForEvent("output_tail_observed");
        await this.waitForEvent("gate_drained");
        const result = this.result(graph, peer);
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
        throw new Error(
          `AudioWorklet feasibility browser support is missing: ${missing.join(", ")}`,
        );
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

    createAudioGraph(context) {
      const sampleRate = context.sampleRate;
      const markerFrames = Math.max(512, Math.round(sampleRate * 0.025));
      const markerThreshold = 0.35;
      const gate = new AudioWorkletNode(context, "setta-phase0-audio-gate", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          capacityFrames: Math.round(sampleRate * 2),
          markerFrames,
          markerThreshold,
          postRollFrames: Math.round(sampleRate * 0.08),
        },
      });
      const probe = new AudioWorkletNode(context, "setta-phase0-audio-probe", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          markerFrames,
          markerThreshold,
        },
      });
      gate.onprocessorerror = () => this.fail(new Error("Audio gate processor failed"));
      probe.onprocessorerror = () => this.fail(new Error("Audio probe processor failed"));
      gate.port.onmessage = (event) => this.acceptGateMessage(event.data);
      probe.port.onmessage = (event) => this.acceptProbeMessage(event.data);

      const rawDestination = context.createMediaStreamDestination();
      const rawTrack = rawDestination.stream.getAudioTracks()[0];
      if (!rawTrack) {
        throw new Error("synthetic raw destination did not expose an audio track");
      }
      this.resources.tracks.push(rawTrack);

      const rawSource = context.createMediaStreamSource(rawDestination.stream);
      const processedDestination = context.createMediaStreamDestination();
      rawSource.connect(gate);
      gate.connect(processedDestination);

      const processedTrack = processedDestination.stream.getAudioTracks()[0];
      if (!processedTrack) {
        throw new Error("processed destination did not expose an audio track");
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

    async connectLoopbackPeer(stream) {
      const track = stream.getAudioTracks()[0];
      if (!track) {
        throw new Error("processed stream did not contain an audio track");
      }
      const offerer = new RTCPeerConnection();
      const answerer = new RTCPeerConnection();
      this.resources.peerConnections.push(offerer, answerer);
      const remoteTrackPromise = new Promise((resolve, reject) => {
        const timeout = globalThis.setTimeout(
          () => reject(new Error("loopback RTCPeerConnection did not receive a remote track")),
          5_000,
        );
        answerer.ontrack = (event) => {
          globalThis.clearTimeout(timeout);
          resolve({
            remoteStreamAudioTracks: event.streams[0]?.getAudioTracks?.().length ?? 0,
            remoteTrackKind: event.track.kind,
            remoteTrackReadyState: event.track.readyState,
          });
        };
      });
      offerer.onicecandidate = (event) => {
        if (event.candidate) {
          void answerer.addIceCandidate(event.candidate);
        }
      };
      answerer.onicecandidate = (event) => {
        if (event.candidate) {
          void offerer.addIceCandidate(event.candidate);
        }
      };
      offerer.createDataChannel("oai-events");
      offerer.addTrack(track, stream);
      this.record("webrtc_track_added", {
        localTrackKind: track.kind,
        localTrackReadyState: track.readyState,
        streamAudioTracks: stream.getAudioTracks().length,
      });
      const offer = await offerer.createOffer();
      await offerer.setLocalDescription(offer);
      await answerer.setRemoteDescription(offer);
      const answer = await answerer.createAnswer();
      await answerer.setLocalDescription(answer);
      await offerer.setRemoteDescription(answer);
      const remoteTrack = await remoteTrackPromise;
      return {
        answerHasAudioMLine: typeof answer.sdp === "string" && answer.sdp.includes("\nm=audio "),
        offerHasAudioMLine: typeof offer.sdp === "string" && offer.sdp.includes("\nm=audio "),
        ...remoteTrack,
      };
    }

    async startSyntheticInput(context, rawDestination) {
      const buffer = this.createSyntheticBuffer(context);
      const source = new AudioBufferSourceNode(context, { buffer });
      source.connect(rawDestination);
      source.start(context.currentTime + 0.05);
      this.resources.source = source;
      this.record("synthetic_input_started", {
        durationSeconds: buffer.duration,
        prefixMarker: this.prefixMarker,
        tailMarker: this.tailMarker,
      });
    }

    createSyntheticBuffer(context) {
      const sampleRate = context.sampleRate;
      const durationSeconds = 1.2;
      const buffer = context.createBuffer(1, Math.ceil(sampleRate * durationSeconds), sampleRate);
      const samples = buffer.getChannelData(0);
      this.prefixMarker = writeMarker(samples, sampleRate, {
        amplitude: 0.65,
        durationSeconds: 0.08,
        name: "prefix",
        startSeconds: 0.05,
      });
      this.tailMarker = writeMarker(samples, sampleRate, {
        amplitude: -0.65,
        durationSeconds: 0.09,
        name: "tail",
        startSeconds: 0.52,
      });
      return buffer;
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
          this.record("synthetic_source_stop_ignored", {
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

    acceptGateMessage(message) {
      if (gateFailureMessageTypes.has(message?.type)) {
        this.fail(new Error(`audio gate failed: ${JSON.stringify(message)}`));
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
        }, 8_000);
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
        throw new Error(`output ${marker} marker was observed ${label}`);
      }
    }

    result(graph, peer) {
      const measurements = {
        inputPrefixToReleaseMs: elapsedMs(this.events, "input_prefix_retained", "release_sent"),
        releaseToOutputPrefixMs: elapsedMs(this.events, "release_sent", "output_prefix_observed"),
        rawStopToOutputTailMs: elapsedMs(this.events, "raw_track_stopped", "output_tail_observed"),
        rawStopToDrainMs: elapsedMs(this.events, "raw_track_stopped", "gate_drained"),
      };
      return {
        events: this.events.map((event) => ({
          ...event,
          detail: { ...event.detail },
          performanceMs: roundMs(event.performanceMs),
        })),
        graph: {
          processedAudioTracks: graph.processedStream.getAudioTracks().length,
          processedTrackKind: graph.processedStream.getAudioTracks()[0]?.kind ?? null,
          processedTrackReadyState: graph.processedStream.getAudioTracks()[0]?.readyState ?? null,
          rawTrackReadyState: graph.rawTrack.readyState,
        },
        measurements,
        peer,
        status: "passed",
      };
    }

    assertResult(result) {
      assertFeasibilityTimeline(this.events);
      assertProcessedGraph(result.graph);
      assertLoopbackPeer(result.peer);
      assertRawTrackStopped(result.graph);
      assertFiniteMeasurements(result.measurements);
    }

    async close(graph) {
      this.rejectWaitersOnClose();
      graph?.gate?.port.postMessage({ type: "close" });
      closePeerConnections(this.resources.peerConnections);
      stopLiveTracks(this.resources.tracks);
      disconnectGraph(this.resources, graph);
      await closeContext(this.resources.context);
      revokeObjectURL(this.resources.objectURL);
    }

    rejectWaitersOnClose() {
      for (const waiter of this.waiters) {
        waiter.reject(new Error("AudioWorklet feasibility runner closed"));
      }
      this.waiters = [];
    }

    firstEvent(name) {
      return this.events.find((event) => event.name === name) ?? null;
    }
  }

  function writeMarker(samples, sampleRate, marker) {
    const startFrame = Math.round(marker.startSeconds * sampleRate);
    const frameCount = Math.round(marker.durationSeconds * sampleRate);
    const endFrame = Math.min(samples.length, startFrame + frameCount);
    for (let frame = startFrame; frame < endFrame; frame += 1) {
      samples[frame] = marker.amplitude;
    }
    return {
      amplitude: marker.amplitude,
      endFrame,
      frameCount: endFrame - startFrame,
      name: marker.name,
      startFrame,
    };
  }

  function requiredEvent(events, name) {
    const event = events.find((candidate) => candidate.name === name);
    if (!event) {
      throw new Error(`missing feasibility event ${name}`);
    }
    return event;
  }

  function assertFeasibilityTimeline(events) {
    const release = requiredEvent(events, "release_sent");
    const prefixInput = requiredEvent(events, "input_prefix_retained");
    const prefixOutput = requiredEvent(events, "output_prefix_observed");
    const tailOutput = requiredEvent(events, "output_tail_observed");
    const rawStop = requiredEvent(events, "raw_track_stopped");
    const webRTCReady = requiredEvent(events, "webrtc_ready");
    requiredEvent(events, "gate_drained");
    assertEventNotEarlier(webRTCReady, prefixInput, "WebRTC readiness", "prefix marker retention");
    assertEventNotEarlier(prefixOutput, release, "prefix marker output", "release");
    assertEventNotEarlier(tailOutput, rawStop, "tail marker output", "raw track stop");
  }

  function assertEventNotEarlier(event, precedingEvent, eventLabel, precedingLabel) {
    if (event.performanceMs < precedingEvent.performanceMs) {
      throw new Error(`${eventLabel} happened before ${precedingLabel}`);
    }
  }

  function assertProcessedGraph(graph) {
    if (graph.processedAudioTracks !== 1) {
      throw new Error(`processed stream track count drifted: ${JSON.stringify(graph)}`);
    }
    if (graph.processedTrackKind !== "audio") {
      throw new Error(`processed stream was not audio: ${JSON.stringify(graph)}`);
    }
  }

  function assertLoopbackPeer(peer) {
    if (peer.remoteTrackKind !== "audio") {
      throw new Error(`loopback peer remote track was not audio: ${JSON.stringify(peer)}`);
    }
    if (peer.remoteTrackReadyState !== "live") {
      throw new Error(`loopback peer remote track was not live: ${JSON.stringify(peer)}`);
    }
    if (!peer.offerHasAudioMLine) {
      throw new Error(`loopback peer offer did not negotiate audio: ${JSON.stringify(peer)}`);
    }
    if (!peer.answerHasAudioMLine) {
      throw new Error(`loopback peer answer did not negotiate audio: ${JSON.stringify(peer)}`);
    }
  }

  function assertRawTrackStopped(graph) {
    if (graph.rawTrackReadyState !== "ended") {
      throw new Error(`raw track was not stopped: ${JSON.stringify(graph)}`);
    }
  }

  function assertFiniteMeasurements(measurements) {
    for (const [field, value] of Object.entries(measurements)) {
      assertFiniteMeasurement(field, value);
    }
  }

  function assertFiniteMeasurement(field, value) {
    if (!Number.isFinite(value)) {
      throw new Error(`feasibility measurement ${field} was not finite`);
    }
  }

  function closePeerConnections(peerConnections) {
    for (const peer of peerConnections) {
      peer.close();
    }
  }

  function stopLiveTracks(tracks) {
    for (const track of tracks) {
      stopLiveTrack(track);
    }
  }

  function stopLiveTrack(track) {
    if (track.readyState !== "ended") {
      track.stop();
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

  function delay(delayMs) {
    return new Promise((resolve) => {
      globalThis.setTimeout(resolve, delayMs);
    });
  }

  function nonNegativeInteger(value, field) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
    return value;
  }
})();
