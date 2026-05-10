export const apiVersion = 1;

export function register(host) {
  const effective = new Set(host.effectiveCapabilities || []);
  if (!effective.has("registerPane")) {
    return;
  }
  host.registerPane({
    id: "duplicate-pane",
    title: "First Pane",
    renderer: {
      mount(el) {
        el.textContent = "first";
      },
    },
  });
  host.registerPane({
    id: "duplicate-pane",
    title: "Second Pane",
    renderer: {
      mount(el) {
        el.textContent = "second";
      },
    },
  });
}
