/**
 * Decimal degrees as Degrees, Minutes, Seconds (`36° 32' 15.97" N`), the same text the Core
 * writes in messages. Rounded to the hundredth of a second before splitting, so 59.999" carries
 * into the next minute instead of showing 60.00".
 *
 * @param value      decimal degrees (negative for S / W)
 * @param isLatitude latitude (N/S) or longitude (E/W)
 */
export function formatDms(value: number, isLatitude: boolean): string {
  const hundredths = Math.round(Math.abs(value) * 360_000);
  const degrees = Math.floor(hundredths / 360_000);
  const minutes = Math.floor((hundredths % 360_000) / 6_000);
  const seconds = (hundredths % 6_000) / 100;
  const direction = isLatitude ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
  return `${degrees}° ${minutes}' ${seconds.toFixed(2)}" ${direction}`;
}
