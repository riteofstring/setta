import Foundation
import whisper

private struct WhisperCLIArguments {
  let audioInput: WhisperCLIAudioInput
  let modelPath: String
}

private enum WhisperCLIAudioInput {
  case file(String)
  case standardInput
}

private struct WAVAudio {
  let samples: [Float]
  let sampleRate: Int
}

private struct WAVFormat {
  let bitsPerSample: Int
  let channelCount: Int
  let sampleRate: Int
}

private enum CLIError: Error, CustomStringConvertible {
  case invalidArguments
  case invalidWAV(String)
  case modelLoadFailed
  case transcriptionFailed

  var description: String {
    switch self {
    case .invalidArguments:
      return "usage: whisper-cli -m <model-path> -f <audio-wav|-> [-nt] [-np]"
    case .invalidWAV(let message):
      return message
    case .modelLoadFailed:
      return "failed to load whisper model"
    case .transcriptionFailed:
      return "whisper transcription failed"
    }
  }
}

do {
  let arguments = try parseArguments(CommandLine.arguments.dropFirst())
  let audio = try readWAV(input: arguments.audioInput)
  let transcript = try transcribe(audio: audio, modelPath: arguments.modelPath)
  FileHandle.standardOutput.write(Data(transcript.utf8))
  FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
  FileHandle.standardError.write(Data("\(error)\n".utf8))
  exit(1)
}

private func parseArguments<S: Sequence>(_ rawArguments: S) throws -> WhisperCLIArguments
where S.Element == String {
  var audioPath: String?
  var modelPath: String?
  var iterator = rawArguments.makeIterator()
  while let argument = iterator.next() {
    switch argument {
    case "-m":
      modelPath = iterator.next()
    case "-f":
      audioPath = iterator.next()
    case "-np", "-nt":
      continue
    default:
      throw CLIError.invalidArguments
    }
  }
  guard let audioPath, let modelPath else {
    throw CLIError.invalidArguments
  }
  return WhisperCLIArguments(
    audioInput: audioPath == "-" ? .standardInput : .file(audioPath),
    modelPath: modelPath
  )
}

private func readWAV(input: WhisperCLIAudioInput) throws -> WAVAudio {
  let data: Data
  switch input {
  case .file(let path):
    data = try Data(contentsOf: URL(fileURLWithPath: path))
  case .standardInput:
    data = FileHandle.standardInput.readDataToEndOfFile()
  }
  guard data.count >= 12, data.ascii(at: 0, count: 4) == "RIFF",
    data.ascii(at: 8, count: 4) == "WAVE"
  else {
    throw CLIError.invalidWAV("audio file is not a RIFF/WAVE file")
  }

  var format: WAVFormat?
  var dataRange: Range<Int>?
  var offset = 12
  while offset + 8 <= data.count {
    let chunkID = data.ascii(at: offset, count: 4)
    let chunkSize = Int(data.uint32LE(at: offset + 4))
    let payloadStart = offset + 8
    let payloadEnd = payloadStart + chunkSize
    guard payloadEnd <= data.count else {
      throw CLIError.invalidWAV("audio file contains a malformed chunk")
    }
    if chunkID == "fmt " {
      format = try decodeFormatChunk(data[payloadStart..<payloadEnd])
    } else if chunkID == "data" {
      dataRange = payloadStart..<payloadEnd
    }
    offset = payloadEnd + (chunkSize % 2)
  }

  guard let format else {
    throw CLIError.invalidWAV("audio file does not contain a format chunk")
  }
  guard let dataRange else {
    throw CLIError.invalidWAV("audio file does not contain PCM data")
  }
  guard format.sampleRate == 16_000 else {
    throw CLIError.invalidWAV("audio file must be 16 kHz")
  }
  guard format.bitsPerSample == 16, format.channelCount == 1 else {
    throw CLIError.invalidWAV("audio file must be 16-bit mono PCM")
  }
  return WAVAudio(samples: decodePCM16Mono(data[dataRange]), sampleRate: format.sampleRate)
}

private func decodeFormatChunk(_ data: Data.SubSequence) throws -> WAVFormat {
  let chunk = Data(data)
  guard chunk.count >= 16 else {
    throw CLIError.invalidWAV("audio format chunk is too short")
  }
  let audioFormat = chunk.uint16LE(at: 0)
  guard audioFormat == 1 else {
    throw CLIError.invalidWAV("audio file must use PCM encoding")
  }
  return WAVFormat(
    bitsPerSample: Int(chunk.uint16LE(at: 14)),
    channelCount: Int(chunk.uint16LE(at: 2)),
    sampleRate: Int(chunk.uint32LE(at: 4))
  )
}

private func decodePCM16Mono(_ data: Data.SubSequence) -> [Float] {
  let byteCount = data.count - (data.count % 2)
  var samples: [Float] = []
  samples.reserveCapacity(byteCount / 2)
  var index = data.startIndex
  let end = data.index(data.startIndex, offsetBy: byteCount)
  while index < end {
    let next = data.index(after: index)
    let raw = UInt16(data[index]) | (UInt16(data[next]) << 8)
    let sample = Int16(bitPattern: raw)
    samples.append(max(-1, Float(sample) / 32768.0))
    index = data.index(index, offsetBy: 2)
  }
  return samples
}

private func transcribe(audio: WAVAudio, modelPath: String) throws -> String {
  var contextParams = whisper_context_default_params()
  contextParams.use_gpu = true
  guard
    let context = modelPath.withCString({
      whisper_init_from_file_with_params($0, contextParams)
    })
  else {
    throw CLIError.modelLoadFailed
  }
  defer { whisper_free(context) }

  var params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY)
  params.no_context = true
  params.no_timestamps = true
  params.print_progress = false
  params.print_realtime = false
  params.print_special = false
  params.print_timestamps = false
  params.n_threads = Int32(max(1, min(8, ProcessInfo.processInfo.activeProcessorCount - 1)))

  let result = "en".withCString { language in
    params.language = language
    return audio.samples.withUnsafeBufferPointer { buffer in
      guard let baseAddress = buffer.baseAddress else {
        return Int32(1)
      }
      return whisper_full(context, params, baseAddress, Int32(buffer.count))
    }
  }
  guard result == 0 else {
    throw CLIError.transcriptionFailed
  }

  var transcript = ""
  for index in 0..<whisper_full_n_segments(context) {
    if let segment = whisper_full_get_segment_text(context, index) {
      transcript += String(cString: segment)
    }
  }
  return transcript.trimmingCharacters(in: .whitespacesAndNewlines)
}

private extension Data {
  func ascii(at offset: Int, count: Int) -> String {
    guard offset >= 0, offset + count <= self.count else {
      return ""
    }
    return String(decoding: self[offset..<(offset + count)], as: UTF8.self)
  }

  func uint16LE(at offset: Int) -> UInt16 {
    UInt16(self[offset]) | (UInt16(self[offset + 1]) << 8)
  }

  func uint32LE(at offset: Int) -> UInt32 {
    UInt32(self[offset]) | (UInt32(self[offset + 1]) << 8) | (UInt32(self[offset + 2]) << 16)
      | (UInt32(self[offset + 3]) << 24)
  }
}
