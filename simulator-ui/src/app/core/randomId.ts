/**
 * Random UUID (version 4) for items created in the UI.
 *
 * `crypto.randomUUID` only exists in secure contexts (https or localhost). The desktop app serves
 * the UI from http://gensynth.local, where it is missing, so the UUID is built from
 * `crypto.getRandomValues`, which is available in every context.
 */
export function randomUUID(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
