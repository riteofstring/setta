import MDEditor from "@uiw/react-md-editor";
import { useSectionDescription } from "models/info/sectionDescription";
import React from "react";

const _MarkdownEditor = React.forwardRef(({ sectionId }, ref) => {
  const description = useSectionDescription((x) => x.x[sectionId].value);
  const setDescription = useSectionDescription((x) => x.setDescription);

  return (
    <div
      data-color-mode="light"
      className="flex flex-1 flex-col items-stretch overflow-y-auto rounded-2xl border border-solid border-slate-300 [&_.w-md-editor-bar]:hidden [&_.w-md-editor-text_*]:font-code"
    >
      <MDEditor
        value={description || ""}
        onChange={(e) => setDescription({ sectionId, value: e })}
        preview="edit"
        textareaProps={{ resize: "none" }}
        className="flex-1 self-stretch"
      />
    </div>
  );
});

export const MarkdownEditor = React.memo(_MarkdownEditor);
