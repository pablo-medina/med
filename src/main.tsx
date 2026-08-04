import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { WindowManager } from "./components/WindowManager";
import { initializeI18n } from "./i18n";

async function bootstrap() {
  await initializeI18n();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <WindowManager>
        <App />
      </WindowManager>
    </React.StrictMode>,
  );
}

void bootstrap();
