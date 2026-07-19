import Foundation

final class WhisperCPPCommandTranscriber {
  private let environment: [String: String]
  private let fileManager: FileManager

  init(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) {
    self.environment = environment
    self.fileManager = fileManager
  }

  func healthUnavailable() -> HealthResult? {
    if locateWhisperCommand() == nil {
      return .unavailable(
        status: "helper_unavailable",
        message: "The whisper.cpp command is not installed."
      )
    }
    return nil
  }

  func transcribe(audio: CapturedAudio, modelPath: String) throws -> String {
    guard !audio.samples.isEmpty else {
      throw HelperCommandError(code: "no_speech", message: "No speech was detected.")
    }
    guard let command = locateWhisperCommand() else {
      throw HelperCommandError(
        code: "helper_unavailable",
        message: "The whisper.cpp command is not installed."
      )
    }
    let tempDirectory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
      .appendingPathComponent("setta-local-voice-\(UUID().uuidString)", isDirectory: true)
    try fileManager.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    defer {
      try? fileManager.removeItem(at: tempDirectory)
    }
    let audioURL = tempDirectory.appendingPathComponent("capture.wav")
    try WAVEncoder.encode(audio: audio).write(to: audioURL, options: .atomic)
    return try runWhisper(command: command, modelPath: modelPath, audioPath: audioURL.path)
  }

  private func locateWhisperCommand() -> String? {
    let explicit = trimmed(environment["SETTA_LOCAL_MACOS_VOICE_WHISPER_CLI_PATH"] ?? "")
    if isExecutable(explicit) {
      return explicit
    }
    let executable = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
    let sibling = executable.deletingLastPathComponent().appendingPathComponent("whisper-cli").path
    return isExecutable(sibling) ? sibling : nil
  }

  private func isExecutable(_ path: String) -> Bool {
    !path.isEmpty && fileManager.isExecutableFile(atPath: path)
  }

  private func runWhisper(command: String, modelPath: String, audioPath: String) throws -> String {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: command)
    process.arguments = ["-m", modelPath, "-f", audioPath, "-nt", "-np"]
    let stdout = Pipe()
    let stderr = Pipe()
    process.standardOutput = stdout
    process.standardError = stderr
    do {
      try process.run()
    } catch {
      throw HelperCommandError(
        code: "helper_unavailable",
        message: "The whisper.cpp command could not start."
      )
    }
    process.waitUntilExit()
    if process.terminationStatus != 0 {
      throw HelperCommandError(
        code: "transcription_failed",
        message: "whisper.cpp transcription failed."
      )
    }
    let output = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)
      ?? ""
    _ = stderr.fileHandleForReading.readDataToEndOfFile()
    return trimmed(output)
  }
}
