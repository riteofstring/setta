import { Tldraw } from "tldraw";
import "../../../../tldraw.css";

// some code from https://stackoverflow.com/a/29073539

export function DrawOnImage({ sectionId }) {
  return (
    <div className="nodrag" style={{ position: "fixed", inset: 0 }}>
      <Tldraw />
    </div>
  );
}
