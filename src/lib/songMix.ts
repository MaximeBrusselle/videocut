import { formatSeconds } from './time';

export const DEFAULT_SONG_VOLUME = 1;
export const DEFAULT_SONG_FADE_IN = 0;
export const DEFAULT_SONG_FADE_OUT = 1;

/** ffmpeg audio filters for the song: volume (+ limiter when boosting), then fade in and fade out. */
export function songFilters(volume: number, fadeIn: number, fadeOut: number, duration: number): string[] {
  const filters: string[] = [];
  const level = Number(volume.toFixed(2));
  if (level !== 1) filters.push(`volume=${level}`);
  if (level > 1) filters.push('alimiter=limit=0.97');
  const inLength = Math.min(Math.max(fadeIn, 0), duration);
  const outLength = Math.min(Math.max(fadeOut, 0), duration);
  if (inLength > 0) filters.push(`afade=t=in:st=0:d=${formatSeconds(inLength)}`);
  if (outLength > 0) {
    filters.push(`afade=t=out:st=${formatSeconds(duration - outLength)}:d=${formatSeconds(outLength)}`);
  }
  return filters;
}

/** Linear fade multiplier (0..1) at `time` seconds into a `duration`-second export. */
export function fadeGain(time: number, duration: number, fadeIn: number, fadeOut: number): number {
  if (time < 0 || time > duration) return 0;
  let gain = 1;
  if (fadeIn > 0) gain = Math.min(gain, time / fadeIn);
  if (fadeOut > 0) gain = Math.min(gain, (duration - time) / fadeOut);
  return Math.min(Math.max(gain, 0), 1);
}
