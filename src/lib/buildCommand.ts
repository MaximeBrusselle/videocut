import { clampCropX, cropWidth } from './geometry';
import { samePath } from './paths';
import {
  AUDIO_OPTIONS,
  CODECS,
  KEEP_REENCODE_KBPS,
  RESOLUTIONS,
  SIZE_QUALITIES,
  containerOf,
  isSizeQuality,
  type ExportSettings,
  type RateControl,
} from './presets';
import { songFilters } from './songMix';
import { formatSeconds } from './time';
import type { VideoInfo } from './types';

export interface ExportRequest {
  clipPath: string;
  /** null = no song: the clip keeps its own audio. */
  songPath: string | null;
  outputPath: string;
  video: VideoInfo;
  songDuration: number;
  inPoint: number;
  outPoint: number;
  songStart: number;
  /** Song gain (1 = unchanged, up to 2). */
  songVolume: number;
  /** Song fade lengths in seconds. */
  songFadeIn: number;
  songFadeOut: number;
  /** Crop window x in source pixels. */
  cropX: number;
  /** When false the original frame is kept: no crop and no 1080x1920 scale. */
  cropEnabled: boolean;
  /** Codec, resolution, quality and audio menus. */
  settings: ExportSettings;
  /** Audio codec of the clip (from ffprobe), null when it has no audio. */
  clipAudioCodec: string | null;
}

export interface DurationPlan {
  duration: number;
  /** True when the song ends before the clip does. */
  capped: boolean;
}

/** Below this a target-size export would be unwatchable, so it is refused instead. */
const MIN_VIDEO_KBPS = 50;
/** Single-pass bitrate targeting overshoots a little; aim below the requested size. */
const SIZE_HEADROOM = 0.92;

export function planDuration(
  inPoint: number,
  outPoint: number,
  songStart: number,
  songDuration: number,
): DurationPlan {
  const wanted = outPoint - inPoint;
  const available = songDuration - songStart;
  return { duration: Math.min(wanted, available), capped: available < wanted };
}

/** Output length in seconds: the clip range, capped by the song when there is one. */
export function exportDuration(req: ExportRequest): number {
  if (req.songPath === null) return req.outPoint - req.inPoint;
  return planDuration(req.inPoint, req.outPoint, req.songStart, req.songDuration).duration;
}

type AudioPlan =
  | { mode: 'none' }
  | { mode: 'copy' }
  | { mode: 'encode'; codec: 'aac' | 'libopus'; kbps: number };

function audioPlan(req: ExportRequest): AudioPlan {
  const { audio } = req.settings;
  if (audio === 'none') return { mode: 'none' };
  const codec = CODECS[req.settings.codec].audioCodec;
  if (audio === 'keep') {
    const copyable = req.songPath === null && codec === 'aac' && req.clipAudioCodec === 'aac';
    if (copyable) return { mode: 'copy' };
    return { mode: 'encode', codec, kbps: KEEP_REENCODE_KBPS[codec] };
  }
  return { mode: 'encode', codec, kbps: AUDIO_OPTIONS[audio].kbps ?? KEEP_REENCODE_KBPS[codec] };
}

/** Audio bitrate that counts against a target size; a copied track is assumed to be 256 kbps. */
function audioKbpsForSize(req: ExportRequest, plan: AudioPlan): number {
  if (plan.mode === 'none') return 0;
  if (req.songPath === null && req.clipAudioCodec === null) return 0;
  return plan.mode === 'copy' ? 256 : plan.kbps;
}

/** Average video bitrate needed to hit the target size; null when the quality is constant-quality. */
export function targetVideoKbps(req: ExportRequest): number | null {
  const { quality } = req.settings;
  if (!isSizeQuality(quality)) return null;
  const duration = exportDuration(req);
  if (duration <= 0) return null;
  const totalKbps = (SIZE_QUALITIES[quality].megabytes * 8000 * SIZE_HEADROOM) / duration;
  return Math.floor(totalKbps - audioKbpsForSize(req, audioPlan(req)));
}

/** Human-readable problems that make an export impossible; empty when fine. */
export function validateRequest(req: ExportRequest): string[] {
  const errors: string[] = [];
  if (req.cropEnabled && req.video.width <= cropWidth(req.video.height)) {
    errors.push('The video is not wider than 9:16, so there is nothing to crop.');
  }
  if (req.outPoint <= req.inPoint) {
    errors.push('The out point must be after the in point.');
  }
  if (req.songPath !== null && req.songStart >= req.songDuration) {
    errors.push('The song start is past the end of the song.');
  }
  if (
    samePath(req.outputPath, req.clipPath) ||
    (req.songPath !== null && samePath(req.outputPath, req.songPath))
  ) {
    errors.push('The output file must differ from the input files.');
  }
  if (req.settings.audio === 'none' && req.songPath !== null) {
    errors.push('Audio is set to "Remove audio", but a song is selected.');
  }
  const kbps = targetVideoKbps(req);
  if (kbps !== null && kbps < MIN_VIDEO_KBPS) {
    errors.push('The target size is too small for a clip this long. Choose a larger size.');
  }
  return errors;
}

/** Crop to 9:16 and scale to the chosen size, or only guard against odd sizes (H.264 needs even dimensions). */
function videoFilter(req: ExportRequest): string {
  const { shortSide } = RESOLUTIONS[req.settings.resolution];
  if (!req.cropEnabled) {
    const { width, height } = req.video;
    if (shortSide !== null && Math.min(width, height) > shortSide) {
      const scale = shortSide / Math.min(width, height);
      const w = Math.round((width * scale) / 2) * 2;
      const h = Math.round((height * scale) / 2) * 2;
      return `scale=${w}:${h}:flags=lanczos,setsar=1`;
    }
    return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  }
  const cw = cropWidth(req.video.height);
  const x = clampCropX(req.cropX, req.video.width, req.video.height);
  const w = shortSide ?? 1080;
  const h = Math.round((w * 16) / 9 / 2) * 2; // 480p gives 854, not 853.33
  return `crop=${cw}:ih:${x}:0,scale=${w}:${h}:flags=lanczos,setsar=1`;
}

function rateControl(req: ExportRequest): RateControl {
  const { codec, quality } = req.settings;
  if (isSizeQuality(quality)) return { kbps: Math.max(targetVideoKbps(req) ?? 0, MIN_VIDEO_KBPS) };
  return { crf: CODECS[codec].crf[quality] };
}

/** Full ffmpeg argument list (without the `ffmpeg` executable itself). */
export function buildExportArgs(req: ExportRequest): string[] {
  const duration = exportDuration(req);
  const song = req.songPath;
  const codec = CODECS[req.settings.codec];
  const audio = audioPlan(req);

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats',
    '-ss', formatSeconds(req.inPoint), '-i', req.clipPath,
    ...(song === null ? [] : ['-ss', formatSeconds(req.songStart), '-i', song]),
    '-map', '0:v:0',
    ...(audio.mode === 'none' ? [] : ['-map', song === null ? '0:a:0?' : '1:a:0']),
    '-vf', videoFilter(req),
    ...codec.videoArgs(rateControl(req)),
  ];

  const colourFlags: Array<[string, string | null]> = [
    ['-colorspace', req.video.colorSpace],
    ['-color_primaries', req.video.colorPrimaries],
    ['-color_trc', req.video.colorTransfer],
  ];
  for (const [flag, value] of colourFlags) {
    if (value) args.push(flag, value);
  }

  if (audio.mode === 'none') {
    args.push('-an');
  } else if (audio.mode === 'copy') {
    args.push('-c:a', 'copy');
  } else {
    args.push('-c:a', audio.codec, '-b:a', `${audio.kbps}k`);
  }
  if (song !== null && audio.mode !== 'none') {
    const filters = songFilters(req.songVolume, req.songFadeIn, req.songFadeOut, duration);
    if (filters.length > 0) args.push('-af', filters.join(','));
  }
  args.push('-t', formatSeconds(duration));
  if (containerOf(req.settings) === 'mp4') args.push('-movflags', '+faststart');
  args.push(req.outputPath);
  return args;
}
