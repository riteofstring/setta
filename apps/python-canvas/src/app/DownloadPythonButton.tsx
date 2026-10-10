import {
  getWorkspaceCodeSectionData,
  useWorkspaceHost,
  NO_DRAG_CLASS_NAME,
} from "@setta/workspace";
import { useState } from "react";

import { GENERATED_PYTHON_SECTION_ID } from "./workspaceProjection";

export function DownloadPythonButton() {
  const host = useWorkspaceHost();
  const [error, setError] = useState(false);
  function download() {
    let url: string | undefined;
    try {
      const { code } = getWorkspaceCodeSectionData(
        host,
        GENERATED_PYTHON_SECTION_ID,
      );
      url = URL.createObjectURL(
        new Blob([code], { type: "text/x-python;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "canvas_recipe.py";
      link.click();
      setError(false);
    } catch {
      setError(true);
    } finally {
      if (url) {
        const downloadUrl = url;
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
      }
    }
  }
  return (
    <button
      className={`${NO_DRAG_CLASS_NAME} python-canvas-download-python`}
      onClick={download}
      title={
        error
          ? "Download failed. Try again, or copy the code from the editor."
          : "Download the displayed program as canvas_recipe.py"
      }
      type="button"
    >
      {error ? "Retry download" : "Download Python"}
    </button>
  );
}
