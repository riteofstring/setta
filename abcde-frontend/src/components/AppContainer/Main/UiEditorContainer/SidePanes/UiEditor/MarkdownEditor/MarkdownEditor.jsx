import MDEditor from "@uiw/react-md-editor";
// import { useState } from "react";
import { useMarkdown } from "models/panes";

export function MarkdownEditor() {
  const markdown = useMarkdown((state) => state.data);
  const setMarkdown = useMarkdown((state) => state.setMarkdown);

  return (
    <div
      data-color-mode="light"
      className="flex flex-1 flex-col items-stretch overflow-y-auto rounded-2xl border border-solid border-gray-300 [&_.w-md-editor-bar]:hidden [&_.w-md-editor-text_*]:font-code"
    >
      <MDEditor
        value={markdown || ""}
        onChange={(e) => setMarkdown(e)}
        preview="edit"
        textareaProps={{ resize: "none" }}
        className="flex-1 self-stretch"
      />
      {/* <MDEditor.Markdown source={value} style={{ whiteSpace: "pre-wrap" }} /> */}
    </div>
  );
}
