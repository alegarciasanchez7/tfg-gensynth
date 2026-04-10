/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_USE_MOCK: string;
  readonly VITE_WEBSOCKET_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
