import { createRoot } from "react-dom/client";
import "@riteofstring/setta/styles.css";
import "./index.css";

import { ExperimentLensController } from "./app/ExperimentLensController";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Setta Experiment Lens requires a root element.");
}

createRoot(rootElement).render(<ExperimentLensController />);
