import CodeMirror from "@uiw/react-codemirror";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useEffect, useState } from "react";
import { dbSectionToDict } from "requests/sections";
import { stringify } from "yaml";

export function YamlView({ sectionId }) {
  const [value, setValue] = useState("");
  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({ sectionId, language: "yaml" });

  async function initFn() {
    const res = await dbSectionToDict(sectionId);
    if (res.status === 200) {
      setValue(stringify(parseValues(res.data)));
    }
  }

  useEffect(() => {
    initFn();
  }, [sectionId]);

  return (
    <article
      className={`nodrag nowheel section-full-no-title cursor-auto [&_*]:!outline-0`}
    >
      <CodeMirror value={value} theme={theme} extensions={extensions} />
    </article>
  );
}

function parseValues(obj) {
  for (let key in obj) {
    if (typeof obj[key] === "object" && obj[key] !== null) {
      obj[key] = parseValues(obj[key]);
    } else if (typeof obj[key] === "string") {
      try {
        obj[key] = JSON.parse(obj[key]);
      } catch (e) {
        // If parsing fails, keep the original value
      }
    }
  }
  return obj;
}
