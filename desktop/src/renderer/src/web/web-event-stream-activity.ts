export interface WebEventStreamActivity {
  isActive: () => boolean;
  onChanged: (listener: (active: boolean) => void) => () => void;
}

interface BrowserActivityEnvironment {
  document: Pick<Document, "addEventListener" | "visibilityState">;
  navigator: Pick<Navigator, "onLine">;
  window: Pick<Window, "addEventListener">;
}

export function createBrowserWebEventStreamActivity(
  environment: BrowserActivityEnvironment = { document, navigator, window },
): WebEventStreamActivity {
  const listeners = new Set<(active: boolean) => void>();
  let pageShown = true;
  let active = readActive();

  environment.document.addEventListener("visibilitychange", publishIfChanged);
  environment.window.addEventListener("offline", publishIfChanged);
  environment.window.addEventListener("online", publishIfChanged);
  environment.window.addEventListener("pagehide", () => {
    pageShown = false;
    publishIfChanged();
  });
  environment.window.addEventListener("pageshow", () => {
    pageShown = true;
    publishIfChanged();
  });

  return {
    isActive: () => active,
    onChanged: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  function readActive(): boolean {
    return (
      pageShown &&
      environment.document.visibilityState === "visible" &&
      environment.navigator.onLine
    );
  }

  function publishIfChanged(): void {
    const next = readActive();
    if (next === active) {
      return;
    }
    active = next;
    for (const listener of listeners) {
      listener(active);
    }
  }
}
