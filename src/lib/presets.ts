export type CodecId = 'h264' | 'h265' | 'av1' | 'vp9';
export type ResolutionId = 'original' | 'p1080' | 'p720' | 'p480';
export type CrfQualityId = 'best' | 'high' | 'balanced' | 'small';
export type SizeQualityId = 'size10' | 'size25' | 'size50';
export type QualityId = CrfQualityId | SizeQualityId;
export type AudioId = 'keep' | '256k' | '128k' | '96k' | 'none';
export type Container = 'mp4' | 'webm';

/** The four independent export menus. */
export interface ExportSettings {
  codec: CodecId;
  resolution: ResolutionId;
  quality: QualityId;
  audio: AudioId;
}

/** Either a constant-quality value or an average video bitrate. */
export type RateControl = { crf: number } | { kbps: number };

export interface CodecInfo {
  label: string;
  note: string;
  container: Container;
  audioCodec: 'aac' | 'libopus';
  /** CRF value for each constant-quality tier. */
  crf: Record<CrfQualityId, number>;
  videoArgs(rate: RateControl): string[];
}

function rateArgs(rate: RateControl): string[] {
  return 'crf' in rate ? ['-crf', String(rate.crf)] : ['-b:v', `${rate.kbps}k`];
}

export const CODECS: Record<CodecId, CodecInfo> = {
  h264: {
    label: 'H.264',
    note: 'MP4. Plays everywhere, including Discord.',
    container: 'mp4',
    audioCodec: 'aac',
    crf: { best: 15, high: 20, balanced: 23, small: 27 },
    videoArgs: (rate) => ['-c:v', 'libx264', ...rateArgs(rate), '-preset', 'slow', '-pix_fmt', 'yuv420p'],
  },
  h265: {
    label: 'H.265',
    note: 'MP4. Smaller files, but may not preview in Discord or older players.',
    container: 'mp4',
    audioCodec: 'aac',
    crf: { best: 18, high: 22, balanced: 25, small: 28 },
    videoArgs: (rate) => [
      '-c:v', 'libx265', ...rateArgs(rate), '-preset', 'medium', '-pix_fmt', 'yuv420p',
      '-tag:v', 'hvc1', '-x265-params', 'log-level=error',
    ],
  },
  av1: {
    label: 'AV1',
    note: 'MP4. Smallest files and slow to encode; limited player support.',
    container: 'mp4',
    audioCodec: 'aac',
    crf: { best: 24, high: 30, balanced: 35, small: 40 },
    videoArgs: (rate) => ['-c:v', 'libsvtav1', ...rateArgs(rate), '-preset', '6', '-pix_fmt', 'yuv420p'],
  },
  vp9: {
    label: 'VP9',
    note: 'WebM with Opus audio. Plays in browsers and Discord.',
    container: 'webm',
    audioCodec: 'libopus',
    crf: { best: 20, high: 26, balanced: 31, small: 36 },
    videoArgs: (rate) => [
      '-c:v', 'libvpx-vp9', ...rateArgs(rate), ...('crf' in rate ? ['-b:v', '0'] : []),
      '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-pix_fmt', 'yuv420p',
    ],
  },
};

/** Short side of the output in pixels; null keeps the source (a cropped output is then 1080x1920). */
export const RESOLUTIONS: Record<ResolutionId, { label: string; shortSide: number | null }> = {
  original: { label: 'Original', shortSide: null },
  p1080: { label: '1080p', shortSide: 1080 },
  p720: { label: '720p', shortSide: 720 },
  p480: { label: '480p', shortSide: 480 },
};

export const CRF_QUALITIES: Record<CrfQualityId, string> = {
  best: 'Best',
  high: 'High',
  balanced: 'Balanced',
  small: 'Small',
};

/** Target file sizes in megabytes (1 MB = 1,000,000 bytes). */
export const SIZE_QUALITIES: Record<SizeQualityId, { label: string; megabytes: number }> = {
  size10: { label: '≈ 10 MB (Discord)', megabytes: 10 },
  size25: { label: '≈ 25 MB', megabytes: 25 },
  size50: { label: '≈ 50 MB', megabytes: 50 },
};

export function isSizeQuality(quality: QualityId): quality is SizeQualityId {
  return quality in SIZE_QUALITIES;
}

/** `kbps` is the encode bitrate; null for Keep original and Remove audio. */
export const AUDIO_OPTIONS: Record<AudioId, { label: string; kbps: number | null }> = {
  keep: { label: 'Keep original', kbps: null },
  '256k': { label: 'AAC 256 kbps', kbps: 256 },
  '128k': { label: '128 kbps', kbps: 128 },
  '96k': { label: '96 kbps', kbps: 96 },
  none: { label: 'Remove audio', kbps: null },
};

/** Bitrate used when "Keep original" has to re-encode (a song, a non-AAC clip, or WebM). */
export const KEEP_REENCODE_KBPS = { aac: 256, libopus: 160 } as const;

export type PresetId = 'quality' | 'discord' | 'discord10' | 'small';

export const PRESETS: Record<PresetId, { label: string; settings: ExportSettings }> = {
  quality: {
    label: 'Best quality',
    settings: { codec: 'h264', resolution: 'original', quality: 'best', audio: 'keep' },
  },
  discord: {
    label: 'Discord (720p, small)',
    settings: { codec: 'h264', resolution: 'p720', quality: 'small', audio: '96k' },
  },
  discord10: {
    label: 'Discord (under 10 MB)',
    settings: { codec: 'h264', resolution: 'p720', quality: 'size10', audio: '96k' },
  },
  small: {
    label: 'Smallest (H.265, 720p)',
    settings: { codec: 'h265', resolution: 'p720', quality: 'small', audio: '96k' },
  },
};

export const DEFAULT_PRESET: PresetId = 'quality';

export function isPresetId(value: string): value is PresetId {
  return value in PRESETS;
}

export function isCodecId(value: string): value is CodecId {
  return value in CODECS;
}
export function isResolutionId(value: string): value is ResolutionId {
  return value in RESOLUTIONS;
}
export function isQualityId(value: string): value is QualityId {
  return value in CRF_QUALITIES || value in SIZE_QUALITIES;
}
export function isAudioId(value: string): value is AudioId {
  return value in AUDIO_OPTIONS;
}

/** The preset whose menus all match `settings`, or 'custom' when none does. */
export function matchPreset(settings: ExportSettings): PresetId | 'custom' {
  for (const [id, preset] of Object.entries(PRESETS) as Array<[PresetId, (typeof PRESETS)[PresetId]]>) {
    const p = preset.settings;
    if (
      p.codec === settings.codec &&
      p.resolution === settings.resolution &&
      p.quality === settings.quality &&
      p.audio === settings.audio
    ) {
      return id;
    }
  }
  return 'custom';
}

export function containerOf(settings: ExportSettings): Container {
  return CODECS[settings.codec].container;
}
