import {
  getWorkspaceCodeSectionData,
  getWorkspaceTextSectionData,
  setWorkspaceCodeSectionData,
  setWorkspaceTextSectionData,
  useWorkspaceHost,
  WORKSPACE_CODE_SECTION_LANGUAGES,
  WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH,
  WORKSPACE_CODE_SECTION_MODES,
  WORKSPACE_TEXT_SECTION_FORMATS,
  WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE,
  WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE,
  type WorkspaceCodeSectionData,
  type WorkspaceCodeSectionLanguage,
  type WorkspaceCodeSectionMode,
  type WorkspaceHost,
  type WorkspaceTextSectionData,
  type WorkspaceTextSectionFormat,
} from "@setta/workspace";

// The Inspector contributions the playground registers for the two built-in content sections.
// They are the host's own authoring UI over package-owned typed data, so they live beside the
// registry rather than inside it.

// The package owns the code section's data contract and its editor; the host owns any UI that
// authors those options. This contribution is that UI: it reads and writes the same typed data
// the editor commits through, so every option is reachable without a package-invented settings
// panel (frozen main's own code-area settings are entirely file-binding, which is application
// state this package does not carry).
function updatePlaygroundCodeSection(
  host: WorkspaceHost,
  sectionId: string,
  update: (current: WorkspaceCodeSectionData) => WorkspaceCodeSectionData,
) {
  setWorkspaceCodeSectionData(
    host,
    sectionId,
    update(getWorkspaceCodeSectionData(host, sectionId)),
  );
}

export function PlaygroundCodeSectionInspector({
  sectionId,
}: {
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const data = getWorkspaceCodeSectionData(host, sectionId);
  return (
    <div className="playground-host-pane">
      <fieldset className="playground-section-options">
        <legend>Editor options</legend>
        <label className="playground-section-option-row">
          <span>Language</span>
          <select
            className="playground-section-option-control"
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) => ({
                ...current,
                language: event.target.value as WorkspaceCodeSectionLanguage,
              }))
            }
            value={data.language}
          >
            {WORKSPACE_CODE_SECTION_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </label>
        <label className="playground-section-option-row">
          <span>Wrap lines</span>
          <input
            checked={data.wrapLines}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) => ({
                ...current,
                wrapLines: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
        <label className="playground-section-option-row">
          <span>Line numbers</span>
          <input
            checked={data.lineNumbers}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) => ({
                ...current,
                lineNumbers: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
        <label className="playground-section-option-row">
          <span>Indent width</span>
          <input
            className="playground-section-option-control playground-section-option-number"
            max={WORKSPACE_CODE_SECTION_MAXIMUM_INDENT_WIDTH}
            min={WORKSPACE_CODE_SECTION_MINIMUM_INDENT_WIDTH}
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) => ({
                ...current,
                indentWidth: Number(event.target.value),
              }))
            }
            type="number"
            value={data.indentWidth}
          />
        </label>
        <label className="playground-section-option-row">
          <span>Mode</span>
          <select
            className="playground-section-option-control"
            onChange={(event) =>
              updatePlaygroundCodeSection(host, sectionId, (current) => ({
                ...current,
                mode: event.target.value as WorkspaceCodeSectionMode,
              }))
            }
            value={data.mode}
          >
            {WORKSPACE_CODE_SECTION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
    </div>
  );
}

// The text section's options are host UI over the same typed data the editor and the header
// control commit through, so no option needs a package-invented settings panel.
function updatePlaygroundTextSection(
  host: WorkspaceHost,
  sectionId: string,
  update: (current: WorkspaceTextSectionData) => WorkspaceTextSectionData,
) {
  setWorkspaceTextSectionData(
    host,
    sectionId,
    update(getWorkspaceTextSectionData(host, sectionId)),
  );
}

export function PlaygroundTextSectionInspector({
  sectionId,
}: {
  sectionId: string;
}) {
  const host = useWorkspaceHost();
  const data = getWorkspaceTextSectionData(host, sectionId);
  return (
    <div className="playground-host-pane">
      <fieldset className="playground-section-options">
        <legend>Text options</legend>
        <label className="playground-section-option-row">
          <span>Format</span>
          <select
            className="playground-section-option-control"
            onChange={(event) =>
              updatePlaygroundTextSection(host, sectionId, (current) => ({
                ...current,
                format: event.target.value as WorkspaceTextSectionFormat,
              }))
            }
            value={data.format}
          >
            {WORKSPACE_TEXT_SECTION_FORMATS.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
        </label>
        <label className="playground-section-option-row">
          <span>Font size</span>
          <input
            className="playground-section-option-control playground-section-option-number"
            max={WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE}
            min={WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE}
            onChange={(event) =>
              updatePlaygroundTextSection(host, sectionId, (current) => ({
                ...current,
                fontSizePx: Number(event.target.value),
              }))
            }
            type="number"
            value={data.fontSizePx}
          />
        </label>
        <label className="playground-section-option-row">
          <span>Read only</span>
          <input
            checked={data.readOnly}
            className="playground-section-option-switch"
            onChange={(event) =>
              updatePlaygroundTextSection(host, sectionId, (current) => ({
                ...current,
                readOnly: event.target.checked,
              }))
            }
            type="checkbox"
          />
        </label>
      </fieldset>
    </div>
  );
}
