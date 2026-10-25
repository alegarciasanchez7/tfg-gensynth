import { createRoot } from "react-dom/client";
import { AppProvider } from "./app/context";
import App from "./app/App.tsx";
import { AppErrorBoundary } from "./app/components/common/AppErrorBoundary";
import "./styles/index.css";

// Variable de entorno para alternar entre modo mock y conexión real.
// Si VITE_USE_MOCK está definido, tiene prioridad sobre el valor por defecto.
const useMockOverride = import.meta.env.VITE_USE_MOCK;
const USE_MOCK_DATA =
  typeof useMockOverride === 'string' && useMockOverride.length > 0
    ? useMockOverride === 'true'
    : import.meta.env.DEV;

// The boundary wraps the provider too, so an error in any part of the UI shows a
// recoverable message instead of a blank page
createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <AppProvider useMockData={USE_MOCK_DATA}>
      <App />
    </AppProvider>
  </AppErrorBoundary>
);
  