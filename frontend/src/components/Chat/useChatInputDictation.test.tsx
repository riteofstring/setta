/* @vitest-environment jsdom */

import { act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ProviderDictationTranscriptionResult,
  useChatInputDictation,
} from "./useChatInputDictation";

type DictationHarnessProps = {
  disabled?: boolean;
  dictationMode?: "auto" | "browser" | "provider";
  dictationEnabledByProvider?: boolean;
  providerDictationLikelySupported?: boolean;
  onProviderDictationTranscribe?: (
    audioBlob: Blob,
  ) => Promise<ProviderDictationTranscriptionResult>;
};

type MockSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: {
        transcript: string;
      };
    };
  };
};

class MockSpeechRecognition {
  static instances: MockSpeechRecognition[] = [];

  continuous = true;
  interimResults = true;
  lang = "en-US";
  onresult: ((event: MockSpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  constructor() {
    MockSpeechRecognition.instances.push(this);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.started = false;
  }
}

class MockMediaRecorder {
  static isTypeSupported = vi.fn((mimeType: string) =>
    mimeType.includes("webm"),
  );
  static lastInstance: MockMediaRecorder | null = null;

  mimeType: string;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(stream: MediaStream, options?: { mimeType?: string }) {
    void stream;
    this.mimeType = options?.mimeType ?? "audio/webm";
    MockMediaRecorder.lastInstance = this;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["audio"], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

type MediaDevicesDescriptor = PropertyDescriptor | undefined;

function DictationHarness({
  disabled = false,
  dictationMode = "auto",
  dictationEnabledByProvider = true,
  providerDictationLikelySupported = true,
  onProviderDictationTranscribe,
}: DictationHarnessProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inputValueRef = useRef(value);

  useEffect(() => {
    inputValueRef.current = value;
  }, [value]);

  const {
    canDictate,
    dictationAriaLabel,
    dictationFeedback,
    dictationState,
    handleDictationToggle,
  } = useChatInputDictation({
    disabled,
    dictationMode,
    onProviderDictationTranscribe,
    dictationEnabledByProvider,
    providerDictationLikelySupported,
    textareaRef,
    inputValueRef,
    setInputValue: setValue,
  });

  return (
    <div>
      <textarea
        ref={textareaRef}
        data-testid="dictation-textarea"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {canDictate ? (
        <button
          type="button"
          data-testid="dictation-toggle"
          aria-label={dictationAriaLabel}
          onClick={handleDictationToggle}
        >
          {dictationAriaLabel}
        </button>
      ) : (
        <div data-testid="dictation-unavailable">unavailable</div>
      )}
      <div data-testid="dictation-state">{dictationState}</div>
      <div data-testid="dictation-feedback">{dictationFeedback ?? ""}</div>
    </div>
  );
}

describe("useChatInputDictation", () => {
  let host: HTMLDivElement;
  let root: Root;
  let originalMediaDevicesDescriptor: MediaDevicesDescriptor;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    MockSpeechRecognition.instances = [];
    MockMediaRecorder.lastInstance = null;
    MockMediaRecorder.isTypeSupported.mockClear();
    originalMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      "mediaDevices",
    );
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    restoreWindowProperty("SpeechRecognition");
    restoreWindowProperty("webkitSpeechRecognition");
    if (originalMediaDevicesDescriptor) {
      Object.defineProperty(
        navigator,
        "mediaDevices",
        originalMediaDevicesDescriptor,
      );
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts browser dictation and inserts finalized transcripts into the textarea", async () => {
    installSpeechRecognitionSupport();

    await renderHarness({
      dictationMode: "browser",
    });

    // Browser dictation should own the microphone lifecycle and write the final transcript back into the composer.
    await act(async () => {
      getRequiredButton("dictation-toggle").click();
    });

    expect(
      getRequiredButton("dictation-toggle").getAttribute("aria-label"),
    ).toBe("Stop Mic");
    expect(getByTestId("dictation-state")?.textContent).toBe("listening");
    expect(getByTestId("dictation-feedback")?.textContent).toBe("Listening...");

    const recognition = MockSpeechRecognition.instances[0];
    if (!recognition?.onresult) {
      throw new Error("Expected a browser dictation recognition session.");
    }

    await act(async () => {
      recognition.onresult({
        resultIndex: 0,
        results: {
          length: 1,
          0: {
            isFinal: true,
            0: {
              transcript: "review the failing tests",
            },
          },
        },
      });
      await Promise.resolve();
    });

    const textarea = getByTestId("dictation-textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea to exist.");
    }
    expect(textarea.value).toBe("review the failing tests ");
    expect(getByTestId("dictation-state")?.textContent).toBe("listening");
  });

  it("captures provider audio, transcribes it, and inserts the returned transcript", async () => {
    installProviderCaptureSupport({
      getUserMedia: vi.fn(async () => createMediaStreamMock()),
    });
    const onProviderDictationTranscribe = vi.fn(
      async () =>
        ({
          kind: "ok",
          transcript: "provider transcript",
        }) satisfies ProviderDictationTranscriptionResult,
    );

    await renderHarness({
      dictationMode: "provider",
      onProviderDictationTranscribe,
    });

    // Provider mode should move from listening to transcribing and then restore the transcript into the composer.
    await act(async () => {
      getRequiredButton("dictation-toggle").click();
      await Promise.resolve();
    });

    expect(getByTestId("dictation-state")?.textContent).toBe("listening");
    expect(
      getRequiredButton("dictation-toggle").getAttribute("aria-label"),
    ).toBe("Stop Mic");

    await act(async () => {
      getRequiredButton("dictation-toggle").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const textarea = getByTestId("dictation-textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("Expected textarea to exist.");
    }
    expect(onProviderDictationTranscribe).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe("provider transcript ");
    expect(getByTestId("dictation-state")?.textContent).toBe("idle");
    expect(getByTestId("dictation-feedback")?.textContent).toBe("");
  });

  it("falls back to browser dictation in auto mode when provider capture cannot start", async () => {
    installSpeechRecognitionSupport();
    installProviderCaptureSupport({
      getUserMedia: vi.fn(async () => {
        throw new Error("capture failed");
      }),
    });

    await renderHarness({
      dictationMode: "auto",
      onProviderDictationTranscribe: vi.fn(async () => ({
        kind: "ok",
        transcript: "unused",
      })),
    });

    // Auto mode should recover from provider capture-start failures by switching to the browser recognizer when it is available.
    await act(async () => {
      getRequiredButton("dictation-toggle").click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(MockSpeechRecognition.instances).toHaveLength(1);
    expect(MockSpeechRecognition.instances[0]?.started).toBe(true);
    expect(getByTestId("dictation-state")?.textContent).toBe("listening");
    expect(
      getRequiredButton("dictation-toggle").getAttribute("aria-label"),
    ).toBe("Stop Mic");
  });

  function getByTestId(testId: string) {
    return host.querySelector(`[data-testid="${testId}"]`);
  }

  function getRequiredButton(testId: string) {
    const button = getByTestId(testId);
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Expected ${testId} button.`);
    }
    return button;
  }

  async function renderHarness(props: DictationHarnessProps) {
    await act(async () => {
      root.render(<DictationHarness {...props} />);
    });
  }
});

function installSpeechRecognitionSupport() {
  Object.defineProperty(window, "SpeechRecognition", {
    configurable: true,
    value: MockSpeechRecognition,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    configurable: true,
    value: undefined,
  });
}

function installProviderCaptureSupport({
  getUserMedia,
}: {
  getUserMedia: () => Promise<unknown>;
}) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia,
    },
  });
  vi.stubGlobal("MediaRecorder", MockMediaRecorder);
}

function restoreWindowProperty(
  propertyName: "SpeechRecognition" | "webkitSpeechRecognition",
) {
  Reflect.deleteProperty(window, propertyName);
}

function createMediaStreamMock() {
  return {
    getTracks: () => [
      {
        stop: vi.fn(),
      },
    ],
  };
}
