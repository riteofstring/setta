import { setTimeout as delay } from "node:timers/promises";

import {
  fetchCanonicalSnapshot,
  productionTimeoutMs,
} from "./browser-processes.mjs";
import {
  activateTextBox,
  clickElementCenter,
  clickPoint,
  evaluate,
  holdItemSelectionChord,
  insertText,
  labeledSelector,
  releaseItemSelectionChord,
  selectAll,
  textBoxSelector,
  waitFor,
} from "./browser-page.mjs";

// The three authoring actions the package's ordinary Args toolbar exposes, by accessible name.
const structuralControlNames = [
  "Remove last parameter",
  "Add parameter",
  "Delete selected parameters",
];

// The toolbar's first control in the package's own rendered order, which is where keyboard focus
// lands when it leaves the section's leading field.
export const firstStructuralControlName = structuralControlNames[0];

// Main's Callable toolbar authors arguments, so these three actions are present and enabled. Pin
// and edge conversion stay absent, because this app has neither concept.
export function assertStructuralParameterControls(names) {
  const missing = structuralControlNames.filter(
    (name) => !names.includes(name),
  );
  if (missing.length > 0) {
    throw new Error(
      `The Args toolbar exposed no ${missing.join(", ")} control: ${names.join(", ")}.`,
    );
  }
  const unexpected = names.filter(
    (name) => !structuralControlNames.includes(name) && name !== "",
  );
  if (unexpected.some((name) => /pin|edge/iu.test(name))) {
    throw new Error(
      `The Args toolbar exposed a control this app has no concept behind: ${unexpected.join(", ")}.`,
    );
  }
}

// Main's Callable toolbar authors real arguments, and each action here completes a canonical round
// trip: the store's own ordered parameter list moves, and the generated call moves with it. A blank
// record is legal and stays out of the generated code until it has both a name and a value.
export async function assertAuthoredParameterAuthoring(
  client,
  backendOrigin,
  generatedLabel,
) {
  const beforeAdding = await fetchCanonicalSnapshot(backendOrigin);
  await clickElementCenter(
    client,
    labeledSelector("Add parameter"),
    "the Add parameter control",
  );
  await waitForCanonicalParameters(
    backendOrigin,
    "the added blank authored parameter",
    (parameters) =>
      parameters.length === 2 &&
      parameters[1].name === "" &&
      parameters[1].nameEditable === true,
  );
  // The store keeps the record a person is filling in and leaves it out of the rendered call, so
  // the module the added record produced is byte-identical to the one before it.
  const blank = await fetchCanonicalSnapshot(backendOrigin);
  if (blank.generatedCode.code !== beforeAdding.generatedCode.code) {
    throw new Error(
      `A nameless authored parameter reached the generated module: ${JSON.stringify(blank.generatedCode.code)}.`,
    );
  }

  // Naming it is what admits it to the call, and the name editor is the package's own. A row
  // whose mutation is still in flight is disabled, and a disabled control does not mount an
  // editor, so each authoring step waits for the row to be editable first.
  await waitForEditableRowControl(client, "Item name");
  await activateTextBox(client, "Item name");
  await insertText(client, "scale");
  await waitForCanonicalParameters(
    backendOrigin,
    "the named authored parameter",
    (parameters) => parameters.length === 2 && parameters[1].name === "scale",
  );

  await waitForEditableRowControl(client, "scale expression");
  await activateTextBox(client, "scale expression");
  await insertText(client, "2");
  await waitFor(
    client,
    "the authored keyword argument in generated Python",
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      return generated?.textContent?.includes("scale=state.Square_Root__scale") === true;
    })()`,
  );
  // The generated document reflects the local workspace edit immediately, but the next steps
  // exercise independent name and structural mutations. Start them only after this complete list
  // has reached the canonical project, otherwise a delayed value write can overlap their clicks.
  await waitForCanonicalParameters(
    backendOrigin,
    "the authored keyword argument in the canonical project",
    (parameters) =>
      parameters.length === 2 &&
      parameters[1].name === "scale" &&
      parameters[1].authoredExpression === "2",
  );

  await assertDuplicateNameIsRefusedInTheRow(client, backendOrigin);

  await clickElementCenter(
    client,
    labeledSelector("Remove last parameter"),
    "the Remove last parameter control",
  );
  await waitForCanonicalParameters(
    backendOrigin,
    "the removed authored parameter",
    (parameters) => parameters.length === 1 && parameters[0].name === "x",
  );
  await waitFor(
    client,
    "generated Python without the removed argument",
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      return generated?.textContent?.includes("scale") === false;
    })()`,
  );

  await assertBulkParameterDeletion(client, backendOrigin);
}

// Main refuses a name another record under the same parent already claims: it reports the problem
// beside the row and never sends it. Renaming the authored row to the signature's own `x` is the
// quiet half of that defect — one generated path for two records — so this proves the row says so
// and that the project and its module are left exactly as they were.
async function assertDuplicateNameIsRefusedInTheRow(client, backendOrigin) {
  const beforeRename = await fetchCanonicalSnapshot(backendOrigin);

  await waitForEditableRowControl(client, "Item name");
  await activateTextBox(client, "Item name");
  await selectAll(client);
  await insertText(client, "x");
  await waitFor(
    client,
    "the authored row reporting the name the signature already claims",
    `(() => {
      const editors = Array.from(
        document.querySelectorAll(${JSON.stringify(textBoxSelector("Item name"))}),
      );
      return editors.some((editor) => {
        if (editor.getAttribute("aria-invalid") !== "true") {
          return false;
        }
        const describedBy = editor.getAttribute("aria-describedby");
        const description = describedBy === null
          ? null
          : document.getElementById(describedBy);
        return description?.textContent ===
          'Param name "x" already exists under this parent.';
      });
    })()`,
  );

  // Well past the controller's coalescing window and the round trips every other step here
  // completes inside, so a proposal this list made would have landed by now.
  await delay(2000);
  const afterRename = await fetchCanonicalSnapshot(backendOrigin);
  if (
    afterRename.project.revision !== beforeRename.project.revision ||
    afterRename.generatedCode.code !== beforeRename.generatedCode.code
  ) {
    throw new Error(
      `A duplicate parameter name reached the canonical project at revision ${afterRename.project.revision}: ${JSON.stringify(afterRename.generatedCode.code)}.`,
    );
  }
  // The row kept what was typed rather than having the canonical list restored over it.
  await waitFor(
    client,
    "the authored row still holding the refused name",
    `(() => {
      const editors = Array.from(
        document.querySelectorAll(${JSON.stringify(textBoxSelector("Item name"))}),
      );
      return editors.some((editor) => editor.textContent?.trim() === "x");
    })()`,
  );

  // Writing a usable name again releases the same list, so the refusal above is the name's and
  // not a dead end this row cannot leave.
  await activateTextBox(client, "Item name");
  await selectAll(client);
  await insertText(client, "scale");
  // The restored list is already the canonical list. The store deliberately treats that proposal
  // as a no-op, so it must not allocate a revision merely for clearing a local validation error.
  // Prove the row recovered instead; the following structural action will make the next actual
  // list mutation and wait for its canonical revision.
  await waitFor(
    client,
    "the restored authored row clearing its duplicate-name error",
    `(() => {
      const editors = Array.from(
        document.querySelectorAll(${JSON.stringify(textBoxSelector("Item name"))}),
      );
      return editors.some(
        (editor) =>
          editor.textContent?.trim() === "scale" &&
          editor.getAttribute("aria-invalid") !== "true",
      );
    })()`,
  );
  await waitForEditableRowControl(client, "scale expression");
}

// Delete Selected is one validated transaction rather than a loop of partial deletes, so two
// selected rows leave in a single new revision.
async function assertBulkParameterDeletion(client, backendOrigin) {
  for (const _added of [0, 1]) {
    await clickElementCenter(
      client,
      labeledSelector("Add parameter"),
      "the Add parameter control",
    );
  }
  await waitForCanonicalParameters(
    backendOrigin,
    "two added authored parameters",
    (parameters) => parameters.length === 3,
  );
  const beforeDelete = await fetchCanonicalSnapshot(backendOrigin);

  // The canvas's own held selection gesture: rows toggle only while it is down. Inserting a row
  // makes it the section's selection, so the gesture reaches the rows that still report themselves
  // unselected — clicking a selected row would toggle it back off, which is what a person holding
  // the chord is avoiding too.
  await holdItemSelectionChord(client);
  const rows = await evaluate(
    client,
    `Array.from(
      document.querySelectorAll('[aria-label^="Selectable item parameter:authored:"]'),
      (row) => {
        const rect = row.getBoundingClientRect();
        return {
          selected: (row.getAttribute("aria-label") ?? "").includes(", selected"),
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        };
      },
    )`,
  );
  if (!Array.isArray(rows) || rows.length !== 2) {
    throw new Error(
      `The item-selection gesture exposed ${Array.isArray(rows) ? rows.length : 0} selectable authored rows instead of 2.`,
    );
  }
  const unselected = rows.filter((row) => !row.selected);
  if (unselected.length === 0) {
    throw new Error(
      "Both authored rows were already selected, so this gesture would prove nothing about selecting them.",
    );
  }
  for (const row of unselected) {
    await clickPoint(client, { x: row.x, y: row.y });
  }
  // Each selectable row says whether it is selected in its own accessible name, so the claim is
  // read there: the two authored rows are selected and the signature-derived one is not.
  await waitFor(
    client,
    "both authored rows reporting themselves selected",
    `(() => {
      const labels = Array.from(
        document.querySelectorAll('[aria-label^="Selectable item "]'),
        (row) => row.getAttribute("aria-label") ?? "",
      );
      const selected = labels.filter((label) => label.includes(", selected"));
      return labels.length === 3 &&
        selected.length === 2 &&
        selected.every((label) => label.startsWith("Selectable item parameter:authored:"));
    })()`,
  );
  await releaseItemSelectionChord(client);

  await clickElementCenter(
    client,
    labeledSelector("Delete selected parameters"),
    "the Delete selected parameters control",
  );
  await waitForCanonicalParameters(
    backendOrigin,
    "one validated bulk deletion",
    (parameters) => parameters.length === 1 && parameters[0].name === "x",
  );
  const afterDelete = await fetchCanonicalSnapshot(backendOrigin);
  if (afterDelete.project.revision !== beforeDelete.project.revision + 1) {
    throw new Error(
      `Deleting two selected parameters published ${afterDelete.project.revision - beforeDelete.project.revision} revisions instead of one.`,
    );
  }
}

async function waitForEditableRowControl(client, label) {
  await waitFor(
    client,
    `an editable ${label} control`,
    `(() => {
      const control = document.querySelector(${JSON.stringify(textBoxSelector(label))});
      return control instanceof HTMLElement && control.getAttribute("aria-disabled") !== "true";
    })()`,
  );
}

async function waitForCanonicalParameters(backendOrigin, description, matches) {
  const deadline = Date.now() + productionTimeoutMs;
  let parameters = [];
  while (Date.now() < deadline) {
    const canonical = await fetchCanonicalSnapshot(backendOrigin);
    parameters = canonical.parameters ?? [];
    if (matches(parameters, canonical)) {
      return canonical;
    }
    await delay(100);
  }
  throw new Error(
    `${description} did not reach the canonical project: ${JSON.stringify(parameters)}.`,
  );
}
