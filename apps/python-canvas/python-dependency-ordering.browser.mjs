import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import {
  openWorkspaceCanvas,
  waitForSnapshot,
} from "./callable-commit.browser.mjs";
import { runGeneratedPythonAndWaitForMarker } from "./generated-python-terminal.browser.mjs";
import {
  activateAndSelectAllContentEditableTextBox,
  contentEditableTextBoxSelector,
  insertText,
  labeledSelector,
  pressEscape,
  waitFor,
} from "./browser-page.mjs";

const runtimeMarker = "SETTA_DEPENDENCY_ORDER_RUNTIME:21";
const codeParameterUI = {
  configuration: {
    disabled: false,
    language: "python",
    placeholder: null,
    singleLine: true,
    wrapLines: true,
  },
  type: "CodeParam",
};
const generatedPythonEditorSelector = labeledSelector(
  "Generated Python code editor, generated output read-only",
);

// This deliberately creates the consumer first: visual/forest order remains
// Consumer then Producer, while the authored parameter reference must make the
// emitted Producer assignment run first.
export async function exerciseDependencyOrderingProductionAcceptance({
  backendOrigin,
  client,
  previewOrigin,
}) {
  let snapshot = await fetchCanonicalSnapshot(backendOrigin);
  snapshot = await postProjectMutation(
    backendOrigin,
    "/api/v2/project/target",
    {
      expectedRevision: snapshot.project.revision,
      prefix: `def producer():
    return 21


def consume(value):
    assert value == 21
    print("${runtimeMarker}")
`,
      projectId: snapshot.project.id,
      suffix: "state = SettaState()",
    },
    "set the dependency acceptance Python target",
  );
  snapshot = await postProjectMutation(
    backendOrigin,
    "/api/v2/project/callables",
    {
      expectedRevision: snapshot.project.revision,
      name: "Consumer",
      projectId: snapshot.project.id,
    },
    "create the Consumer callable",
  );
  const consumer = requireCallable(snapshot, "Consumer");
  snapshot = await postProjectMutation(
    backendOrigin,
    `/api/v2/project/callables/${encodeURIComponent(consumer.id)}/commit`,
    {
      authoredExpression: "consume",
      expectedRevision: snapshot.project.revision,
      projectId: snapshot.project.id,
    },
    "author the Consumer callable expression",
  );
  snapshot = await postProjectMutation(
    backendOrigin,
    `/api/v2/project/callables/${encodeURIComponent(consumer.id)}/parameters`,
    {
      expectedRevision: snapshot.project.revision,
      parameters: [
        {
          authoredExpression: "0",
          id: "parameter:consumer:value",
          name: "value",
          ui: codeParameterUI,
        },
      ],
      projectId: snapshot.project.id,
    },
    "author the initial Consumer parameter value",
  );
  snapshot = await postProjectMutation(
    backendOrigin,
    "/api/v2/project/callables",
    {
      expectedRevision: snapshot.project.revision,
      name: "Producer",
      projectId: snapshot.project.id,
    },
    "create the Producer callable after the Consumer",
  );
  const producer = requireCallable(snapshot, "Producer");
  snapshot = await postProjectMutation(
    backendOrigin,
    `/api/v2/project/callables/${encodeURIComponent(producer.id)}/commit`,
    {
      authoredExpression: "producer",
      expectedRevision: snapshot.project.revision,
      projectId: snapshot.project.id,
    },
    "author the Producer callable expression",
  );

  assert.deepEqual(
    snapshot.topLevelSectionIds,
    [consumer.id, producer.id],
    "The acceptance setup did not preserve Consumer-before-Producer visual order.",
  );
  assertGeneratedBefore(
    snapshot.generatedCode.body,
    "state.Consumer = consume(value=state.Consumer__value)",
    "state.Producer = producer()",
  );

  await openWorkspaceCanvas(client, previewOrigin);
  await activateAndSelectAllContentEditableTextBox(
    client,
    `${parameterRowSelector("parameter:consumer:value")} ${contentEditableTextBoxSelector("value value")}`,
    "the Consumer value expression",
  );
  await insertText(client, "state.Producer");
  await pressEscape(client);
  snapshot = await waitForSnapshot(
    backendOrigin,
    "the Consumer state.Producer parameter reference",
    (candidate) =>
      requireCallable(candidate, "Consumer").parameters.some(
        (parameter) =>
          parameter.id === "parameter:consumer:value" &&
          parameter.authoredExpression === "state.Producer",
      ),
  );
  assert.deepEqual(
    snapshot.topLevelSectionIds,
    [consumer.id, producer.id],
    "Editing a parameter changed visual section order.",
  );
  assertGeneratedBefore(
    snapshot.generatedCode.body,
    "state.Producer = producer()",
    "state.Consumer__value = state.Producer",
  );
  assertGeneratedBefore(
    snapshot.generatedCode.body,
    "state.Consumer__value = state.Producer",
    "state.Consumer = consume(value=state.Consumer__value)",
  );
  await waitForGeneratedEditorOrder(
    client,
    "state.Producer = producer()",
    "state.Consumer__value = state.Producer",
  );

  snapshot = await postProjectMutation(
    backendOrigin,
    `/api/v2/project/callables/${encodeURIComponent(producer.id)}/rename`,
    {
      expectedRevision: snapshot.project.revision,
      name: "Renamed Producer",
      projectId: snapshot.project.id,
    },
    "rename the referenced Producer callable",
  );
  let rewrittenConsumer = requireCallable(snapshot, "Consumer");
  assert.equal(
    rewrittenConsumer.parameters[0]?.authoredExpression,
    "state.Renamed_Producer",
    "Renaming Producer did not atomically rewrite the Consumer reference.",
  );
  assertGeneratedBefore(
    snapshot.generatedCode.body,
    "state.Renamed_Producer = producer()",
    "state.Consumer__value = state.Renamed_Producer",
  );

  snapshot = await postProjectMutation(
    backendOrigin,
    "/api/v2/project/parameter-dictionaries",
    {
      expectedRevision: snapshot.project.revision,
      name: "Inputs",
      projectId: snapshot.project.id,
    },
    "create the Inputs parameter dictionary after the Consumer",
  );
  const inputs = requireParameterDictionary(snapshot, "Inputs");
  snapshot = await postProjectMutation(
    backendOrigin,
    `/api/v2/project/parameter-dictionaries/${encodeURIComponent(inputs.id)}/entries`,
    {
      entries: [
        {
          authoredExpression: "21",
          id: "dictionary-entry:inputs:dog",
          kind: "leaf",
          name: "dog",
          ui: codeParameterUI,
        },
      ],
      expectedRevision: snapshot.project.revision,
      projectId: snapshot.project.id,
    },
    "author the Inputs dog entry",
  );
  assert.deepEqual(
    snapshot.topLevelSectionIds,
    [consumer.id, producer.id, inputs.id],
    "Creating Inputs changed existing visual section order.",
  );

  // The page is intentionally mounted before the parameter edit. This catches
  // stale Generated Python projections that only refresh after a section move.
  await openWorkspaceCanvas(client, previewOrigin);
  await activateAndSelectAllContentEditableTextBox(
    client,
    `${parameterRowSelector("parameter:consumer:value")} ${contentEditableTextBoxSelector("value value")}`,
    "the Consumer dictionary-entry expression",
  );
  await insertText(client, "state.Inputs__dog");
  await pressEscape(client);
  snapshot = await waitForSnapshot(
    backendOrigin,
    "the Consumer state.Inputs__dog parameter reference",
    (candidate) =>
      requireCallable(candidate, "Consumer").parameters.some(
        (parameter) =>
          parameter.id === "parameter:consumer:value" &&
          parameter.authoredExpression === "state.Inputs__dog",
      ),
  );
  assert.deepEqual(
    snapshot.topLevelSectionIds,
    [consumer.id, producer.id, inputs.id],
    "Editing the dictionary reference changed visual section order.",
  );
  assertGeneratedBefore(
    snapshot.generatedCode.body,
    "state.Inputs__dog = 21",
    "state.Consumer__value = state.Inputs__dog",
  );
  await waitForGeneratedEditorOrder(
    client,
    "state.Inputs__dog = 21",
    "state.Consumer__value = state.Inputs__dog",
  );

  snapshot = await postProjectMutation(
    backendOrigin,
    `/api/v2/project/parameter-dictionaries/${encodeURIComponent(inputs.id)}/rename`,
    {
      expectedRevision: snapshot.project.revision,
      name: "Renamed Inputs",
      projectId: snapshot.project.id,
    },
    "rename the referenced Inputs parameter dictionary",
  );
  rewrittenConsumer = requireCallable(snapshot, "Consumer");
  assert.equal(
    rewrittenConsumer.parameters[0]?.authoredExpression,
    "state.Renamed_Inputs__dog",
    "Renaming Inputs did not atomically rewrite the Consumer reference.",
  );
  assertGeneratedBefore(
    snapshot.generatedCode.body,
    "state.Renamed_Inputs__dog = 21",
    "state.Consumer__value = state.Renamed_Inputs__dog",
  );

  // Reloading makes the raw-headless UI consume the same public snapshot that
  // was mutated above before it invokes the managed terminal run action.
  await openWorkspaceCanvas(client, previewOrigin);
  await runGeneratedPythonAndWaitForMarker(client, runtimeMarker);
}

function parameterRowSelector(parameterID) {
  const workspaceItemID = `python-canvas:parameter-item:${encodeURIComponent(parameterID)}`;
  return `[data-workspace-item-id=${JSON.stringify(workspaceItemID)}]`;
}

async function waitForGeneratedEditorOrder(client, first, second) {
  await waitFor(
    client,
    "the mounted Generated Python editor to apply dependency ordering",
    `(() => {
      const editor = document.querySelector(${JSON.stringify(generatedPythonEditorSelector)});
      const code = editor?.textContent ?? "";
      const firstOffset = code.indexOf(${JSON.stringify(first)});
      const secondOffset = code.indexOf(${JSON.stringify(second)});
      return firstOffset >= 0 && secondOffset >= 0 && firstOffset < secondOffset;
    })()`,
  );
}

async function postProjectMutation(backendOrigin, path, body, description) {
  const response = await fetch(`${backendOrigin}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json();
  assert.equal(
    response.ok,
    true,
    `${description} failed with ${String(response.status)}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

function requireCallable(snapshot, name) {
  const callable = snapshot.callables.find(
    (candidate) => candidate.name === name,
  );
  assert.ok(
    callable,
    `The ${name} callable is missing from the canonical snapshot.`,
  );
  return callable;
}

function requireParameterDictionary(snapshot, name) {
  const dictionary = snapshot.parameterDictionaries.find(
    (candidate) => candidate.name === name,
  );
  assert.ok(
    dictionary,
    `The ${name} parameter dictionary is missing from the canonical snapshot.`,
  );
  return dictionary;
}

function assertGeneratedBefore(body, first, second) {
  const firstOffset = body.indexOf(first);
  const secondOffset = body.indexOf(second);
  assert.ok(
    firstOffset >= 0,
    `Generated Python is missing ${JSON.stringify(first)}.`,
  );
  assert.ok(
    secondOffset >= 0,
    `Generated Python is missing ${JSON.stringify(second)}.`,
  );
  assert.ok(
    firstOffset < secondOffset,
    `Generated Python emitted ${JSON.stringify(first)} after ${JSON.stringify(second)}:\n${body}`,
  );
}
