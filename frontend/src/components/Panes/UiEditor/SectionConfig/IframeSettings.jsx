import { useState } from "react";
import { useSectionInfos } from "state/definitions";

export function IframeSettings({ sectionId }) {
  const [iframeCode, setIframeCode] = useState("");
  const [error, setError] = useState("");

  const validateIframeCode = (code) => {
    if (!code.toLowerCase().includes("<iframe")) {
      return "Input must contain an iframe tag";
    }
    return "";
  };

  const handleCodeChange = (e) => {
    const newCode = e.target.value;
    setIframeCode(newCode);

    const validationError = validateIframeCode(newCode);
    setError(validationError);

    // Only pass valid code to parent
    if (!validationError) {
      useSectionInfos.setState((x) => {
        x.x[sectionId].iframeCode = newCode;
      });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex-none border-b p-4">
        <h2 className="text-lg font-medium">Iframe Code</h2>
        <p className="text-sm text-gray-600">Paste your iframe HTML below</p>
      </div>

      {/* Main content area with scroll */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <textarea
            value={iframeCode}
            onChange={handleCodeChange}
            className="h-48 w-full resize-none rounded-md border p-3 font-mono text-sm"
            placeholder="<iframe src='...' width='100%' height='100%'></iframe>"
            spellCheck="false"
          />

          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}

          <div className="text-sm text-gray-600">
            <h3 className="mb-2 font-medium">Tips:</h3>
            <ul className="space-y-1">
              <li>
                • Use width="100%" and height="100%" for responsive sizing
              </li>
              <li>• Include frameborder="0" to remove the default border</li>
              <li>• Consider adding title="..." for accessibility</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
