import { deepStrictEqual } from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

import {
  fetchCanonicalSnapshot,
  productionTimeoutMs,
} from "./browser-processes.mjs";
import { textBoxSelector, waitFor } from "./browser-page.mjs";
import {
  callableSectionSelector,
  firstParameterSelector,
  generatedDocumentSelector,
} from "./callable-presentation.mjs";

// What the Go service has already committed by the time it answers its first request: the shipped
// callable, its one provider-derived parameter, the call they generate, and a ready provider.
export const shippedExample = {
  callable: "math.sqrt",
  generatesItsCall: true,
  parameterNames: ["x"],
  providerStatus: {
    provider: "basedpyright",
    state: "ready",
    status: "available",
  },
};

// The analyzer vocabulary main's ordinary parameter row never shows. The rejected candidate printed
// the passing style and Basedpyright's own type spelling under the parameter name.
const analyzerRowSpellings = ["positional", "keyword only", "_SupportsFloat"];

// The first render must be the ready canonical snapshot rather than placeholder copy. It also
// proves that the first missing-required-argument diagnostic belongs to x, not to the callable.
export async function assertRawFirstRender(
  client,
  backendOrigin,
  callableLabel,
) {
  const canonical = await waitForReadyCanonicalSnapshot(backendOrigin);
  const { parameter, diagnostic } =
    assertShippedExampleIsAlreadyCommitted(canonical);
  const rendered = await waitFor(
    client,
    "the shipped example's ready provider diagnostic on the first render",
    renderedSectionValuesScript(
      callableLabel,
      `${parameter.name} expression`,
      diagnostic.message,
    ),
  );
  assertRenderedSectionIsCanonical(rendered, canonical, parameter);
}

function renderedSectionValuesScript(
  callableLabel,
  parameterLabel,
  parameterDiagnosticMessage,
) {
  return `(() => {
    const section = document.querySelector(${JSON.stringify(callableSectionSelector)});
    const callable = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
    const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
    const label = document.querySelector(${JSON.stringify(firstParameterSelector)});
    const generated = document
      .querySelector(${JSON.stringify(generatedDocumentSelector)})
      ?.querySelector('[role="textbox"]');
    if (
      !(section instanceof HTMLElement) ||
      !(callable instanceof HTMLElement) ||
      !(parameter instanceof HTMLElement) ||
      !(label instanceof HTMLElement) ||
      !(generated instanceof HTMLElement)
    ) {
      return null;
    }
    const parameterRow = parameter.closest('[data-item-row="true"]');
    const parameterDescription = parameterRow?.querySelector(
      '[data-setta-workspace-item-quick-info-description="true"]',
    );
    const parameterMarker = parameterRow?.querySelector(
      '[data-setta-workspace-item-diagnostic-marker="true"]',
    );
    const parameterMarkerRect = parameterMarker?.getBoundingClientRect();
    const callableField = callable.closest('[data-workspace-section-field="true"]');
    const callableIndicator = callableField?.querySelector('[aria-hidden="true"][title]');
    const callableStatus = callableField?.querySelector('[role="status"]');
    // The ready first snapshot has one required provider parameter with a mapped call issue. The
    // row owns its main-style error treatment and full accessible provider message; the callable
    // field must remain ordinary, because this issue belongs to the missing argument instead.
    if (
      !(parameterRow instanceof HTMLElement) ||
      !(parameterMarker instanceof HTMLElement) ||
      !(parameterDescription instanceof HTMLElement) ||
      !(callableField instanceof HTMLElement) ||
      parameterRow.dataset.settaWorkspaceItemDiagnosticSeverity !== "error" ||
      parameterMarker.dataset.settaWorkspaceItemDiagnosticSeverity !== "error" ||
      parameterMarkerRect === undefined ||
      parameterMarkerRect.width <= 0 ||
      parameterMarkerRect.height <= 0 ||
      parameterDescription.textContent?.includes(${JSON.stringify(parameterDiagnosticMessage)}) !== true ||
      callable.getAttribute("aria-invalid") === "true" ||
      callableField.getAttribute("data-diagnostic") !== "false" ||
      callableIndicator !== null ||
      callableStatus?.textContent?.trim() !== ""
    ) {
      return null;
    }
    // The initial missing-required-argument diagnostic is correct feedback, and Basedpyright is
    // free to use analyzer vocabulary such as "positional" in its complete message. Keep the
    // item's live announcement and its screen-reader description out of the independent check for
    // metadata that the visible parameter row itself must not render.
    const sectionWithoutDiagnosticAccessibility = section.cloneNode(true);
    if (!(sectionWithoutDiagnosticAccessibility instanceof HTMLElement)) {
      return null;
    }
    for (const diagnosticAccessibility of sectionWithoutDiagnosticAccessibility.querySelectorAll(
      '[data-setta-workspace-item-diagnostic-announcer="true"], [data-setta-workspace-item-quick-info-description="true"]',
    )) {
      diagnosticAccessibility.remove();
    }
    return {
      callableValue: callable.textContent ?? "",
      generatedSource: generated.textContent ?? "",
      parameterLabel: label.textContent ?? "",
      parameterValue: parameter.textContent ?? "",
      sectionText: sectionWithoutDiagnosticAccessibility.textContent ?? "",
    };
  })()`;
}

async function waitForReadyCanonicalSnapshot(backendOrigin) {
  const deadline = Date.now() + productionTimeoutMs;
  let canonical = null;
  while (Date.now() < deadline) {
    canonical = await fetchCanonicalSnapshot(backendOrigin);
    if (hasReadyProvider(canonical)) {
      return canonical;
    }
    await delay(100);
  }
  throw new Error(
    `The initial Python Canvas provider did not become available and ready: ${JSON.stringify(canonical?.providerStatus)}.`,
  );
}

function hasReadyProvider(canonical) {
  return (
    canonical.providerStatus?.provider ===
      shippedExample.providerStatus.provider &&
    canonical.providerStatus?.status === shippedExample.providerStatus.status &&
    canonical.providerStatus?.state === shippedExample.providerStatus.state
  );
}

function assertShippedExampleIsAlreadyCommitted(canonical) {
  assertCanonicalValue(
    shippedExample,
    shippedExampleValues(canonical),
    "The first canonical response did not commit the shipped ready math.sqrt example.",
  );
  const parameter = assertRequiredProviderParameter(canonical);
  return {
    diagnostic: requiredParameterDiagnostic(canonical, parameter),
    parameter,
  };
}

function shippedExampleValues(canonical) {
  return {
    callable: canonical.callables?.[0]?.authoredExpression ?? null,
    generatesItsCall:
      canonical.generatedCode?.code?.includes(
        "state.Square_Root = math.sqrt()",
      ) === true,
    parameterNames: (canonical.parameters ?? []).map(
      (parameter) => parameter.name,
    ),
    providerStatus: canonical.providerStatus ?? null,
  };
}

function assertRequiredProviderParameter(canonical) {
  const parameter = canonical.parameters?.[0];
  if (
    parameter === undefined ||
    parameter.authoredExpression !== "" ||
    parameter.default !== null ||
    parameter.nameEditable !== false
  ) {
    throw new Error(
      "The ready math.sqrt snapshot did not retain one empty required provider-derived x parameter.",
    );
  }
  return parameter;
}

function requiredParameterDiagnostic(canonical, parameter) {
  const diagnostics = canonical.diagnostics?.filter(
    (candidate) =>
      candidate.targetId === parameter.id &&
      candidate.severity === "error" &&
      typeof candidate.message === "string" &&
      candidate.message.trim() !== "",
  );
  if (diagnostics?.length !== 1) {
    throw new Error(
      `The ready math.sqrt snapshot did not map exactly one missing-argument error to x: ${JSON.stringify(canonical.diagnostics)}.`,
    );
  }
  return diagnostics[0];
}

function assertRenderedSectionIsCanonical(rendered, canonical, parameter) {
  assertRenderedValueIsCanonical(
    "callable field",
    rendered.callableValue,
    canonical.callables[0].authoredExpression,
  );
  assertRenderedValueIsCanonical(
    `${parameter.name} value editor`,
    rendered.parameterValue,
    parameter.authoredExpression,
  );
  assertRenderedValueIsCanonical(
    "generated Python reader",
    rendered.generatedSource,
    // The reader lays each line out as its own block, so its text carries the canonical lines in
    // order without the newlines between them.
    canonical.generatedCode.code.split("\n").join(""),
  );
  if (rendered.parameterLabel !== parameter.name) {
    throw new Error(
      `The parameter row labelled itself ${JSON.stringify(rendered.parameterLabel)} instead of the canonical name ${JSON.stringify(parameter.name)}.`,
    );
  }
  const spelled = analyzerRowSpellings.filter((spelling) =>
    rendered.sectionText.includes(spelling),
  );
  if (spelled.length > 0) {
    throw new Error(
      `The Square Root section exposed raw analyzer metadata: ${spelled.join(", ")}.`,
    );
  }
}

function assertRenderedValueIsCanonical(control, rendered, canonical) {
  if (rendered !== canonical) {
    throw new Error(
      `The ${control} rendered ${JSON.stringify(rendered)} on the first render while the canonical project holds ${JSON.stringify(canonical)}.`,
    );
  }
}

function assertCanonicalValue(expected, actual, message) {
  deepStrictEqual(actual, expected, message);
}
