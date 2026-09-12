import { createRoot } from "react-dom/client";
import "@setta/bench/styles.css";
import "@setta/workspace/styles.css";

import { BenchApp } from "./app/BenchApp";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Setta Bench requires a root element.");
}

createRoot(rootElement).render(<BenchApp />);
