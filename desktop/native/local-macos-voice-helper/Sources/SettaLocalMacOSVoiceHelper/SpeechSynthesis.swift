@preconcurrency import AVFoundation
import CryptoKit
import Foundation

final class SystemVoiceCatalog {
  func list() throws -> VoiceCatalogResult {
    let voiceIds = installedVoiceIds()
    if voiceIds.isEmpty {
      throw HelperCommandError(
        code: "synthesis_unavailable",
        message: "No installed macOS system voices are available."
      )
    }
    return VoiceCatalogResult(version: version(for: voiceIds), voiceIds: voiceIds)
  }

  func contains(_ voiceId: String) -> Bool {
    installedVoiceIds().contains(voiceId)
  }

  private func installedVoiceIds() -> [String] {
    let preferredLanguage = AVSpeechSynthesisVoice.currentLanguageCode()
    let preferredVoiceID = AVSpeechSynthesisVoice(language: preferredLanguage)?.identifier
    var seen = Set<String>()
    return AVSpeechSynthesisVoice.speechVoices()
      .filter { !trimmed($0.identifier).isEmpty }
      .filter { seen.insert($0.identifier).inserted }
      .sorted {
        precedes(
          $0,
          $1,
          preferredLanguage: preferredLanguage,
          preferredVoiceID: preferredVoiceID
        )
      }
      .map(\.identifier)
  }

  private func version(for voiceIds: [String]) -> String {
    let joined = voiceIds.joined(separator: "\n")
    let digest = SHA256.hash(data: Data(joined.utf8))
    let hex = digest.map { String(format: "%02x", $0) }.joined()
    return "apple-system-voices-\(hex.prefix(12))"
  }

  private func precedes(
    _ lhs: AVSpeechSynthesisVoice,
    _ rhs: AVSpeechSynthesisVoice,
    preferredLanguage: String,
    preferredVoiceID: String?
  ) -> Bool {
    let lhsPriority = voicePriority(
      lhs,
      preferredLanguage: preferredLanguage,
      preferredVoiceID: preferredVoiceID
    )
    let rhsPriority = voicePriority(
      rhs,
      preferredLanguage: preferredLanguage,
      preferredVoiceID: preferredVoiceID
    )
    if lhsPriority != rhsPriority {
      return lhsPriority < rhsPriority
    }
    if lhs.quality.rawValue != rhs.quality.rawValue {
      return lhs.quality.rawValue > rhs.quality.rawValue
    }
    return lhs.identifier < rhs.identifier
  }

  private func voicePriority(
    _ voice: AVSpeechSynthesisVoice,
    preferredLanguage: String,
    preferredVoiceID: String?
  ) -> Int {
    if let preferredVoiceID, voice.identifier == preferredVoiceID {
      return 0
    }
    if voice.language == preferredLanguage {
      return 1
    }
    if languageFamily(voice.language) == languageFamily(preferredLanguage) {
      return 2
    }
    if languageFamily(voice.language) == "en" {
      return 3
    }
    return 4
  }

  private func languageFamily(_ language: String) -> String {
    language.split(separator: "-", maxSplits: 1).first.map(String.init) ?? language
  }
}

final class SpeechSynthesisCoordinator {
  private let catalog: SystemVoiceCatalog
  private let lock = NSLock()
  private var operations: [String: SpeechSynthesisOperation] = [:]

  init(catalog: SystemVoiceCatalog) {
    self.catalog = catalog
  }

  func synthesize(_ request: SynthesisPayload) throws -> SynthesisResult {
    guard trimmed(request.text) != "" else {
      throw HelperCommandError(code: "synthesis_failed", message: "Speech text is empty.")
    }
    guard request.text.count <= 20_000 else {
      throw HelperCommandError(code: "text_too_large", message: "Speech text is too large.")
    }
    guard catalog.contains(request.voiceId) else {
      throw HelperCommandError(
        code: "voice_unavailable",
        message: "The selected macOS system voice is unavailable."
      )
    }

    let operation = SpeechSynthesisOperation(request: request)
    lock.lock()
    if operations[request.operationId] != nil {
      lock.unlock()
      throw HelperCommandError(
        code: "synthesis_failed",
        message: "Speech synthesis operation is already active."
      )
    }
    operations[request.operationId] = operation
    lock.unlock()

    defer {
      lock.lock()
      operations.removeValue(forKey: request.operationId)
      lock.unlock()
    }
    return try operation.run()
  }

  func cancel(operationId: String) {
    lock.lock()
    let operation = operations[operationId]
    lock.unlock()
    operation?.cancel()
  }

  func cancelAll() {
    lock.lock()
    let current = Array(operations.values)
    operations.removeAll()
    lock.unlock()
    for operation in current {
      operation.cancel()
    }
  }
}

final class SpeechSynthesisOperation: NSObject {
  private let completion = DispatchSemaphore(value: 0)
  private let lock = NSLock()
  private let request: SynthesisPayload
  private let synthesizer = AVSpeechSynthesizer()
  private var error: HelperCommandError?
  private var sampleRate: Int?
  private var samples: [Int16] = []
  private var signaled = false

  init(request: SynthesisPayload) {
    self.request = request
    super.init()
  }

  func run() throws -> SynthesisResult {
    guard let voice = AVSpeechSynthesisVoice(identifier: request.voiceId) else {
      throw HelperCommandError(
        code: "voice_unavailable",
        message: "The selected macOS system voice is unavailable."
      )
    }
    let utterance = AVSpeechUtterance(string: request.text)
    utterance.voice = voice
    utterance.rate = speechRate(from: request.rate)
    synthesizer.write(utterance) { [weak self] buffer in
      self?.receive(buffer)
    }
    completion.wait()

    lock.lock()
    let failure = error
    let capturedSamples = samples
    let capturedSampleRate = sampleRate
    lock.unlock()

    if let failure {
      throw failure
    }
    guard !capturedSamples.isEmpty, let capturedSampleRate else {
      throw HelperCommandError(
        code: "synthesis_failed",
        message: "Speech synthesis produced no audio."
      )
    }
    let audio = WAVEncoder.encode(samples: capturedSamples, sampleRate: capturedSampleRate)
    return SynthesisResult(
      audioBase64: audio.base64EncodedString(),
      format: "wav",
      mediaType: "audio/wav",
      operationId: request.operationId
    )
  }

  func cancel() {
    lock.lock()
    error = HelperCommandError(
      code: "synthesis_failed",
      message: "Speech synthesis was canceled."
    )
    lock.unlock()
    synthesizer.stopSpeaking(at: .immediate)
    signal()
  }

  private func receive(_ buffer: AVAudioBuffer) {
    guard let pcmBuffer = buffer as? AVAudioPCMBuffer else {
      fail("Speech synthesis returned unsupported audio.")
      return
    }
    if pcmBuffer.frameLength == 0 {
      signal()
      return
    }
    do {
      let chunk = try PCM16.samples(from: pcmBuffer)
      lock.lock()
      if sampleRate == nil {
        sampleRate = Int(pcmBuffer.format.sampleRate)
      }
      samples.append(contentsOf: chunk)
      lock.unlock()
    } catch {
      fail("Speech synthesis audio conversion failed.")
    }
  }

  private func fail(_ message: String) {
    lock.lock()
    error = HelperCommandError(code: "synthesis_failed", message: message)
    lock.unlock()
    synthesizer.stopSpeaking(at: .immediate)
    signal()
  }

  private func signal() {
    lock.lock()
    let shouldSignal = !signaled
    signaled = true
    lock.unlock()
    if shouldSignal {
      completion.signal()
    }
  }

  private func speechRate(from rate: Double) -> Float {
    let scaled = Float(rate) * AVSpeechUtteranceDefaultSpeechRate
    return min(max(scaled, AVSpeechUtteranceMinimumSpeechRate), AVSpeechUtteranceMaximumSpeechRate)
  }
}
