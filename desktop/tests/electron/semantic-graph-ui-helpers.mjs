import { waitForState } from "./electron-cdp-harness.mjs";

const semanticNodeDetailsRequiredText = [
  "Deterministic layout writes stay read-only",
  "supports",
  "refutes",
  "resolves",
  "Trajectory liveness plan excerpt",
  "SOURCE LINKS",
  "Why this exists",
  "validating",
  "Keep semantic graph rendering read-only",
  "context_pack.created",
  "workflow_agent_start",
  "Renderer read-only semantic graph surface",
  "active workspace constraint",
  "sha256:semantic_seed_delivered_context",
  "Delivered Context",
  "OVERVIEW",
  "Newest evidence",
  "Related",
  "Patch",
  "RECENT CHANGES",
  "88",
  "Cartographer",
  "Cartographer pending review evidence",
  "attach_evidence",
  "Seed cartographer window summary",
  "semantic_seed_workflow_events:3",
];

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

export async function assertSemanticNodeDetails(client) {
  const details = await waitForState(
    client,
    `(() => ({ text: document.querySelector('[data-testid="semantic-node-details-surface"]')?.innerText ?? "" }))()`,
    (value) => textIncludesAll(value.text, semanticNodeDetailsRequiredText),
  );
  if (
    !details.text.includes("docs/plans/workspace_trajectory_liveness_and_semantic_memory_plan.md")
  ) {
    throw new Error(`semantic node details omitted evidence path: ${details.text}`);
  }
}

export async function assertSemanticNodeLiveStatus(client) {
  const details = await waitForState(
    client,
    `(() => ({ text: document.querySelector('[data-testid="semantic-live-status"]')?.innerText ?? "" }))()`,
    (value) => value.text.includes("candidate target"),
    5000,
  );
  if (!details.text.includes("candidate target")) {
    throw new Error(`semantic node live status missing: ${details.text}`);
  }
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

function textIncludesAll(text, expected) {
  return expected.every((item) => text.includes(item));
}
