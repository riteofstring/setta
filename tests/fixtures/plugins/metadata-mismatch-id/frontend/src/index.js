export const apiVersion = 1;

export function register(host) {
  const effective = new Set(host.effectiveCapabilities || []);
  if (!effective.has("registerPane")) {
    return;
  }
  host.registerPane({
    id: "metadata-mismatch-id-pane",
    title: "Metadata Mismatch Id Pane",
    renderer: {
      mount(el) {
        el.textContent = "metadata mismatch id fixture";
      },
      unmount(el) {
        el.textContent = "";
      },
    },
  });
}
