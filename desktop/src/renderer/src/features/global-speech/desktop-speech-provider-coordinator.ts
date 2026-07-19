import type { SpeechProvider } from "@generated/backend";
import type { LocalMacOSVoiceHealth } from "@shared/speech-ipc";
import type { DesktopPlatform } from "@shared/types";
import { localMacOSSpeechProviderID, openAISpeechProviderID } from "@shared/speech-providers";

import type {
  SpeechCaptureSupport,
  VoiceCaptureSession,
  VoiceCaptureStartRequest,
  VoiceInputProvider,
  VoiceOutputProvider,
} from "./voice-provider-boundary";

export interface DesktopVoiceProviderSelectionDependencies {
  platform: DesktopPlatform;
  readLocalMacOSVoiceHealth?: () => Promise<LocalMacOSVoiceHealth>;
}

export interface DesktopVoiceInputProviderOptions extends DesktopVoiceProviderSelectionDependencies {
  localMacOS: VoiceInputProvider;
  openAI: VoiceInputProvider;
}

export interface DesktopVoiceOutputProviderOptions extends DesktopVoiceProviderSelectionDependencies {
  localMacOS: VoiceOutputProvider;
  openAI: VoiceOutputProvider;
}

const localMacOSProvider = localMacOSSpeechProviderID();
const openAIProvider = openAISpeechProviderID();

export function createDesktopVoiceInputProvider(
  options: DesktopVoiceInputProviderOptions,
): VoiceInputProvider {
  return new DesktopVoiceInputProvider(options);
}

export async function selectDesktopVoiceOutputProvider(
  options: DesktopVoiceOutputProviderOptions,
): Promise<VoiceOutputProvider> {
  return outputProviderByID(options, await selectDesktopVoiceProviderID(options));
}

export async function selectDesktopVoiceProviderID(
  dependencies: DesktopVoiceProviderSelectionDependencies,
): Promise<SpeechProvider> {
  if (dependencies.platform !== "darwin" || !dependencies.readLocalMacOSVoiceHealth) {
    return openAIProvider;
  }
  const health = await dependencies.readLocalMacOSVoiceHealth();
  return health.provider === localMacOSProvider && health.status === "ready"
    ? localMacOSProvider
    : openAIProvider;
}

class DesktopVoiceInputProvider implements VoiceInputProvider {
  private activeProviderID = openAIProvider;

  constructor(private readonly options: DesktopVoiceInputProviderOptions) {}

  get id(): SpeechProvider {
    return this.activeProviderID;
  }

  readCapabilities = async () => {
    const provider = inputProviderByID(
      this.options,
      await selectDesktopVoiceProviderID(this.options),
    );
    this.activeProviderID = provider.id;
    return provider.readCapabilities();
  };

  readSupport = (): SpeechCaptureSupport =>
    inputProviderByID(this.options, this.activeProviderID).readSupport();

  startCapture = async (request: VoiceCaptureStartRequest): Promise<VoiceCaptureSession> => {
    const provider = inputProviderByID(this.options, request.capabilities.voiceCatalog.provider);
    this.activeProviderID = provider.id;
    return provider.startCapture(request);
  };
}

function inputProviderByID(
  providers: Pick<DesktopVoiceInputProviderOptions, "localMacOS" | "openAI">,
  provider: SpeechProvider,
): VoiceInputProvider {
  switch (provider) {
    case "local_macos":
      return providers.localMacOS;
    case "openai":
      return providers.openAI;
    default:
      return assertNever(provider);
  }
}

function outputProviderByID(
  providers: Pick<DesktopVoiceOutputProviderOptions, "localMacOS" | "openAI">,
  provider: SpeechProvider,
): VoiceOutputProvider {
  switch (provider) {
    case "local_macos":
      return providers.localMacOS;
    case "openai":
      return providers.openAI;
    default:
      return assertNever(provider);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported desktop voice provider value: ${JSON.stringify(value)}`);
}
