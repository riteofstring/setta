export const reactDomSurfaceHostChangedEvent = "setta:react-dom-surface-host-changed";

export function notifyReactDomSurfaceHostChanged(container: EventTarget): void {
  container.dispatchEvent(new Event(reactDomSurfaceHostChangedEvent));
}
