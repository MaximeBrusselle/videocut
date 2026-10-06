export type PresetId = 'quality' | 'discord' | 'small';

export interface ExportPreset {
  label: string;
  /** Short side of the output in pixels; null keeps the source resolution (cropped output is 1080x1920). */
  shortSide: number | null;
  /** Video encoder arguments, everything between the filter and the colour flags. */
  videoArgs: string[];
  audioBitrate: string;
  /** Keep an AAC clip's own audio untouched when there is no song. */
  copyClipAudio: boolean;
}

export const DEFAULT_PRESET: PresetId = 'quality';

export const PRESETS: Record<PresetId, ExportPreset> = {
  quality: {
    label: 'Best quality (H.264, 1080p)',
    shortSide: null,
    videoArgs: ['-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p'],
    audioBitrate: '256k',
    copyClipAudio: true,
  },
  discord: {
    label: 'Discord (H.264, 720p, small)',
    shortSide: 720,
    videoArgs: ['-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p'],
    audioBitrate: '96k',
    copyClipAudio: false,
  },
  small: {
    label: 'Smallest (H.265, 720p, may not preview in Discord)',
    shortSide: 720,
    videoArgs: [
      '-c:v', 'libx265', '-crf', '28', '-preset', 'medium', '-pix_fmt', 'yuv420p',
      '-tag:v', 'hvc1', '-x265-params', 'log-level=error',
    ],
    audioBitrate: '96k',
    copyClipAudio: false,
  },
};

export function isPresetId(value: string): value is PresetId {
  return value in PRESETS;
}
