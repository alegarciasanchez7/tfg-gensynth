import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/** Re-render on every change of the mobile media query. */
function subscribe(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function isMobileWidth(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

/** Whether the window is narrower than the mobile breakpoint. */
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, isMobileWidth, () => false);
}
