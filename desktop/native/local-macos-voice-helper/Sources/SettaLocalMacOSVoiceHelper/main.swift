import Darwin
import CryptoKit
import Foundation

enum MicrophoneOwner: Equatable {
  case alwaysListening
  case manualCapture(String)
}

final class MicrophoneOwnershipCoordinator {
  private let lock = NSLock()
  private var owner: MicrophoneOwner?

  func claimManualCapture(sessionId: String) throws {
    try claim(.manualCapture(sessionId))
  }

  func releaseManualCapture(sessionId: String) {
    release(.manualCapture(sessionId))
  }

  func claimAlwaysListening() throws {
    try claim(.alwaysListening)
  }

  func releaseAlwaysListening() {
    release(.alwaysListening)
  }

  private func claim(_ requestedOwner: MicrophoneOwner) throws {
    lock.lock()
    defer { lock.unlock() }
    if owner != nil {
      throw HelperCommandError(
        code: "microphone_busy",
        message: "Local macOS microphone is already in use."
      )
    }
    owner = requestedOwner
  }

  private func release(_ expectedOwner: MicrophoneOwner) {
    lock.lock()
    if owner == expectedOwner {
      owner = nil
    }
    lock.unlock()
  }
}

final class CaptureSessionStore {
  private let lock = NSLock()
  private let microphone: MicrophoneOwnershipCoordinator
  private var sessions: [String: AudioCaptureSession] = [:]

  init(microphone: MicrophoneOwnershipCoordinator) {
    self.microphone = microphone
  }

  func start(_ request: StartCapturePayload) throws -> SessionResult {
    guard trimmed(request.sessionId) != "" else {
      throw HelperCommandError(code: "invalid_session", message: "Capture session id is empty.")
    }
    let session = try AudioCaptureSession(request: request)
    lock.lock()
    if sessions[request.sessionId] != nil {
      lock.unlock()
      throw HelperCommandError(
        code: "invalid_session",
        message: "Capture session is already active."
      )
    }
    sessions[request.sessionId] = session
    lock.unlock()
    do {
      try microphone.claimManualCapture(sessionId: request.sessionId)
    } catch {
      _ = remove(request.sessionId)
      throw error
    }
    do {
      try session.start()
      return SessionResult(sessionId: request.sessionId)
    } catch {
      _ = remove(request.sessionId)
      microphone.releaseManualCapture(sessionId: request.sessionId)
      throw error
    }
  }

  func finish(_ request: SessionPayload, transcriber: WhisperCPPCommandTranscriber) throws
    -> TranscriptionResult
  {
    guard let session = remove(request.sessionId) else {
      throw HelperCommandError(code: "invalid_session", message: "Capture session is not active.")
    }
    defer { microphone.releaseManualCapture(sessionId: request.sessionId) }
    let audio = try session.finish()
    let transcript = try transcriber.transcribe(audio: audio, modelPath: session.modelPath)
    if trimmed(transcript) == "" {
      throw HelperCommandError(code: "no_speech", message: "No speech was detected.")
    }
    if transcript.count > session.maximumTranscriptCharacters {
      throw HelperCommandError(
        code: "transcript_too_large",
        message: "Local macOS voice transcript exceeded the maximum allowed length."
      )
    }
    return TranscriptionResult(sessionId: request.sessionId, transcript: transcript)
  }

  func cancel(_ request: SessionPayload) throws -> SessionResult {
    guard let session = remove(request.sessionId) else {
      throw HelperCommandError(code: "invalid_session", message: "Capture session is not active.")
    }
    defer { microphone.releaseManualCapture(sessionId: request.sessionId) }
    session.cancel()
    return SessionResult(sessionId: request.sessionId)
  }

  func cancelAll() {
    lock.lock()
    let current = Array(sessions.values)
    sessions.removeAll()
    lock.unlock()
    for session in current {
      session.cancel()
      microphone.releaseManualCapture(sessionId: session.sessionId)
    }
  }

  private func remove(_ sessionId: String) -> AudioCaptureSession? {
    lock.lock()
    defer { lock.unlock() }
    return sessions.removeValue(forKey: sessionId)
  }
}

final class AlwaysListeningSessionStore {
  private let lock = NSLock()
  private let microphone: MicrophoneOwnershipCoordinator
  private var active = false
  private var pauseReasons = Set<String>()

  init(microphone: MicrophoneOwnershipCoordinator) {
    self.microphone = microphone
  }

  func start(_ request: StartListenerPayload) throws -> ListenerLifecycleResult {
    try validateStartPayload(request)
    lock.lock()
    if active {
      lock.unlock()
      throw HelperCommandError(
        code: "invalid_listener",
        message: "Always listening is already active."
      )
    }
    active = true
    pauseReasons.removeAll()
    lock.unlock()
    do {
      try microphone.claimAlwaysListening()
      return ListenerLifecycleResult(status: "started")
    } catch {
      lock.lock()
      active = false
      lock.unlock()
      throw error
    }
  }

  func stop(_ request: ListenerReasonPayload) throws -> ListenerLifecycleResult {
    guard request.reason == "setting_disabled" || request.reason == "shutdown" else {
      throw HelperCommandError(code: "invalid_listener", message: "Listener stop reason is invalid.")
    }
    lock.lock()
    let wasActive = active
    active = false
    pauseReasons.removeAll()
    lock.unlock()
    guard wasActive else {
      throw HelperCommandError(code: "invalid_listener", message: "Always listening is not active.")
    }
    microphone.releaseAlwaysListening()
    return ListenerLifecycleResult(status: "stopped")
  }

  func pause(_ request: ListenerReasonPayload) throws -> ListenerLifecycleResult {
    try validatePauseReason(request.reason)
    lock.lock()
    guard active else {
      lock.unlock()
      throw HelperCommandError(code: "invalid_listener", message: "Always listening is not active.")
    }
    pauseReasons.insert(request.reason)
    lock.unlock()
    microphone.releaseAlwaysListening()
    return ListenerLifecycleResult(status: "paused")
  }

  func resume(_ request: ListenerReasonPayload) throws -> (ListenerLifecycleResult, Bool) {
    try validatePauseReason(request.reason)
    lock.lock()
    guard active else {
      lock.unlock()
      throw HelperCommandError(code: "invalid_listener", message: "Always listening is not active.")
    }
    pauseReasons.remove(request.reason)
    let shouldReclaim = pauseReasons.isEmpty
    lock.unlock()
    if shouldReclaim {
      try microphone.claimAlwaysListening()
    }
    return (ListenerLifecycleResult(status: "resumed"), shouldReclaim)
  }

  func stopIfActive() {
    lock.lock()
    let wasActive = active
    active = false
    pauseReasons.removeAll()
    lock.unlock()
    if wasActive {
      microphone.releaseAlwaysListening()
    }
  }

  private func validatePauseReason(_ reason: String) throws {
    guard reason == "manual_capture" || reason == "playback" else {
      throw HelperCommandError(
        code: "invalid_listener",
        message: "Listener pause reason is invalid."
      )
    }
  }

  private func validateStartPayload(_ request: StartListenerPayload) throws {
    guard request.runtime == "onnx" || request.runtime == "tflite" else {
      throw HelperCommandError(code: "invalid_listener", message: "Wake runtime is invalid.")
    }
    let positiveDurations = [
      request.audioCopiedBeforeWakeMs,
      request.hardTrailingSilenceLimitMs,
      request.maximumUtteranceMs,
      request.noMessageTimeoutMs,
      request.preWakeRingBufferMs,
      request.rearmCooldownMs,
      request.speechStartDebounceMs,
      request.trailingAudioPaddingMs,
      request.vadFrameMs,
      request.wakeFrameMs,
    ]
    guard positiveDurations.allSatisfy({ $0 > 0 }) else {
      throw HelperCommandError(code: "invalid_listener", message: "Listener timing is invalid.")
    }
    guard request.threshold > 0, request.threshold <= 1 else {
      throw HelperCommandError(code: "invalid_listener", message: "Wake threshold is invalid.")
    }
    guard FileManager.default.isReadableFile(atPath: request.transcriptionModelPath) else {
      throw HelperCommandError(code: "missing_model", message: "Whisper model file is missing.")
    }
    guard FileManager.default.isReadableFile(atPath: request.wakeModelPath) else {
      throw HelperCommandError(code: "missing_model", message: "Wake model file is missing.")
    }
    let wakeModelSHA256 = try sha256HexFile(path: request.wakeModelPath)
    guard wakeModelSHA256.lowercased() == request.wakeModelSHA256.lowercased() else {
      throw HelperCommandError(
        code: "model_hash_mismatch",
        message: "Wake model hash does not match the expected Setta model."
      )
    }
    try MicrophoneAccess.ensureGranted()
  }
}

final class LocalMacOSVoiceHelperRuntime: @unchecked Sendable {
  private let commandGroup = DispatchGroup()
  private let catalog = SystemVoiceCatalog()
  private let commandQueue = DispatchQueue(
    label: "setta.local-macos-voice.commands",
    attributes: .concurrent
  )
  private let listener: AlwaysListeningSessionStore
  private let microphone: MicrophoneOwnershipCoordinator
  private let sessions: CaptureSessionStore
  private let synthesizer: SpeechSynthesisCoordinator
  private let transcriber = WhisperCPPCommandTranscriber()
  private let writer = ResponseWriter()

  init() {
    let microphone = MicrophoneOwnershipCoordinator()
    self.microphone = microphone
    listener = AlwaysListeningSessionStore(microphone: microphone)
    sessions = CaptureSessionStore(microphone: microphone)
    synthesizer = SpeechSynthesisCoordinator(catalog: catalog)
  }

  func run() {
    while let line = readLine() {
      guard let data = line.data(using: .utf8), !trimmed(line).isEmpty else {
        continue
      }
      commandGroup.enter()
      commandQueue.async {
        defer { self.commandGroup.leave() }
        self.handle(data)
      }
    }
    commandGroup.wait()
    listener.stopIfActive()
    sessions.cancelAll()
    synthesizer.cancelAll()
  }

  private func handle(_ data: Data) {
    do {
      let base = try JSONDecoder().decode(BaseCommandEnvelope.self, from: data)
      do {
        try handleKnownCommand(base: base, data: data)
      } catch let error as HelperCommandError {
        writer.reject(id: base.id, code: error.code, message: error.message)
      } catch {
        writer.reject(
          id: base.id,
          code: "malformed_command",
          message: "Command payload is invalid."
        )
      }
    } catch {
      FileHandle.standardError.write(Data("local voice helper command decoding failed\n".utf8))
    }
  }

  private func handleKnownCommand(base: BaseCommandEnvelope, data: Data) throws {
    switch base.type {
    case "cancel_capture":
      try completeSessionCommand(base: base, data: data, action: sessions.cancel)
    case "cancel_synthesis":
      let command = try decodeCommand(CancelSynthesisPayload.self, from: data)
      synthesizer.cancel(operationId: command.payload.operationId)
      writer.send(
        id: command.id,
        result: SynthesisCanceledResult(operationId: command.payload.operationId)
      )
    case "finish_capture":
      let command = try decodeCommand(SessionPayload.self, from: data)
      send(id: command.id) {
        try sessions.finish(command.payload, transcriber: transcriber)
      }
    case "list_voices":
      let command = try decodeCommand(EmptyPayload.self, from: data)
      send(id: command.id) {
        try catalog.list()
      }
    case "pause_listener":
      let command = try decodeCommand(ListenerReasonPayload.self, from: data)
      send(id: command.id) {
        try listener.pause(command.payload)
      }
    case "read_health":
      let command = try decodeCommand(ReadHealthPayload.self, from: data)
      writer.send(id: command.id, result: readHealth(modelPath: command.payload.modelPath))
    case "resume_listener":
      let command = try decodeCommand(ListenerReasonPayload.self, from: data)
      send(id: command.id) {
        let result = try listener.resume(command.payload)
        if result.1 {
          writer.sendListenerEvent(.armed())
        }
        return result.0
      }
    case "start_capture":
      let command = try decodeCommand(StartCapturePayload.self, from: data)
      send(id: command.id) {
        try preflightStartCapture(command.payload)
        return try sessions.start(command.payload)
      }
    case "start_listener":
      let command = try decodeCommand(StartListenerPayload.self, from: data)
      send(id: command.id) {
        let result = try listener.start(command.payload)
        writer.sendListenerEvent(.armed())
        return result
      }
    case "stop_listener":
      let command = try decodeCommand(ListenerReasonPayload.self, from: data)
      send(id: command.id) {
        try listener.stop(command.payload)
      }
    case "synthesize_speech":
      let command = try decodeCommand(SynthesisPayload.self, from: data)
      send(id: command.id) {
        try synthesizer.synthesize(command.payload)
      }
    default:
      writer.reject(
        id: base.id,
        code: "unsupported_command",
        message: "Command is unsupported."
      )
    }
  }

  private func completeSessionCommand(
    base: BaseCommandEnvelope,
    data: Data,
    action: (SessionPayload) throws -> SessionResult
  ) throws {
    let command = try decodeCommand(SessionPayload.self, from: data)
    send(id: command.id) {
      try action(command.payload)
    }
  }

  private func send<Result: Encodable>(id: String, action: () throws -> Result) {
    do {
      writer.send(id: id, result: try action())
    } catch let error as HelperCommandError {
      writer.reject(id: id, code: error.code, message: error.message)
    } catch {
      writer.reject(id: id, code: "helper_unavailable", message: "Local macOS voice failed.")
    }
  }

  private func preflightStartCapture(_ payload: StartCapturePayload) throws {
    guard FileManager.default.isReadableFile(atPath: payload.modelPath) else {
      throw HelperCommandError(code: "missing_model", message: "Whisper model file is missing.")
    }
    try MicrophoneAccess.ensureGranted()
    if let health = transcriber.healthUnavailable() {
      throw HelperCommandError(
        code: health.status,
        message: health.message ?? "Local voice is unavailable."
      )
    }
  }

  private func readHealth(modelPath: String) -> HealthResult {
    guard FileManager.default.isReadableFile(atPath: modelPath) else {
      return .unavailable(status: "missing_model", message: "Whisper model file is missing.")
    }
    if let unavailable = transcriber.healthUnavailable() {
      return unavailable
    }
    if let microphone = MicrophoneAccess.deniedHealth() {
      return microphone
    }
    do {
      _ = try catalog.list()
    } catch let error as HelperCommandError {
      return .unavailable(status: error.code, message: error.message)
    } catch {
      return .unavailable(
        status: "synthesis_unavailable",
        message: "macOS system speech synthesis is unavailable."
      )
    }
    return .ready()
  }
}

func sha256HexFile(path: String) throws -> String {
  let data = try Data(contentsOf: URL(fileURLWithPath: path))
  let digest = SHA256.hash(data: data)
  return digest.map { String(format: "%02x", $0) }.joined()
}

let runtime = LocalMacOSVoiceHelperRuntime()
DispatchQueue.global(qos: .userInitiated).async {
  runtime.run()
  exit(EXIT_SUCCESS)
}
RunLoop.main.run()
