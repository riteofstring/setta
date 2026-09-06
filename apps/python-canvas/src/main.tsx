import { createRoot } from "react-dom/client";
import "@setta/workspace/styles.css";

import { PythonCanvasApp } from "./app/PythonCanvasApp";
import "@setta/python-canvas/styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Python Canvas requires a root element.");
}

createRoot(rootElement).render(<PythonCanvasApp />);
