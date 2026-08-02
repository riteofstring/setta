export const apiVersion = 1;

export function register(host) {
  const effective = new Set(host.effectiveCapabilities || []);
  if (!effective.has("registerPane")) {
    return;
  }
  host.registerPane({
    id: "metadata-mismatch-version-pane",
    title: "Metadata Mismatch Version Pane",
    renderer: {
      mount(el) {
        el.textContent = "metadata mismatch version fixture";
      },
      unmount(el) {
        el.textContent = "";
      },
    },
  });
}
