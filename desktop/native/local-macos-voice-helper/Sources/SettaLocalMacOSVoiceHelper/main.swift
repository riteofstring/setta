import Darwin
import Foundation

final class CaptureSessionStore {
  private let lock = NSLock()
  private var sessions: [String: AudioCaptureSession] = [:]

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
      try session.start()
      return SessionResult(sessionId: request.sessionId)
    } catch {
      _ = remove(request.sessionId)
      throw error
    }
  }

  func finish(_ request: SessionPayload, transcriber: WhisperCPPCommandTranscriber) throws
    -> TranscriptionResult
  {
    guard let session = remove(request.sessionId) else {
      throw HelperCommandError(code: "invalid_session", message: "Capture session is not active.")
    }
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
    }
  }

  private func remove(_ sessionId: String) -> AudioCaptureSession? {
    lock.lock()
    defer { lock.unlock() }
    return sessions.removeValue(forKey: sessionId)
  }
}

final class LocalMacOSVoiceHelperRuntime: @unchecked Sendable {
  private let commandGroup = DispatchGroup()
  private let catalog = SystemVoiceCatalog()
  private let commandQueue = DispatchQueue(
    label: "setta.local-macos-voice.commands",
    attributes: .concurrent
  )
  private let sessions = CaptureSessionStore()
  private let synthesizer: SpeechSynthesisCoordinator
  private let transcriber = WhisperCPPCommandTranscriber()
  private let writer = ResponseWriter()

  init() {
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
    case "read_health":
      let command = try decodeCommand(ReadHealthPayload.self, from: data)
      writer.send(id: command.id, result: readHealth(modelPath: command.payload.modelPath))
    case "start_capture":
      let command = try decodeCommand(StartCapturePayload.self, from: data)
      send(id: command.id) {
        try preflightStartCapture(command.payload)
        return try sessions.start(command.payload)
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

let runtime = LocalMacOSVoiceHelperRuntime()
DispatchQueue.global(qos: .userInitiated).async {
  runtime.run()
  exit(EXIT_SUCCESS)
}
RunLoop.main.run()
