/** Seconds the way ffmpeg expects them: plain decimal, 3 places, never negative. */
export function formatSeconds(sec: number): string {
  return Math.max(0, sec).toFixed(3);
}

/** "m:ss" (or "m:ss.d" with decimals) for display. */
export function formatMmSs(sec: number, decimals = 0): string {
  const factor = 10 ** decimals;
  const total = Math.round(Math.max(0, sec) * factor) / factor;
  const minutes = Math.floor(total / 60);
  const rest = (total - minutes * 60).toFixed(decimals);
  return `${minutes}:${rest.padStart(decimals ? decimals + 3 : 2, '0')}`;
}

/** Parses "65", "1:05" or "1:05.5" into seconds; null when invalid. */
export function parseMmSs(text: string): number | null {
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (!match) return null;
  const minutes = match[1] ? Number(match[1]) : 0;
  return minutes * 60 + Number(match[2]);
}
