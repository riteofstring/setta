export const apiVersion = 1;

export function register(host) {
  const effective = new Set(host.effectiveCapabilities || []);
  if (!effective.has("registerPane")) {
    return;
  }
  host.registerPane({
    id: "scope-shadowing-pane",
    title: "Scope Shadowing Pane",
    renderer: {
      mount(el, props) {
        el.textContent = `scope shadowing fixture: ${props.pluginId}`;
      },
      unmount(el) {
        el.textContent = "";
      },
    },
  });
}
