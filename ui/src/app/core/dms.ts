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
  const positive = value >= 0;
  const direction = isLatitude ? latitudeLetter(positive) : longitudeLetter(positive);
  return `${degrees}° ${minutes}' ${seconds.toFixed(2)}" ${direction}`;
}

/** Hemisphere letter of a latitude. */
function latitudeLetter(positive: boolean): string {
  return positive ? 'N' : 'S';
}

/** Hemisphere letter of a longitude. */
function longitudeLetter(positive: boolean): string {
  return positive ? 'E' : 'W';
}
