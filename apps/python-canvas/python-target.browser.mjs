import { waitForSnapshot } from "./callable-commit.browser.mjs";
import {
  activateCodeEditor,
  insertText,
  labeledSelector,
  moveCaretToDocumentEnd,
  moveCaretToDocumentStart,
} from "./browser-page.mjs";

export const generatedPythonEditorSelector = labeledSelector(
  "Generated Python code editor, generated output read-only",
);

export async function editPythonTargetOuterRegions(client, backendOrigin) {
  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentStart(client);
  await insertText(client, "import fixture_module\n");
  await waitForSnapshot(
    backendOrigin,
    "the authored Generated Python prefix",
    (snapshot) => snapshot.pythonTarget.prefix === "import fixture_module\n",
  );

  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentEnd(client);
  await insertText(client, "\nprint('browser suffix')");
  await waitForSnapshot(
    backendOrigin,
    "the authored Generated Python suffix",
    (snapshot) =>
      snapshot.pythonTarget.suffix.endsWith("print('browser suffix')"),
  );
}

export async function observeTargetDiagnostics(client, backendOrigin) {
  await activateCodeEditor(
    client,
    generatedPythonEditorSelector,
    "the Generated Python document",
  );
  await moveCaretToDocumentEnd(client);
  await insertText(client, "\nnot_defined_in_browser_walkthrough");
  await waitForSnapshot(
    backendOrigin,
    "a diagnostic for the authored target suffix",
    (snapshot) =>
      snapshot.diagnostics.some((diagnostic) => diagnostic.targetId === null),
  );
}
