import { useLayoutEffect } from 'react';

/**
 * Applies the selected theme to the whole document.
 *
 * The `dark` class is set on `<html>` (not on the App root) so overlays rendered in portals
 * under `<body>` (dialogs, selects, popovers, toasts) inherit the theme too. A layout effect
 * applies it before the browser paints, so there is no flash of the wrong theme.
 */
export function useDocumentTheme(isDark: boolean): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);
}
