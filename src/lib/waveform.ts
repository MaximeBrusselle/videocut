/** Per-bucket peak (max absolute sample over all channels), scaled so the loudest bucket is 1. */
export function computePeaks(channels: Float32Array[], buckets: number): number[] {
  const length = channels[0]?.length ?? 0;
  const peaks = new Array<number>(buckets).fill(0);
  if (length === 0) return peaks;
  for (const data of channels) {
    for (let b = 0; b < buckets; b++) {
      const from = Math.floor((b * length) / buckets);
      const to = Math.max(Math.floor(((b + 1) * length) / buckets), from + 1);
      let max = peaks[b];
      for (let i = from; i < to && i < length; i++) max = Math.max(max, Math.abs(data[i]));
      peaks[b] = max;
    }
  }
  const loudest = Math.max(...peaks);
  return loudest > 0 ? peaks.map((p) => p / loudest) : peaks;
}

/** Latest start that keeps a `windowLength` window inside the song (0 when the song is shorter). */
export function clampSongStart(start: number, windowLength: number, songDuration: number): number {
  return Math.min(Math.max(start, 0), Math.max(songDuration - windowLength, 0));
}

/** Position of the start window as fractions of the song, with its width capped at the song end. */
export function windowFractions(
  songStart: number,
  windowLength: number,
  songDuration: number,
): { left: number; width: number } {
  if (songDuration <= 0) return { left: 0, width: 0 };
  const left = Math.min(Math.max(songStart / songDuration, 0), 1);
  return { left, width: Math.min(windowLength / songDuration, 1 - left) };
}
