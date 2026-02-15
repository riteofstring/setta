export const apiVersion = 1;

function incrementMetric(metricName) {
  const globalScope = window;
  const current = Number(globalScope[metricName] || 0);
  globalScope[metricName] = current + 1;
}

export function register(host) {
  if ((host.effectiveCapabilities || []).includes("registerPane")) {
    host.registerPane({
      id: "fixture-api-fetch-pane",
      title: "Fixture API Fetch Pane",
      renderer: {
        mount(el) {
          el.textContent = "Fixture API fetch pane mounted.";
        },
        unmount(el) {
          el.textContent = "";
        },
      },
    });
  }

  void host
    .apiFetch("health")
    .then(() => {
      incrementMetric("__settaFixtureApiFetchHealthCalls");
    })
    .catch(() => {
      incrementMetric("__settaFixtureApiFetchHealthFailures");
    });

  void host
    .apiFetch("/status", {
      headers: {
        "X-Custom": "yes",
      },
    })
    .then(() => {
      incrementMetric("__settaFixtureApiFetchStatusCalls");
    })
    .catch(() => {
      incrementMetric("__settaFixtureApiFetchStatusFailures");
    });

  void host
    .apiFetch("/../../api/projects")
    .then(() => {
      incrementMetric("__settaFixtureApiFetchTraversalCalls");
    })
    .catch(() => {
      incrementMetric("__settaFixtureApiFetchTraversalFailures");
    });

  void host
    .apiFetch("/%2e%2e%2fapi/projects")
    .then(() => {
      incrementMetric("__settaFixtureApiFetchTraversalCalls");
    })
    .catch(() => {
      incrementMetric("__settaFixtureApiFetchTraversalFailures");
    });
}
