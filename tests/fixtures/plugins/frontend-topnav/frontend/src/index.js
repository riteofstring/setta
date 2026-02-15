export const apiVersion = 1;

export function register(host) {
  const effective = new Set(host.effectiveCapabilities || []);
  if (!effective.has("registerTopNavBarItem")) {
    return;
  }
  host.registerTopNavBarItem({
    id: "fixture-topnav-action",
    label: "Fixture Nav",
    description: "Fixture top nav action for plugin tests.",
    onClick() {
      const current = Number(window.__settaFixtureTopNavClicks || 0);
      window.__settaFixtureTopNavClicks = current + 1;
    },
  });
}
