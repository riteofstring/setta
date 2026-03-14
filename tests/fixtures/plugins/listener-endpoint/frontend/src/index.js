export const apiVersion = 1;

function createPaneContent(el, host) {
  const wrapper = document.createElement("section");
  wrapper.dataset.testid = "fixture-listener-endpoint-pane";

  const status = document.createElement("p");
  status.dataset.testid = "fixture-listener-endpoint-status";
  status.textContent = "Idle";

  const result = document.createElement("pre");
  result.dataset.testid = "fixture-listener-endpoint-result";
  result.textContent = "No listener endpoint result yet.";

  const button = document.createElement("button");
  button.type = "button";
  button.dataset.testid = "fixture-listener-endpoint-call";
  button.textContent = "Call Listener Endpoint";

  const handleClick = async () => {
    status.textContent = "Calling listener endpoint...";
    button.disabled = true;
    try {
      const response = await host.callListenerEndpoint(
        "fixture_listener_endpoint",
        {
          message: "hello from plugin pane",
        },
      );
      status.textContent = "Listener endpoint succeeded.";
      result.textContent = JSON.stringify(response, null, 2);
    } catch (error) {
      status.textContent = "Listener endpoint failed.";
      result.textContent =
        error instanceof Error ? error.message : String(error);
    } finally {
      button.disabled = false;
    }
  };

  button.addEventListener("click", handleClick);
  wrapper.append(button, status, result);
  el.replaceChildren(wrapper);

  return () => {
    button.removeEventListener("click", handleClick);
    el.replaceChildren();
  };
}

export function register(host) {
  const effectiveCapabilities = new Set(host.effectiveCapabilities || []);
  if (
    !effectiveCapabilities.has("registerPane") ||
    !effectiveCapabilities.has("registerListenerEndpoint")
  ) {
    return;
  }

  host.registerPane({
    id: "listener-endpoint-pane",
    title: "Listener Endpoint Pane",
    renderer: {
      mount(el) {
        el.__settaListenerEndpointCleanup = createPaneContent(el, host);
      },
      unmount(el) {
        if (typeof el.__settaListenerEndpointCleanup === "function") {
          el.__settaListenerEndpointCleanup();
        } else {
          el.replaceChildren();
        }
      },
    },
  });
}
