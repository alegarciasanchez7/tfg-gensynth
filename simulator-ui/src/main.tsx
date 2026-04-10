import { createRoot } from "react-dom/client";
import { AppProvider } from "./app/context";
import App from "./app/App.tsx";
import "./styles/index.css";

// Variable de entorno para alternar entre modo mock y conexión real
// En desarrollo usamos mock, en producción (JCEF) usamos datos reales
const USE_MOCK_DATA = import.meta.env.DEV || import.meta.env.VITE_USE_MOCK === 'true';

createRoot(document.getElementById("root")!).render(
  <AppProvider useMockData={USE_MOCK_DATA}>
    <App />
  </AppProvider>
);
  