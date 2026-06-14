import { waitForState } from "./electron-cdp-harness.mjs";

export async function openSelectedGraphNodeDetailsFromToolbar(client, expectedLabel) {
  const buttonState = await waitForState(
    client,
    `(() => {
      const buttons = [...document.querySelectorAll('[data-testid="workflow-node-details-button"]')]
        .filter((button) => button instanceof HTMLButtonElement)
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return {
            disabled: button.disabled || button.getAttribute("aria-disabled") === "true",
            label: button.getAttribute("aria-label") || "",
            text: button.textContent || "",
            visible: rect.width > 0 && rect.height > 0
          };
        });
      return {
        buttons,
        match: buttons.find((button) =>
          button.visible &&
          !button.disabled &&
          button.label === ${JSON.stringify(`Open details for ${expectedLabel}`)} &&
          button.text.includes(${JSON.stringify(expectedLabel)})
        ) ?? null
      };
    })()`,
    (value) => value.match !== null,
    5000,
  );
  if (buttonState.match === null) {
    throw new Error(`semantic details toolbar button unavailable: ${JSON.stringify(buttonState)}`);
  }
  await client.evaluate(`(() => {
    const buttons = [...document.querySelectorAll('[data-testid="workflow-node-details-button"]')]
      .filter((button) => button instanceof HTMLButtonElement);
    const button = buttons.find((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 &&
        rect.height > 0 &&
        !button.disabled &&
        button.getAttribute("aria-label") === ${JSON.stringify(`Open details for ${expectedLabel}`)} &&
        (button.textContent || "").includes(${JSON.stringify(expectedLabel)});
    });
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
}

export async function assertCartographerHealthPanel(client) {
  await waitForState(
    client,
    `(() => {
      const button = document.querySelector('[data-testid="cartographer-health-refresh"]');
      if (!(button instanceof HTMLButtonElement)) {
        return false;
      }
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && !button.disabled;
    })()`,
    (value) => value === true,
    5000,
  );
  await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="cartographer-health-refresh"]');
    if (!(button instanceof HTMLButtonElement)) {
      return false;
    }
    button.click();
    return true;
  })()`);
  const text = await waitForState(
    client,
    `(() => document.querySelector('[data-testid="cartographer-health-panel"]')?.textContent || "")()`,
    (value) =>
      value.includes("Cartographer Health") &&
      value.includes("Durable") &&
      value.includes("Review") &&
      value.includes("No-op") &&
      value.includes("Superseded"),
    5000,
  );
  if (!text.includes("Cartographer Health")) {
    throw new Error(`cartographer health panel missing: ${text}`);
  }
}
