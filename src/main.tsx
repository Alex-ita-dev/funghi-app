import { createRoot } from "react-dom/client";
import App from "./App";
import { PreferencesProvider } from "./hooks/usePreferences";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <PreferencesProvider>
    <App />
  </PreferencesProvider>,
);
