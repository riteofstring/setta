@preconcurrency import AVFoundation
import Foundation

private final class LockedMicrophonePermission: @unchecked Sendable {
  private let lock = NSLock()
  private var allowed = false

  func set(_ value: Bool) {
    lock.lock()
    allowed = value
    lock.unlock()
  }

  func read() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    return allowed
  }
}

private final class ConverterInputState: @unchecked Sendable {
  private let buffer: AVAudioPCMBuffer
  private let lock = NSLock()
  private var didProvideInput = false

  init(buffer: AVAudioPCMBuffer) {
    self.buffer = buffer
  }

  func read(_ status: UnsafeMutablePointer<AVAudioConverterInputStatus>) -> AVAudioBuffer? {
    lock.lock()
    defer { lock.unlock() }
    if didProvideInput {
      status.pointee = .noDataNow
      return nil
    }
    didProvideInput = true
    status.pointee = .haveData
    return buffer
  }
}

struct CapturedAudio {
  let sampleRate: Int
  let samples: [Int16]
}

enum MicrophoneAccess {
  static func ensureGranted() throws {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized:
      return
    case .denied, .restricted:
      throw HelperCommandError(
        code: "microphone_denied",
        message: "Microphone access is denied for Setta."
      )
    case .notDetermined:
      let result = LockedMicrophonePermission()
      let semaphore = DispatchSemaphore(value: 0)
      AVCaptureDevice.requestAccess(for: .audio) { allowed in
        result.set(allowed)
        semaphore.signal()
      }
      semaphore.wait()
      if !result.read() {
        throw HelperCommandError(
          code: "microphone_denied",
          message: "Microphone access is denied for Setta."
        )
      }
    @unknown default:
      throw HelperCommandError(
        code: "microphone_denied",
        message: "Microphone permission state is unavailable."
      )
    }
  }

  static func deniedHealth() -> HealthResult? {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .denied, .restricted:
      return .unavailable(
        status: "microphone_denied",
        message: "Microphone access is denied for Setta."
      )
    case .authorized, .notDetermined:
      return nil
    @unknown default:
      return .unavailable(
        status: "microphone_denied",
        message: "Microphone permission state is unavailable."
      )
    }
  }
}

final class AudioCaptureSession {
  private let engine = AVAudioEngine()
  private let lock = NSLock()
  private let maximumFrameCount: Int
  private let targetFormat: AVAudioFormat
  private var converter: AVAudioConverter?
  private var reachedDurationLimit = false
  private var samples: [Int16] = []
  private var stopped = false

  let maximumTranscriptCharacters: Int
  let modelPath: String
  let sessionId: String

  init(request: StartCapturePayload) throws {
    guard request.maximumRecordingSeconds > 0 else {
      throw HelperCommandError(code: "invalid_session", message: "Recording limit is invalid.")
    }
    guard request.maximumTranscriptCharacters > 0 else {
      throw HelperCommandError(code: "invalid_session", message: "Transcript limit is invalid.")
    }
    guard
      let format = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: 16_000,
        channels: 1,
        interleaved: false
      )
    else {
      throw HelperCommandError(
        code: "helper_unavailable",
        message: "Local microphone capture format is unavailable."
      )
    }
    maximumFrameCount = request.maximumRecordingSeconds * 16_000
    maximumTranscriptCharacters = request.maximumTranscriptCharacters
    modelPath = request.modelPath
    sessionId = request.sessionId
    targetFormat = format
  }

  func start() throws {
    let input = engine.inputNode
    let inputFormat = input.outputFormat(forBus: 0)
    guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
      throw HelperCommandError(
        code: "helper_unavailable",
        message: "Local microphone input is unavailable."
      )
    }
    guard let audioConverter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
      throw HelperCommandError(
        code: "helper_unavailable",
        message: "Local microphone capture converter is unavailable."
      )
    }
    converter = audioConverter
    input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
      self?.append(buffer)
    }
    engine.prepare()
    do {
      try engine.start()
    } catch {
      input.removeTap(onBus: 0)
      throw HelperCommandError(
        code: "helper_unavailable",
        message: "Local microphone capture could not start."
      )
    }
  }

  func finish() throws -> CapturedAudio {
    stop()
    let captured = readSamples()
    if reachedDurationLimit {
      throw HelperCommandError(
        code: "duration_limit",
        message: "Local capture reached the recording limit."
      )
    }
    return CapturedAudio(sampleRate: Int(targetFormat.sampleRate), samples: captured)
  }

  func cancel() {
    stop()
  }

  private func append(_ buffer: AVAudioPCMBuffer) {
    lock.lock()
    defer { lock.unlock() }
    guard !reachedDurationLimit, let converter else {
      return
    }
    do {
      let converted = try convert(buffer, using: converter)
      let remaining = maximumFrameCount - samples.count
      if converted.count >= remaining {
        samples.append(contentsOf: converted.prefix(max(remaining, 0)))
        reachedDurationLimit = true
      } else {
        samples.append(contentsOf: converted)
      }
    } catch {
      reachedDurationLimit = true
    }
  }

  private func stop() {
    lock.lock()
    let shouldStop = !stopped
    stopped = true
    lock.unlock()
    guard shouldStop else {
      return
    }
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
  }

  private func readSamples() -> [Int16] {
    lock.lock()
    defer { lock.unlock() }
    return samples
  }

  private func convert(_ buffer: AVAudioPCMBuffer, using converter: AVAudioConverter) throws
    -> [Int16]
  {
    let ratio = targetFormat.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
    guard let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else {
      throw HelperCommandError(
        code: "helper_unavailable",
        message: "Local microphone capture buffer is unavailable."
      )
    }
    let inputState = ConverterInputState(buffer: buffer)
    var conversionError: NSError?
    converter.convert(to: output, error: &conversionError) { _, status in
      inputState.read(status)
    }
    if conversionError != nil {
      throw HelperCommandError(
        code: "helper_unavailable",
        message: "Local microphone capture conversion failed."
      )
    }
    return try PCM16.samples(from: output)
  }
}

enum PCM16 {
  static func samples(from buffer: AVAudioPCMBuffer) throws -> [Int16] {
    switch buffer.format.commonFormat {
    case .pcmFormatFloat32:
      return try floatSamples(from: buffer)
    case .pcmFormatInt16:
      return try intSamples(from: buffer)
    default:
      throw HelperCommandError(
        code: "helper_unavailable",
        message: "Local audio buffer format is unsupported."
      )
    }
  }

  private static func floatSamples(from buffer: AVAudioPCMBuffer) throws -> [Int16] {
    guard let channelData = buffer.floatChannelData else {
      throw HelperCommandError(code: "helper_unavailable", message: "Local audio buffer is empty.")
    }
    let frameCount = Int(buffer.frameLength)
    let channelCount = Int(buffer.format.channelCount)
    var samples: [Int16] = []
    samples.reserveCapacity(frameCount)
    for frame in 0..<frameCount {
      var mixed: Float = 0
      for channel in 0..<channelCount {
        let sample = buffer.format.isInterleaved
          ? channelData[0][frame * channelCount + channel]
          : channelData[channel][frame]
        mixed += sample
      }
      samples.append(floatToInt16(mixed / Float(max(channelCount, 1))))
    }
    return samples
  }

  private static func intSamples(from buffer: AVAudioPCMBuffer) throws -> [Int16] {
    guard let channelData = buffer.int16ChannelData else {
      throw HelperCommandError(code: "helper_unavailable", message: "Local audio buffer is empty.")
    }
    let frameCount = Int(buffer.frameLength)
    let channelCount = Int(buffer.format.channelCount)
    var samples: [Int16] = []
    samples.reserveCapacity(frameCount)
    for frame in 0..<frameCount {
      var mixed = 0
      for channel in 0..<channelCount {
        let sample = buffer.format.isInterleaved
          ? channelData[0][frame * channelCount + channel]
          : channelData[channel][frame]
        mixed += Int(sample)
      }
      samples.append(Int16(clamping: mixed / max(channelCount, 1)))
    }
    return samples
  }

  private static func floatToInt16(_ value: Float) -> Int16 {
    let clamped = min(max(value, -1), 1)
    return Int16(clamping: Int((clamped * Float(Int16.max)).rounded()))
  }
}

enum WAVEncoder {
  static func encode(audio: CapturedAudio) -> Data {
    encode(samples: audio.samples, sampleRate: audio.sampleRate)
  }

  static func encode(samples: [Int16], sampleRate: Int) -> Data {
    let byteCount = samples.count * MemoryLayout<Int16>.size
    var data = Data()
    data.reserveCapacity(44 + byteCount)
    appendASCII("RIFF", to: &data)
    appendUInt32(UInt32(36 + byteCount), to: &data)
    appendASCII("WAVE", to: &data)
    appendASCII("fmt ", to: &data)
    appendUInt32(16, to: &data)
    appendUInt16(1, to: &data)
    appendUInt16(1, to: &data)
    appendUInt32(UInt32(sampleRate), to: &data)
    appendUInt32(UInt32(sampleRate * 2), to: &data)
    appendUInt16(2, to: &data)
    appendUInt16(16, to: &data)
    appendASCII("data", to: &data)
    appendUInt32(UInt32(byteCount), to: &data)
    for sample in samples {
      appendInt16(sample, to: &data)
    }
    return data
  }

  private static func appendASCII(_ value: String, to data: inout Data) {
    data.append(contentsOf: value.utf8)
  }

  private static func appendUInt32(_ value: UInt32, to data: inout Data) {
    var littleEndian = value.littleEndian
    withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
  }

  private static func appendUInt16(_ value: UInt16, to data: inout Data) {
    var littleEndian = value.littleEndian
    withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
  }

  private static func appendInt16(_ value: Int16, to data: inout Data) {
    var littleEndian = value.littleEndian
    withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
  }
}
