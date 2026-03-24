import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import App from "./App";

const container = document.getElementById("app");
if (!container) {
  throw new Error("Root element #app not found in document");
}

const root = createRoot(container);
// StrictMode removed — it double-fires effects in dev AND production builds,
// causing double PTY session creation on project open.
root.render(<App />);
