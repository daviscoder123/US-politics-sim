import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";

const element = document.getElementById("root");
if (!element) {
  throw new Error("Chybí element #root v index.html.");
}
createRoot(element).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
