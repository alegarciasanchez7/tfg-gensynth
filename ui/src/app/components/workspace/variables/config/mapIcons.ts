import L from 'leaflet';

const DIV_ICON_CACHE = new Map<string, L.DivIcon>();

/**
 * A Leaflet divIcon cached by `key`. Markers must keep the same icon object between renders: a new
 * one makes react-leaflet call setIcon, which recreates the marker element and kills a drag.
 *
 * @param key     identity of the icon (same key → same object; it must also identify the html)
 * @param html    marker content
 * @param size    icon size in pixels (square), anchored at its centre
 * @param className CSS class of the marker element
 */
export function cachedDivIcon(key: string, html: string, size = 22, className = 'custom-map-marker'): L.DivIcon {
  let icon = DIV_ICON_CACHE.get(key);
  if (!icon) {
    icon = L.divIcon({ html, className, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    DIV_ICON_CACHE.set(key, icon);
  }
  return icon;
}
