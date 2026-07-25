import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, type WriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { LocalMacOSVoiceModelDownloadStatus } from "@shared/speech-ipc";
import { localMacOSSpeechProviderID } from "@shared/speech-providers";
import type { LocalMacOSVoiceDefaultModelConfiguration } from "./local-macos-voice-resources";

export interface LocalMacOSVoiceModelDownloadService {
  defaultModelConfiguration: () => LocalMacOSVoiceDefaultModelConfiguration;
  readStatus: () => Promise<LocalMacOSVoiceModelDownloadStatus>;
  shutdown: () => void;
  startDownload: () => Promise<LocalMacOSVoiceModelDownloadStatus>;
}

export interface LocalMacOSVoiceModelDownloadServiceOptions {
  fetchImpl?: LocalMacOSVoiceModelFetch;
  model?: LocalMacOSVoiceModelDownloadSpec;
  onStatusChanged?: (status: LocalMacOSVoiceModelDownloadStatus) => void;
  platform?: NodeJS.Platform;
  userDataDir: string;
}

export interface LocalMacOSVoiceModelDownloadSpec {
  bytes: number;
  filename: string;
  name: string;
  sha256: string;
  url: string;
}

type LocalMacOSVoiceModelFetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

const localMacOSProvider = localMacOSSpeechProviderID();
const progressEmitIntervalBytes = 1_000_000;

const defaultLocalMacOSVoiceModelDownloadSpec = {
  bytes: 147_964_211,
  filename: "ggml-base.en.bin",
  name: "base.en",
  sha256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
} as const satisfies LocalMacOSVoiceModelDownloadSpec;

export function createLocalMacOSVoiceModelDownloadService({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  model = defaultLocalMacOSVoiceModelDownloadSpec,
  onStatusChanged,
  platform = process.platform,
  userDataDir,
}: LocalMacOSVoiceModelDownloadServiceOptions): LocalMacOSVoiceModelDownloadService {
  return new DefaultLocalMacOSVoiceModelDownloadService({
    fetchImpl,
    model,
    onStatusChanged,
    platform,
    targetPath: localMacOSVoiceModelPath(userDataDir, model),
  });
}

export function localMacOSVoiceModelPath(
  userDataDir: string,
  model: LocalMacOSVoiceModelDownloadSpec = defaultLocalMacOSVoiceModelDownloadSpec,
): string {
  return join(userDataDir, "local-macos-voice", "models", model.filename);
}

class DefaultLocalMacOSVoiceModelDownloadService implements LocalMacOSVoiceModelDownloadService {
  private abortController: AbortController | null = null;
  private active: Promise<LocalMacOSVoiceModelDownloadStatus> | null = null;
  private status: LocalMacOSVoiceModelDownloadStatus;

  constructor(
    private readonly options: {
      fetchImpl: LocalMacOSVoiceModelFetch | undefined;
      model: LocalMacOSVoiceModelDownloadSpec;
      onStatusChanged?: (status: LocalMacOSVoiceModelDownloadStatus) => void;
      platform: NodeJS.Platform;
      targetPath: string;
    },
  ) {
    this.status = this.idleStatus();
  }

  defaultModelConfiguration = (): LocalMacOSVoiceDefaultModelConfiguration => ({
    modelPath: this.options.targetPath,
    modelSHA256: this.options.model.sha256,
  });

  readStatus = async (): Promise<LocalMacOSVoiceModelDownloadStatus> => {
    if (this.options.platform !== "darwin") {
      return this.unavailableStatus("Local macOS voice downloads are available only on macOS.");
    }
    if (this.active !== null) {
      return this.status;
    }
    if (this.status.status === "failed") {
      return this.status;
    }
    return (await this.readExistingModelStatus()) ?? this.idleStatus();
  };

  startDownload = async (): Promise<LocalMacOSVoiceModelDownloadStatus> => {
    if (this.options.platform !== "darwin") {
      return this.publish(
        this.unavailableStatus("Local macOS voice downloads are available only on macOS."),
      );
    }
    if (this.active !== null) {
      return this.status;
    }
    const existing = await this.readExistingModelStatus();
    if (existing?.status === "ready") {
      return this.publish(existing);
    }
    if (!this.options.fetchImpl) {
      return this.publish(
        this.failedStatus(0, "Setta cannot download the local voice model in this runtime."),
      );
    }

    const controller = new AbortController();
    this.abortController = controller;
    this.publish(this.downloadingStatus(0));
    const download = this.runDownload(controller);
    this.active = download;
    void download.finally(() => {
      if (this.active === download) {
        this.active = null;
        this.abortController = null;
      }
    });
    return this.status;
  };

  shutdown = (): void => {
    this.abortController?.abort();
  };

  private async runDownload(
    controller: AbortController,
  ): Promise<LocalMacOSVoiceModelDownloadStatus> {
    let bytesDownloaded = 0;
    const tmpPath = `${this.options.targetPath}.${process.pid}.${Date.now()}.download`;
    try {
      await mkdir(dirname(this.options.targetPath), { recursive: true });
      bytesDownloaded = await this.writeVerifiedModelDownload(tmpPath, controller, (bytes) => {
        bytesDownloaded = bytes;
      });
      await rename(tmpPath, this.options.targetPath);
      return this.publish(this.readyStatus());
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      return this.publish(this.failedStatus(bytesDownloaded, modelDownloadErrorMessage(error)));
    }
  }

  private async writeVerifiedModelDownload(
    tmpPath: string,
    controller: AbortController,
    onBytesDownloaded: (bytesDownloaded: number) => void,
  ): Promise<number> {
    const reader = await this.openDownloadReader(controller);
    const hash = createHash("sha256");
    const writer = createWriteStream(tmpPath, { mode: 0o600 });
    try {
      const bytesDownloaded = await this.writeDownloadBody(reader, writer, hash, onBytesDownloaded);
      await closeWriteStream(writer);
      verifyDownloadedModel(bytesDownloaded, hash.digest("hex"), this.options.model);
      return bytesDownloaded;
    } catch (error) {
      writer.destroy();
      throw error;
    }
  }

  private async openDownloadReader(
    controller: AbortController,
  ): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    if (!this.options.fetchImpl) {
      throw new Error("Setta cannot download the local voice model in this runtime.");
    }
    const response = await this.options.fetchImpl(this.options.model.url, {
      signal: controller.signal,
    });
    validateDownloadResponse(response, this.options.model);
    if (!response.body) {
      throw new Error("The local voice model download did not include a response body.");
    }
    return response.body.getReader();
  }

  private async writeDownloadBody(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: WriteStream,
    hash: ReturnType<typeof createHash>,
    onBytesDownloaded: (bytesDownloaded: number) => void,
  ): Promise<number> {
    let bytesDownloaded = 0;
    let lastEmittedBytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return bytesDownloaded;
      }
      bytesDownloaded += value.byteLength;
      onBytesDownloaded(bytesDownloaded);
      validateDownloadedChunkSize(bytesDownloaded, this.options.model);
      hash.update(value);
      await writeChunk(writer, value);
      if (bytesDownloaded - lastEmittedBytes >= progressEmitIntervalBytes) {
        lastEmittedBytes = bytesDownloaded;
        this.publish(this.downloadingStatus(bytesDownloaded));
      }
    }
  }

  private async readExistingModelStatus(): Promise<LocalMacOSVoiceModelDownloadStatus | null> {
    let modelStat: Awaited<ReturnType<typeof stat>>;
    try {
      modelStat = await stat(this.options.targetPath);
    } catch (error) {
      if (isENOENT(error)) {
        return null;
      }
      return this.failedStatus(0, modelDownloadErrorMessage(error));
    }
    if (!modelStat.isFile()) {
      return this.failedStatus(0, "The local voice model path is not a file.");
    }
    if (modelStat.size !== this.options.model.bytes) {
      return this.failedStatus(
        modelStat.size,
        `The local voice model is ${modelStat.size} bytes; expected ${this.options.model.bytes}.`,
      );
    }
    const actualSHA256 = await sha256File(this.options.targetPath);
    if (actualSHA256 !== this.options.model.sha256) {
      return this.failedStatus(
        modelStat.size,
        "The local voice model hash does not match Setta's expected model.",
      );
    }
    return this.readyStatus();
  }

  private idleStatus(): LocalMacOSVoiceModelDownloadStatus {
    return {
      ...this.modelStatusBase(),
      status: "idle",
    };
  }

  private downloadingStatus(bytesDownloaded: number): LocalMacOSVoiceModelDownloadStatus {
    return {
      ...this.modelStatusBase(),
      bytesDownloaded,
      status: "downloading",
    };
  }

  private readyStatus(): LocalMacOSVoiceModelDownloadStatus {
    return {
      ...this.modelStatusBase(),
      status: "ready",
    };
  }

  private failedStatus(
    bytesDownloaded: number,
    message: string,
  ): LocalMacOSVoiceModelDownloadStatus {
    return {
      ...this.modelStatusBase(),
      bytesDownloaded,
      message,
      status: "failed",
    };
  }

  private unavailableStatus(message: string): LocalMacOSVoiceModelDownloadStatus {
    return {
      message,
      provider: localMacOSProvider,
      status: "unavailable",
    };
  }

  private modelStatusBase(): Omit<
    Extract<LocalMacOSVoiceModelDownloadStatus, { status: "idle" }>,
    "status"
  > {
    return {
      bytesTotal: this.options.model.bytes,
      modelName: this.options.model.name,
      modelPath: this.options.targetPath,
      modelSHA256: this.options.model.sha256,
      provider: localMacOSProvider,
    };
  }

  private publish(status: LocalMacOSVoiceModelDownloadStatus): LocalMacOSVoiceModelDownloadStatus {
    this.status = status;
    this.options.onStatusChanged?.(status);
    return status;
  }
}

function validateDownloadResponse(
  response: Response,
  model: LocalMacOSVoiceModelDownloadSpec,
): void {
  if (!response.ok) {
    throw new Error(`The local voice model download failed with HTTP ${response.status}.`);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength === null) {
    return;
  }
  const parsed = Number(contentLength);
  if (!Number.isInteger(parsed) || parsed !== model.bytes) {
    throw new Error(
      `The local voice model download advertised ${contentLength} bytes; expected ${model.bytes}.`,
    );
  }
}

function validateDownloadedChunkSize(
  bytesDownloaded: number,
  model: LocalMacOSVoiceModelDownloadSpec,
): void {
  if (bytesDownloaded > model.bytes) {
    throw new Error("The local voice model download is larger than expected.");
  }
}

function verifyDownloadedModel(
  bytesDownloaded: number,
  actualSHA256: string,
  model: LocalMacOSVoiceModelDownloadSpec,
): void {
  if (bytesDownloaded !== model.bytes) {
    throw new Error(
      `The local voice model download was ${bytesDownloaded} bytes; expected ${model.bytes}.`,
    );
  }
  if (actualSHA256 !== model.sha256) {
    throw new Error("The local voice model download did not match Setta's expected hash.");
  }
}

function writeChunk(stream: WriteStream, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function closeWriteStream(stream: WriteStream): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (error: Error) => {
      stream.off("error", failed);
      reject(error);
    };
    stream.once("error", failed);
    stream.end(() => {
      stream.off("error", failed);
      resolve();
    });
  });
}

async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function modelDownloadErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "The local voice model download was stopped.";
  }
  return error instanceof Error ? error.message : "The local voice model download failed.";
}

function isENOENT(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
