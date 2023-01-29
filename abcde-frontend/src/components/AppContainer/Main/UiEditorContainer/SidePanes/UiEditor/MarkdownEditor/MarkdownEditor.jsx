import MDEditor from "@uiw/react-md-editor";
import { useState } from "react";

export function MarkdownEditor() {
  const [value, setValue] = useState("**Hello world!!!**");
  return (
    <div data-color-mode="light" className="flex-1">
      <MDEditor
        value={value}
        onChange={setValue}
        preview="edit"
        onHeightChange="100%"
      />
      <MDEditor.Markdown source={value} style={{ whiteSpace: "pre-wrap" }} />
    </div>
  );
}
