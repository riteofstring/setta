import Foundation

private let listenerSampleRate = 16_000
private let maximumListenerTranscriptCharacters = 8_000

struct ListenerPCMIngestOutcome {
  let events: [ListenerEvent]
  let finalAudio: CapturedAudio?
  let sampleCount: Int
  let transcriptionModelPath: String
}

final class AlwaysListeningAudioProcessor {
  private let audioCopiedBeforeWakeFrameCount: Int
  private let candidateEndpointFrameCount: Int
  private let hardTrailingSilenceFrameCount: Int
  private let maximumUtteranceFrameCount: Int
  private let noMessageTimeoutFrameCount: Int
  private let preWakeBuffer: PCM16RingBuffer
  private let speechStartDebounceFrameCount: Int
  private let threshold: Double
  private(set) var transcriptionModelPath: String

  private var activeCapture: ActiveListenerCapture?
  private var processedFrameCount = 0

  init(request: StartListenerPayload) {
    audioCopiedBeforeWakeFrameCount = frameCount(milliseconds: request.audioCopiedBeforeWakeMs)
    let trailingAudioPaddingFrameCount = frameCount(milliseconds: request.trailingAudioPaddingMs)
    let vadFrameCount = frameCount(milliseconds: request.vadFrameMs)
    candidateEndpointFrameCount = min(
      frameCount(milliseconds: request.hardTrailingSilenceLimitMs),
      max(trailingAudioPaddingFrameCount, vadFrameCount)
    )
    hardTrailingSilenceFrameCount = frameCount(milliseconds: request.hardTrailingSilenceLimitMs)
    maximumUtteranceFrameCount = frameCount(milliseconds: request.maximumUtteranceMs)
    noMessageTimeoutFrameCount = frameCount(milliseconds: request.noMessageTimeoutMs)
    preWakeBuffer = PCM16RingBuffer(capacity: frameCount(milliseconds: request.preWakeRingBufferMs))
    speechStartDebounceFrameCount = frameCount(milliseconds: request.speechStartDebounceMs)
    threshold = request.threshold
    transcriptionModelPath = request.transcriptionModelPath
  }

  func ingest(_ payload: ListenerPCMPayload) throws -> ListenerPCMIngestOutcome {
    guard payload.sampleRate == listenerSampleRate else {
      throw HelperCommandError(
        code: "invalid_listener_pcm",
        message: "Listener PCM must be 16 kHz mono PCM16."
      )
    }
    if let wakeScore = payload.wakeScore, wakeScore < 0 || wakeScore > 1 {
      throw HelperCommandError(code: "invalid_listener_pcm", message: "Wake score is invalid.")
    }
    let samples = try decodePCM16Samples(from: payload.samplesBase64)
    guard !samples.isEmpty || payload.endOfInput == true else {
      throw HelperCommandError(code: "invalid_listener_pcm", message: "Listener PCM is empty.")
    }

    let frameEnd = processedFrameCount + samples.count
    var events: [ListenerEvent] = []
    var finalAudio: CapturedAudio?

    if activeCapture == nil {
      if let wakeScore = payload.wakeScore, wakeScore >= threshold {
        activeCapture = startCapture(score: wakeScore, samples: samples, frameEnd: frameEnd)
        events.append(.wakeDetected(score: wakeScore, timeMs: timeMilliseconds(atFrame: frameEnd)))
      } else {
        preWakeBuffer.append(samples)
      }
    } else {
      activeCapture?.utteranceSamples.append(contentsOf: samples)
    }

    if activeCapture != nil {
      finalAudio = processActiveCapture(
        endOfInput: payload.endOfInput == true,
        frameEnd: frameEnd,
        frameSampleCount: samples.count,
        vadVoice: payload.vadVoice,
        events: &events
      )
    }

    processedFrameCount = frameEnd
    return ListenerPCMIngestOutcome(
      events: events,
      finalAudio: finalAudio,
      sampleCount: samples.count,
      transcriptionModelPath: transcriptionModelPath
    )
  }

  private func startCapture(
    score: Double,
    samples: [Int16],
    frameEnd: Int
  ) -> ActiveListenerCapture {
    let preWakeSamples = preWakeBuffer.suffix(audioCopiedBeforeWakeFrameCount)
    preWakeBuffer.reset()
    var capture = ActiveListenerCapture(
      score: score,
      utteranceSamples: preWakeSamples,
      wakeDetectedAtFrame: frameEnd
    )
    capture.utteranceSamples.append(contentsOf: samples)
    return capture
  }

  private func processActiveCapture(
    endOfInput: Bool,
    frameEnd: Int,
    frameSampleCount: Int,
    vadVoice: Bool,
    events: inout [ListenerEvent]
  ) -> CapturedAudio? {
    guard var capture = activeCapture else {
      return nil
    }

    if !capture.speechStarted {
      if vadVoice {
        capture.consecutiveVoicedFrameCount += frameSampleCount
      } else {
        capture.consecutiveVoicedFrameCount = 0
      }
      if capture.consecutiveVoicedFrameCount >= speechStartDebounceFrameCount {
        capture.speechStarted = true
        events.append(.messageSpeechStarted(timeMs: timeMilliseconds(atFrame: frameEnd)))
      } else if endOfInput || frameEnd - capture.wakeDetectedAtFrame >= noMessageTimeoutFrameCount {
        activeCapture = nil
        preWakeBuffer.reset()
        return nil
      }
    } else {
      if vadVoice {
        capture.consecutiveUnvoicedFrameCount = 0
      } else {
        capture.consecutiveUnvoicedFrameCount += frameSampleCount
        if
          !capture.candidateEndpointSent
            && capture.consecutiveUnvoicedFrameCount >= candidateEndpointFrameCount
        {
          capture.candidateEndpointSent = true
          events.append(.candidateEndpointDetected(timeMs: timeMilliseconds(atFrame: frameEnd)))
        }
      }
    }

    let shouldFinalize =
      capture.utteranceSamples.count >= maximumUtteranceFrameCount
      || capture.consecutiveUnvoicedFrameCount >= hardTrailingSilenceFrameCount
      || endOfInput
    if shouldFinalize && capture.speechStarted {
      if !capture.candidateEndpointSent {
        events.append(.candidateEndpointDetected(timeMs: timeMilliseconds(atFrame: frameEnd)))
      }
      activeCapture = nil
      preWakeBuffer.reset()
      return CapturedAudio(
        sampleRate: listenerSampleRate,
        samples: Array(capture.utteranceSamples.prefix(maximumUtteranceFrameCount))
      )
    }

    activeCapture = capture
    return nil
  }
}

extension AlwaysListeningAudioProcessor {
  func finalizedTranscriptEvent(
    for outcome: ListenerPCMIngestOutcome,
    transcriber: WhisperCPPCommandTranscriber
  ) throws -> ListenerEvent? {
    guard let finalAudio = outcome.finalAudio else {
      return nil
    }
    let transcript = try transcriber.transcribe(
      audio: finalAudio,
      modelPath: outcome.transcriptionModelPath
    )
    if trimmed(transcript) == "" {
      throw HelperCommandError(code: "no_speech", message: "No speech was detected.")
    }
    if transcript.count > maximumListenerTranscriptCharacters {
      throw HelperCommandError(
        code: "transcript_too_large",
        message: "Local macOS voice transcript exceeded the maximum allowed length."
      )
    }
    return .utteranceFinalized(transcript: transcript)
  }
}

private struct ActiveListenerCapture {
  let score: Double
  var candidateEndpointSent = false
  var consecutiveUnvoicedFrameCount = 0
  var consecutiveVoicedFrameCount = 0
  var speechStarted = false
  var utteranceSamples: [Int16]
  let wakeDetectedAtFrame: Int
}

private final class PCM16RingBuffer {
  private let capacity: Int
  private var samples: [Int16] = []

  init(capacity: Int) {
    self.capacity = max(capacity, 1)
  }

  func append(_ chunk: [Int16]) {
    guard !chunk.isEmpty else {
      return
    }
    if chunk.count >= capacity {
      samples = Array(chunk.suffix(capacity))
      return
    }
    samples.append(contentsOf: chunk)
    let overflowCount = samples.count - capacity
    if overflowCount > 0 {
      samples.removeFirst(overflowCount)
    }
  }

  func suffix(_ count: Int) -> [Int16] {
    Array(samples.suffix(min(max(count, 0), samples.count)))
  }

  func reset() {
    samples.removeAll(keepingCapacity: true)
  }
}

private func decodePCM16Samples(from base64: String) throws -> [Int16] {
  guard let data = Data(base64Encoded: base64) else {
    throw HelperCommandError(code: "invalid_listener_pcm", message: "Listener PCM is invalid.")
  }
  guard data.count % 2 == 0 else {
    throw HelperCommandError(code: "invalid_listener_pcm", message: "Listener PCM is invalid.")
  }
  let bytes = [UInt8](data)
  var samples: [Int16] = []
  samples.reserveCapacity(bytes.count / 2)
  var offset = 0
  while offset < bytes.count {
    let value = UInt16(bytes[offset]) | (UInt16(bytes[offset + 1]) << 8)
    samples.append(Int16(bitPattern: value))
    offset += 2
  }
  return samples
}

private func frameCount(milliseconds: Int) -> Int {
  max(1, Int((Int64(milliseconds) * Int64(listenerSampleRate) + 999) / 1_000))
}

private func timeMilliseconds(atFrame frame: Int) -> Int {
  Int((Int64(frame) * 1_000) / Int64(listenerSampleRate))
}
