export const apiVersion = 1;

const ENABLED_SETTING_ID = "plugin::setta-fixture-full::enabled";
const LABEL_SETTING_ID = "plugin::setta-fixture-full::label";
const REVEAL_CLASS = "setta-fixture-full-reveal";

function mountFullSettingsPane(el) {
  el.innerHTML = `
    <div data-fixture-full-setting="${ENABLED_SETTING_ID}">Enabled toggle</div>
    <div data-fixture-full-setting="${LABEL_SETTING_ID}">Label input</div>
  `;
}

function revealFullSetting(settingId, durationMs) {
  const nodes = document.querySelectorAll("[data-fixture-full-setting]");
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) {
      continue;
    }
    if (node.dataset.fixtureFullSetting !== settingId) {
      continue;
    }
    node.scrollIntoView({ block: "center", inline: "nearest" });
    node.classList.add(REVEAL_CLASS);
    window.setTimeout(() => {
      node.classList.remove(REVEAL_CLASS);
    }, durationMs);
    return true;
  }
  return false;
}

export function register(host) {
  const effectiveCapabilities = new Set(host.effectiveCapabilities || []);

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

  if (effectiveCapabilities.has("registerPane")) {
    host.registerPane({
      id: "full-settings-pane",
      title: "Full Settings",
      description: "Settings surface for the full fixture plugin.",
      renderer: {
        mount(el) {
          mountFullSettingsPane(el);
        },
        unmount(el) {
          el.textContent = "";
        },
      },
    });

    host.registerSettingRevealHandler(
      "full-settings",
      ({ settingId, durationMs }) => {
        return revealFullSetting(settingId, durationMs);
      },
    );
  }
}
