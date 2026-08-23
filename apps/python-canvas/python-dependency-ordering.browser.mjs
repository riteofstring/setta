import assert from "node:assert/strict";

import { fetchCanonicalSnapshot } from "./browser-processes.mjs";
import { openWorkspaceCanvas } from "./callable-commit.browser.mjs";
import {
  runGeneratedPythonAndWaitForMarker,
} from "./generated-python-terminal.browser.mjs";

const runtimeMarker = "SETTA_DEPENDENCY_ORDER_RUNTIME:21";

// This deliberately creates the consumer first: visual/forest order remains
// Consumer then Producer, while the authored parameter reference must make the
// emitted Producer assignment run first.
export async function exerciseDependencyOrderingProductionAcceptance({
  backendOrigin,
  client,
  previewOrigin,
}) {
  await openWorkspaceCanvas(client, previewOrigin);

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
          authoredExpression: "state.Producer",
          id: "parameter:consumer:value",
          name: "value",
        },
      ],
      projectId: snapshot.project.id,
    },
    "author the Consumer state.Producer parameter reference",
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
    "state.Producer = producer()",
    "state.Consumer__value = state.Producer",
  );
  assertGeneratedBefore(
    snapshot.generatedCode.body,
    "state.Consumer__value = state.Producer",
    "state.Consumer = consume(value=state.Consumer__value)",
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
  const rewrittenConsumer = requireCallable(snapshot, "Consumer");
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

  // Reloading makes the raw-headless UI consume the same public snapshot that
  // was mutated above before it invokes the managed terminal run action.
  await openWorkspaceCanvas(client, previewOrigin);
  await runGeneratedPythonAndWaitForMarker(client, runtimeMarker);
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
