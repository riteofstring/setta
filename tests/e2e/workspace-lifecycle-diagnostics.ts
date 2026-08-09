import type { Page } from "@playwright/test";

type WorkspaceLifecycleSnapshot = Readonly<{
  globalListeners: number;
  geometryTargets: number;
  listenerTypes: Readonly<Record<string, number>>;
}>;

export async function installWorkspaceLifecycleDiagnostics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const registrations = new WeakMap<
      EventTarget,
      Map<string, Set<EventListenerOrEventListenerObject>>
    >();
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
    let globalListeners = 0;
    let geometryTargets = 0;
    const listenerTypes = new Map<string, number>();
    const isHarnessListener = (listener: EventListenerOrEventListenerObject) =>
      typeof listener === "function" && String(listener).includes("_hitTargetInterceptor");
    const trackedWindowEvents = new Set([
      "blur",
      "dragstart",
      "mousemove",
      "mouseup",
      "resize",
      "selectstart",
    ]);
    const shouldTrack = (target: EventTarget, type: string) => {
      if (target === window) {
        return trackedWindowEvents.has(type);
      }
      if (target === document) {
        return type === "keydown" || type === "keyup";
      }
      return !(target instanceof Node) && type === "change";
    };
    const listenerKey = (
      type: string,
      options: boolean | AddEventListenerOptions | EventListenerOptions | undefined,
    ) => `${type}:${typeof options === "boolean" ? options : (options?.capture ?? false)}`;

    EventTarget.prototype.addEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ) {
      originalAddEventListener.call(this, type, listener, options);
      if (!listener || isHarnessListener(listener) || !shouldTrack(this, type)) {
        return;
      }
      const key = listenerKey(type, options);
      const byType = registrations.get(this) ?? new Map();
      const listeners = byType.get(key) ?? new Set();
      if (!listeners.has(listener)) {
        listeners.add(listener);
        globalListeners += 1;
        listenerTypes.set(type, (listenerTypes.get(type) ?? 0) + 1);
      }
      byType.set(key, listeners);
      registrations.set(this, byType);
    } as typeof EventTarget.prototype.addEventListener;

    EventTarget.prototype.removeEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ) {
      originalRemoveEventListener.call(this, type, listener, options);
      if (!listener || isHarnessListener(listener) || !shouldTrack(this, type)) {
        return;
      }
      const listeners = registrations.get(this)?.get(listenerKey(type, options));
      if (listeners?.delete(listener)) {
        globalListeners -= 1;
        listenerTypes.set(type, (listenerTypes.get(type) ?? 1) - 1);
      }
    } as typeof EventTarget.prototype.removeEventListener;

    const NativeResizeObserver = window.ResizeObserver;
    class TrackingResizeObserver {
      readonly geometryElements: Set<Element>;
      readonly observer: ResizeObserver;

      constructor(callback: ResizeObserverCallback) {
        this.geometryElements = new Set();
        this.observer = new NativeResizeObserver(callback);
      }

      observe(target: Element, options?: ResizeObserverOptions): void {
        this.observer.observe(target, options);
        if (target.matches(".setta-workspace__root-shell") && !this.geometryElements.has(target)) {
          this.geometryElements.add(target);
          geometryTargets += 1;
        }
      }

      unobserve(target: Element): void {
        this.observer.unobserve(target);
        if (this.geometryElements.delete(target)) {
          geometryTargets -= 1;
        }
      }

      disconnect(): void {
        this.observer.disconnect();
        geometryTargets -= this.geometryElements.size;
        this.geometryElements.clear();
      }
    }
    window.ResizeObserver = TrackingResizeObserver as unknown as typeof ResizeObserver;

    Object.defineProperty(window, "__settaWorkspaceLifecycleDiagnostics", {
      value: () => ({
        geometryTargets,
        globalListeners,
        listenerTypes: Object.fromEntries(
          [...listenerTypes]
            .filter(([, count]) => count > 0)
            .sort(([left], [right]) => left.localeCompare(right)),
        ),
      }),
    });
  });
}

export async function workspaceLifecycleSnapshot(page: Page): Promise<WorkspaceLifecycleSnapshot> {
  return page.evaluate(() =>
    (
      window as unknown as {
        __settaWorkspaceLifecycleDiagnostics(): WorkspaceLifecycleSnapshot;
      }
    ).__settaWorkspaceLifecycleDiagnostics(),
  );
}
