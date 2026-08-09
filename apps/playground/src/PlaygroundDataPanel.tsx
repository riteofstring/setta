import { useEffect, useRef, useState, type FormEvent } from "react";

export type PlaygroundImportResult =
  | Readonly<{ documentJson: string; status: "applied" }>
  | Readonly<{ message: string; status: "rejected" }>;

type PlaygroundDataPanelProps = Readonly<{
  currentDocumentJson: string;
  onImport(serialized: string): PlaygroundImportResult;
  onReset(): void;
  onStatus(message: string): void;
  readOnly: boolean;
}>;

export function PlaygroundDataPanel({
  currentDocumentJson,
  onImport,
  onReset,
  onStatus,
  readOnly,
}: PlaygroundDataPanelProps) {
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [draft, setDraft] = useState(currentDocumentJson);
  const [draftDirty, setDraftDirty] = useState(false);
  const [error, setError] = useState("");
  const resetConfirmationRef = useRef<HTMLButtonElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!draftDirty) {
      setDraft(currentDocumentJson);
    }
  }, [currentDocumentJson, draftDirty]);

  useEffect(() => {
    if (confirmationOpen) {
      resetConfirmationRef.current?.focus();
    }
  }, [confirmationOpen]);

  const closeResetConfirmation = () => {
    setConfirmationOpen(false);
    resetTriggerRef.current?.focus();
  };

  const submitImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = onImport(draft);
    if (result.status === "rejected") {
      setError(result.message);
      onStatus(`Unable to import workspace. ${result.message}`);
      textareaRef.current?.focus();
      return;
    }
    setDraft(result.documentJson);
    setDraftDirty(false);
    setError("");
  };

  const exportHref = `data:application/json;charset=utf-8,${encodeURIComponent(currentDocumentJson)}`;
  const describedBy = error ? "workspace-json-hint workspace-json-error" : "workspace-json-hint";

  return (
    <section className="playground-data-panel" aria-labelledby="workspace-data-heading">
      <div className="playground-data-panel__heading">
        <div>
          <h2 id="workspace-data-heading">Workspace data</h2>
          <p>Import, export, or restore the backend-free example.</p>
        </div>
        <button
          aria-controls="workspace-data-content"
          aria-expanded={dataOpen}
          className="playground-disclosure"
          type="button"
          onClick={() => {
            setDataOpen((current) => !current);
            setConfirmationOpen(false);
          }}
        >
          {dataOpen ? "Hide workspace data" : "Show workspace data"}
        </button>
      </div>

      {dataOpen ? (
        <div className="playground-data-panel__content" id="workspace-data-content">
          <div className="playground-data-actions playground-data-actions--top">
            <a
              className="playground-control-link"
              download="setta-workspace.json"
              href={exportHref}
              onClick={() => onStatus("Workspace JSON exported.")}
            >
              Export JSON
            </a>
          </div>
          <form className="playground-json-form" onSubmit={submitImport}>
            <label htmlFor="workspace-json">Workspace JSON</label>
            <textarea
              aria-describedby={describedBy}
              aria-invalid={error ? "true" : undefined}
              data-testid="workspace-json"
              id="workspace-json"
              onChange={(event) => {
                setDraft(event.currentTarget.value);
                setDraftDirty(true);
                setError("");
              }}
              ref={textareaRef}
              rows={5}
              spellCheck={false}
              value={draft}
            />
            <p className="playground-field-hint" id="workspace-json-hint">
              Editing this draft does not change the workspace until you import it.
            </p>
            {error ? (
              <p className="playground-field-error" id="workspace-json-error">
                {error}
              </p>
            ) : null}
            {readOnly ? (
              <p className="playground-field-hint">
                Import and reset are unavailable in read-only mode.
              </p>
            ) : null}
            <div className="playground-data-actions">
              <button disabled={readOnly} type="submit">
                Import JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(currentDocumentJson);
                  setDraftDirty(false);
                  setError("");
                  onStatus("Current workspace JSON restored in the editor.");
                }}
              >
                Restore current JSON
              </button>
              <button
                disabled={readOnly}
                ref={resetTriggerRef}
                type="button"
                onClick={() => setConfirmationOpen(true)}
              >
                Reset example
              </button>
            </div>
          </form>

          {confirmationOpen ? (
            <div className="playground-reset-confirmation" role="group" aria-label="Confirm reset">
              <p>Replace the current workspace with the note, status, and field-list example?</p>
              <div className="playground-data-actions">
                <button
                  type="button"
                  ref={resetConfirmationRef}
                  onClick={() => {
                    onReset();
                    setDraftDirty(false);
                    setError("");
                    closeResetConfirmation();
                  }}
                >
                  Reset workspace
                </button>
                <button type="button" onClick={closeResetConfirmation}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
