import Foundation

struct BaseCommandEnvelope: Decodable {
  let id: String
  let type: String
}

struct CommandEnvelope<Payload: Decodable>: Decodable {
  let id: String
  let payload: Payload
  let type: String
}

struct EmptyPayload: Codable {}

struct ReadHealthPayload: Codable {
  let modelPath: String
}

struct StartCapturePayload: Codable {
  let maximumRecordingSeconds: Int
  let maximumTranscriptCharacters: Int
  let modelPath: String
  let sessionId: String
}

struct SessionPayload: Codable {
  let sessionId: String
}

struct StartListenerPayload: Codable {
  let audioCopiedBeforeWakeMs: Int
  let candidateEndpointMs: Int
  let hardTrailingSilenceLimitMs: Int
  let maximumUtteranceMs: Int
  let noMessageTimeoutMs: Int
  let preWakeRingBufferMs: Int
  let rearmCooldownMs: Int
  let runtime: String
  let speechStartDebounceMs: Int
  let threshold: Double
  let trailingAudioPaddingMs: Int
  let transcriptionModelPath: String
  let vadFrameMs: Int
  let wakeFrameMs: Int
  let wakeModelPath: String
  let wakeModelSHA256: String
}

struct ListenerReasonPayload: Codable {
  let reason: String
}

struct ListenerPCMPayload: Codable {
  let endOfInput: Bool?
  let sampleRate: Int
  let samplesBase64: String
  let vadVoice: Bool
  let wakeScore: Double?
}

struct SynthesisPayload: Codable {
  let operationId: String
  let rate: Double
  let text: String
  let voiceId: String
}

struct CancelSynthesisPayload: Codable {
  let operationId: String
}

struct HealthResult: Encodable {
  let actualSHA256: String?
  let expectedSHA256: String?
  let message: String?
  let status: String

  static func ready() -> HealthResult {
    HealthResult(actualSHA256: nil, expectedSHA256: nil, message: nil, status: "ready")
  }

  static func unavailable(status: String, message: String) -> HealthResult {
    HealthResult(actualSHA256: nil, expectedSHA256: nil, message: message, status: status)
  }
}

struct SessionResult: Encodable {
  let sessionId: String
}

struct TranscriptionResult: Encodable {
  let sessionId: String
  let transcript: String
}

struct ListenerLifecycleResult: Encodable {
  let status: String
}

struct ListenerPCMResult: Encodable {
  let sampleCount: Int
  let status: String
}

struct ListenerEvent: Encodable {
  let message: String?
  let score: Double?
  let timeMs: Int?
  let transcript: String?
  let type: String

  static func armed() -> ListenerEvent {
    ListenerEvent(message: nil, score: nil, timeMs: nil, transcript: nil, type: "listener_armed")
  }

  static func wakeDetected(score: Double, timeMs: Int) -> ListenerEvent {
    ListenerEvent(
      message: nil,
      score: score,
      timeMs: timeMs,
      transcript: nil,
      type: "wake_detected"
    )
  }

  static func messageSpeechStarted(timeMs: Int) -> ListenerEvent {
    ListenerEvent(
      message: nil,
      score: nil,
      timeMs: timeMs,
      transcript: nil,
      type: "message_speech_started"
    )
  }

  static func candidateEndpointDetected(timeMs: Int) -> ListenerEvent {
    ListenerEvent(
      message: nil,
      score: nil,
      timeMs: timeMs,
      transcript: nil,
      type: "candidate_endpoint_detected"
    )
  }

  static func speechResumed(timeMs: Int) -> ListenerEvent {
    ListenerEvent(
      message: nil,
      score: nil,
      timeMs: timeMs,
      transcript: nil,
      type: "speech_resumed"
    )
  }

  static func utteranceFinalized(transcript: String) -> ListenerEvent {
    ListenerEvent(
      message: nil,
      score: nil,
      timeMs: nil,
      transcript: transcript,
      type: "utterance_finalized"
    )
  }

  static func engineFailed(message: String) -> ListenerEvent {
    ListenerEvent(message: message, score: nil, timeMs: nil, transcript: nil, type: "engine_failed")
  }
}

struct VoiceCatalogResult: Encodable {
  let version: String
  let voiceIds: [String]
}

struct SynthesisResult: Encodable {
  let audioBase64: String
  let format: String
  let mediaType: String
  let operationId: String
}

struct SynthesisCanceledResult: Encodable {
  let operationId: String
}

struct HelperCommandError: Error {
  let code: String
  let message: String
}

private struct SuccessEnvelope<Result: Encodable>: Encodable {
  let id: String
  let ok = true
  let result: Result
  let type = "response"
}

private struct FailureEnvelope: Encodable {
  struct Failure: Encodable {
    let code: String
    let message: String
  }

  let error: Failure
  let id: String
  let ok = false
  let type = "response"
}

private struct ListenerEventEnvelope: Encodable {
  let event: ListenerEvent
  let type = "listener_event"
}

final class ResponseWriter {
  private let encoder = JSONEncoder()
  private let lock = NSLock()

  func send<Result: Encodable>(id: String, result: Result) {
    write(SuccessEnvelope(id: id, result: result))
  }

  func reject(id: String, code: String, message: String) {
    write(FailureEnvelope(error: .init(code: code, message: message), id: id))
  }

  func sendListenerEvent(_ event: ListenerEvent) {
    write(ListenerEventEnvelope(event: event))
  }

  private func write<Envelope: Encodable>(_ envelope: Envelope) {
    do {
      let data = try encoder.encode(envelope)
      lock.lock()
      defer { lock.unlock() }
      FileHandle.standardOutput.write(data)
      FileHandle.standardOutput.write(Data([0x0a]))
    } catch {
      FileHandle.standardError.write(Data("local voice helper response encoding failed\n".utf8))
    }
  }
}

func decodeCommand<Payload: Decodable>(
  _ type: Payload.Type,
  from data: Data
) throws -> CommandEnvelope<Payload> {
  try JSONDecoder().decode(CommandEnvelope<Payload>.self, from: data)
}

func trimmed(_ value: String) -> String {
  value.trimmingCharacters(in: .whitespacesAndNewlines)
}
