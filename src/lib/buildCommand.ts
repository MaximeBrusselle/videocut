import { clampCropX, cropWidth } from './geometry';
import { samePath } from './paths';
import { formatSeconds } from './time';
import type { VideoInfo } from './types';

export interface ExportRequest {
  clipPath: string;
  songPath: string;
  outputPath: string;
  video: VideoInfo;
  songDuration: number;
  inPoint: number;
  outPoint: number;
  songStart: number;
  /** Crop window x in source pixels. */
  cropX: number;
  /** When false the original frame is kept: no crop and no 1080x1920 scale. */
  cropEnabled: boolean;
}

export interface DurationPlan {
  duration: number;
  /** True when the song ends before the clip does. */
  capped: boolean;
}

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

/** Human-readable problems that make an export impossible; empty when fine. */
export function validateRequest(req: ExportRequest): string[] {
  const errors: string[] = [];
  if (req.cropEnabled && req.video.width <= cropWidth(req.video.height)) {
    errors.push('The video is not wider than 9:16, so there is nothing to crop.');
  }
  if (req.outPoint <= req.inPoint) {
    errors.push('The out point must be after the in point.');
  }
  if (req.songStart >= req.songDuration) {
    errors.push('The song start is past the end of the song.');
  }
  if (samePath(req.outputPath, req.clipPath) || samePath(req.outputPath, req.songPath)) {
    errors.push('The output file must differ from the input files.');
  }
  return errors;
}

/** Crop to 9:16 and scale to 1080x1920, or only guard against odd sizes (H.264 needs even dimensions). */
function videoFilter(req: ExportRequest): string {
  if (!req.cropEnabled) return 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const cw = cropWidth(req.video.height);
  const x = clampCropX(req.cropX, req.video.width, req.video.height);
  return `crop=${cw}:ih:${x}:0,scale=1080:1920:flags=lanczos,setsar=1`;
}

/** Full ffmpeg argument list (without the `ffmpeg` executable itself). */
export function buildExportArgs(req: ExportRequest): string[] {
  const { duration } = planDuration(req.inPoint, req.outPoint, req.songStart, req.songDuration);

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats',
    '-ss', formatSeconds(req.inPoint), '-i', req.clipPath,
    '-ss', formatSeconds(req.songStart), '-i', req.songPath,
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', videoFilter(req),
    '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p',
  ];

  const colourFlags: Array<[string, string | null]> = [
    ['-colorspace', req.video.colorSpace],
    ['-color_primaries', req.video.colorPrimaries],
    ['-color_trc', req.video.colorTransfer],
  ];
  for (const [flag, value] of colourFlags) {
    if (value) args.push(flag, value);
  }

  args.push('-c:a', 'aac', '-b:a', '256k');
  if (duration >= 1) {
    args.push('-af', `afade=t=out:st=${formatSeconds(duration - 1)}:d=1`);
  }
  args.push('-t', formatSeconds(duration), '-movflags', '+faststart', req.outputPath);
  return args;
}
