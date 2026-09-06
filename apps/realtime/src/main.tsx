import { createRoot } from "react-dom/client";
import "@setta/workspace/styles.css";

import { RealtimeApp } from "./app/RealtimeApp";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Realtime requires a root element.");
}

createRoot(rootElement).render(<RealtimeApp />);
