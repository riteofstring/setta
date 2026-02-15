export const apiVersion = 1;

export function register(host) {
  host.registerSectionKind({
    kind: "full-card",
    title: "Full Fixture Card",
    initialData: { text: "full-default" },
    renderer: {
      mount(el, props) {
        el.textContent = `full:${String(props.data?.text ?? "full-default")}`;
      },
      update(el, props) {
        el.textContent = `full:${String(props.data?.text ?? "full-default")}`;
      },
      unmount(el) {
        el.textContent = "";
      },
    },
  });
}
