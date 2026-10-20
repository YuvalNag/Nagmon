import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { openServices } from "./app/services";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
openServices().then((services) =>
  root.render(
    <StrictMode>
      <App services={services} />
    </StrictMode>,
  ),
);
