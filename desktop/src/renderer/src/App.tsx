import type { DesktopPlatform, SettaAPI } from "@shared/types";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { SettingsPanel } from "./components/settings-panel";
import { useAppWindowDragHandlers } from "./app-window-drag";
import { DirectorCommandCenterShell } from "./features/director-command-center/DirectorCommandCenterShell";
import { AppShellSpeechPlaybackProvider } from "./features/global-speech/app-shell-speech-playback";
import { resetRuntimeDerivedRendererState } from "./stores/runtime-derived-state";
import { useRuntimeStore } from "./stores/runtime-store";
import { useAppearanceStore } from "./stores/appearance-store";
import { useWorkspaceStore } from "./stores/workspace-store";
import {
  type SettingsShellRoute,
  useSettingsNavigationStore,
} from "./stores/settings-navigation-store";

export function App() {
  const setta = readSettaApi();
  if (!setta) {
    return <AppRuntimeContractError />;
  }
  return <SettaApp setta={setta} />;
}

function SettaApp({ setta }: { setta: SettaAPI }) {
  const platform = setta.app.platform;
  const settingsFocusRestoreRef = useRef<HTMLElement | null>(null);
  const settingsRouteWasOpenRef = useRef(false);
  const settingsRoute = useSettingsNavigationStore((state) => state.route);
  const openSettings = useSettingsNavigationStore((state) => state.openSettings);
  const openOpenAIVoiceConnection = useSettingsNavigationStore(
    (state) => state.openOpenAIVoiceConnection,
  );
  const closeSettings = useSettingsNavigationStore((state) => state.closeSettings);
  const settingsPageOpen = settingsRoute.page === "settings";
  useAppearanceSettings();
  const runtime = useRuntimeLifecycle(setta);

  const captureSettingsFocusOrigin = useCallback(() => {
    settingsFocusRestoreRef.current = activeFocusableElement();
  }, []);
  const openSettingsPage = useCallback(() => {
    captureSettingsFocusOrigin();
    openSettings();
  }, [captureSettingsFocusOrigin, openSettings]);
  const openVoiceCredentialSettings = useCallback(() => {
    captureSettingsFocusOrigin();
    openOpenAIVoiceConnection();
  }, [captureSettingsFocusOrigin, openOpenAIVoiceConnection]);
  const closeSettingsPage = useCallback(() => {
    closeSettings();
  }, [closeSettings]);

  useEffect(() => {
    if (settingsPageOpen && !settingsRouteWasOpenRef.current && !settingsFocusRestoreRef.current) {
      settingsFocusRestoreRef.current = activeFocusableElement();
    }
    if (!settingsPageOpen && settingsRouteWasOpenRef.current) {
      restoreFocus(settingsFocusRestoreRef.current);
      settingsFocusRestoreRef.current = null;
    }
    settingsRouteWasOpenRef.current = settingsPageOpen;
  }, [settingsPageOpen]);

  return (
    <>
      <div
        aria-hidden={settingsPageOpen || undefined}
        className="fixed inset-0 min-h-0 overflow-hidden bg-background text-foreground"
        data-testid="app-director-shell"
        inert={settingsPageOpen || undefined}
      >
        <AppShellSpeechPlaybackProvider runtimeId={runtime.connectedRuntimeId} setta={setta}>
          {(speechPlayback) => (
            <DirectorCommandCenterShell
              connectedRuntimeId={runtime.connectedRuntimeId}
              onOpenVoiceCredentialSettings={openVoiceCredentialSettings}
              onOpenSettingsPage={openSettingsPage}
              platform={platform}
              setta={setta}
              speechPlayback={speechPlayback}
            />
          )}
        </AppShellSpeechPlaybackProvider>
      </div>
      {settingsRoute.page === "settings" ? (
        <SettingsShellPage onBack={closeSettingsPage} platform={platform} route={settingsRoute} />
      ) : null}
    </>
  );
}

function readSettaApi(): SettaAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as Window & { setta?: SettaAPI }).setta ?? null;
}

function AppRuntimeContractError() {
  return (
    <div className="fixed inset-0 flex min-h-0 items-center justify-center bg-background px-6 text-foreground">
      <div
        className="max-w-md rounded-lg border border-red-500/30 bg-red-950/30 p-5 shadow-2xl"
        data-testid="app-runtime-contract-error"
        role="alert"
      >
        <div className="text-sm font-semibold text-red-200">Setta preload API is unavailable.</div>
        <p className="mt-2 text-sm leading-6 text-red-100/80">
          The renderer cannot start because the required Electron contract{" "}
          <code className="rounded bg-red-950/80 px-1.5 py-0.5 text-red-100">window.setta</code> is
          missing. Start Setta through the Electron desktop shell so the preload script can install
          the production API.
        </p>
      </div>
    </div>
  );
}

type SettingsPageRoute = Extract<SettingsShellRoute, { page: "settings" }>;

function SettingsShellPage({
  onBack,
  platform,
  route,
}: {
  onBack: () => void;
  platform: DesktopPlatform;
  route: SettingsPageRoute;
}) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const headingFocusRequestIdRef = useRef(0);
  const windowDragHandlers = useAppWindowDragHandlers();

  useEffect(() => {
    if (route.focusTarget) {
      headingFocusRequestIdRef.current = route.requestId;
      return;
    }
    if (headingFocusRequestIdRef.current === route.requestId) {
      return;
    }
    headingFocusRequestIdRef.current = route.requestId;
    headingRef.current?.focus({ preventScroll: true });
  }, [route.focusTarget, route.requestId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  return (
    <section
      aria-labelledby="setta-settings-page-title"
      className="setta-settings-page bg-background text-foreground"
      data-desktop-platform={platform}
      data-testid="settings-shell-page"
    >
      <header
        className="setta-settings-page-header app-drag"
        data-setta-shell-title-bar="true"
        {...windowDragHandlers}
      >
        <div aria-hidden="true" className="setta-settings-page-chrome-shield app-no-drag" />
        <button className="setta-settings-page-back app-no-drag" onClick={onBack} type="button">
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          <span>Back to command center</span>
        </button>
        <h1 id="setta-settings-page-title" ref={headingRef} tabIndex={-1}>
          Settings
        </h1>
      </header>
      <div className="setta-settings-page-body">
        <SettingsPanel />
      </div>
    </section>
  );
}

function useAppearanceSettings() {
  const loadAppearance = useAppearanceStore((state) => state.load);

  useEffect(() => {
    void loadAppearance();
  }, [loadAppearance]);
}

function useRuntimeLifecycle(setta: SettaAPI) {
  const loadRuntimes = useRuntimeStore((state) => state.load);
  const runtimeSnapshot = useRuntimeStore((state) => state.snapshot);
  const setRuntimeSnapshot = useRuntimeStore((state) => state.setSnapshot);
  const loadWorkspaceSession = useWorkspaceStore((state) => state.loadSession);
  const resetRuntimeStateKeyRef = useRef<string | null | undefined>(undefined);
  const activeConnectedRuntimeId =
    runtimeSnapshot?.connection.status === "connected" ? runtimeSnapshot.activeRuntimeId : null;

  useEffect(() => {
    void loadRuntimes();
    return setta.runtimes.onConnectionState((snapshot) => {
      setRuntimeSnapshot(snapshot);
    });
  }, [loadRuntimes, setRuntimeSnapshot, setta]);

  useEffect(() => {
    if (!runtimeSnapshot) {
      return;
    }
    const activeRuntimeId = runtimeSnapshot.activeRuntimeId;
    if (resetRuntimeStateKeyRef.current === activeRuntimeId) {
      return;
    }
    resetRuntimeStateKeyRef.current = activeRuntimeId;
    resetRuntimeDerivedRendererState();
  }, [runtimeSnapshot]);

  useEffect(() => {
    if (!activeConnectedRuntimeId) {
      return;
    }
    void loadWorkspaceSession();
  }, [activeConnectedRuntimeId, loadWorkspaceSession]);

  return { connectedRuntimeId: activeConnectedRuntimeId };
}

function activeFocusableElement(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) {
    return null;
  }
  return active;
}

function restoreFocus(element: HTMLElement | null): void {
  if (!element || typeof document === "undefined" || !document.contains(element)) {
    return;
  }
  element.focus({ preventScroll: true });
}
