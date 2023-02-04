import MDEditor from "@uiw/react-md-editor";
import { useMarkdown } from "models/markdown";
import React from "react";

const _MarkdownEditor = React.forwardRef(({ sectionId }, ref) => {
  const markdown = useMarkdown((x) => x.x[sectionId]);
  const setMarkdown = useMarkdown((x) => x.setMarkdown);

  return (
    <div
      data-color-mode="light"
      className="flex flex-1 flex-col items-stretch overflow-y-auto rounded-2xl border border-solid border-gray-300 [&_.w-md-editor-bar]:hidden [&_.w-md-editor-text_*]:font-code"
    >
      <MDEditor
        value={markdown || ""}
        onChange={(e) => setMarkdown({ sectionId, value: e })}
        preview="edit"
        textareaProps={{ resize: "none" }}
        className="flex-1 self-stretch"
      />
      {/* <MDEditor.Markdown source={value} style={{ whiteSpace: "pre-wrap" }} /> */}
    </div>
  );
});

export const MarkdownEditor = React.memo(_MarkdownEditor);
