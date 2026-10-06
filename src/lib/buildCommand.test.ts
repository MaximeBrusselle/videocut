import { describe, expect, it } from 'vitest';
import {
  buildExportArgs,
  exportDuration,
  planDuration,
  validateRequest,
  type ExportRequest,
} from './buildCommand';
import type { VideoInfo } from './types';

const video: VideoInfo = {
  width: 1920,
  height: 1080,
  fps: 30,
  codec: 'h264',
  colorSpace: null,
  colorPrimaries: null,
  colorTransfer: null,
};

const base: ExportRequest = {
  clipPath: 'C:\\clips\\a.mp4',
  songPath: 'C:\\music\\s.mp3',
  outputPath: 'C:\\out\\a_tiktok.mp4',
  video,
  songDuration: 10,
  inPoint: 1,
  outPoint: 4,
  songStart: 2,
  cropX: 100,
  cropEnabled: true,
  preset: 'quality',
  clipAudioCodec: 'aac',
};

describe('planDuration', () => {
  it('uses the clip length when the song is long enough', () => {
    expect(planDuration(1, 4, 2, 10)).toEqual({ duration: 3, capped: false });
  });
  it('caps to the remaining song length', () => {
    expect(planDuration(0, 10, 4, 9)).toEqual({ duration: 5, capped: true });
  });
});

describe('buildExportArgs', () => {
  it('builds the full argument list for a typical export', () => {
    expect(buildExportArgs(base)).toEqual([
      '-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats',
      '-ss', '1.000', '-i', 'C:\\clips\\a.mp4',
      '-ss', '2.000', '-i', 'C:\\music\\s.mp3',
      '-map', '0:v:0', '-map', '1:a:0',
      '-vf', 'crop=606:ih:100:0,scale=1080:1920:flags=lanczos,setsar=1',
      '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '256k',
      '-af', 'afade=t=out:st=2.000:d=1',
      '-t', '3.000', '-movflags', '+faststart',
      'C:\\out\\a_tiktok.mp4',
    ]);
  });

  it('scales to 720x1280 with a lower audio bitrate for the Discord preset', () => {
    const args = buildExportArgs({ ...base, preset: 'discord' });
    expect(args).toContain('crop=606:ih:100:0,scale=720:1280:flags=lanczos,setsar=1');
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 4)).toEqual(['-c:v', 'libx264', '-crf', '27']);
    expect(args[args.indexOf('-b:a') + 1]).toBe('96k');
  });

  it('encodes H.265 with the hvc1 tag for the smallest preset', () => {
    const args = buildExportArgs({ ...base, preset: 'small' });
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx265');
    expect(args[args.indexOf('-tag:v') + 1]).toBe('hvc1');
  });

  it('downscales an uncropped landscape clip to 720p, keeping the aspect ratio', () => {
    const args = buildExportArgs({ ...base, preset: 'discord', cropEnabled: false });
    expect(args).toContain('scale=1280:720:flags=lanczos,setsar=1');
  });

  it('does not upscale an uncropped clip that is already small', () => {
    const small = { ...base, preset: 'discord' as const, cropEnabled: false, video: { ...video, width: 640, height: 360 } };
    expect(buildExportArgs(small)).toContain('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  });

  it('re-encodes AAC clip audio for the Discord preset instead of copying it', () => {
    const args = buildExportArgs({ ...base, songPath: null, preset: 'discord' });
    expect(args).not.toContain('copy');
  });

  it('caps the duration when the song is too short', () => {
    const args = buildExportArgs({ ...base, inPoint: 0, outPoint: 10, songStart: 4, songDuration: 9 });
    expect(args).toContain('5.000');
    expect(args[args.indexOf('-t') + 1]).toBe('5.000');
    expect(args).toContain('afade=t=out:st=4.000:d=1');
  });

  it('skips the fade for clips shorter than 1 second', () => {
    const args = buildExportArgs({ ...base, inPoint: 1, outPoint: 1.5 });
    expect(args).not.toContain('-af');
    expect(args[args.indexOf('-t') + 1]).toBe('0.500');
  });

  it('adds colour tags only when the source has them', () => {
    const tagged = buildExportArgs({
      ...base,
      video: { ...video, colorSpace: 'bt709', colorPrimaries: 'bt709', colorTransfer: 'bt709' },
    });
    expect(tagged).toContain('-colorspace');
    expect(tagged).toContain('-color_primaries');
    expect(tagged).toContain('-color_trc');
    expect(buildExportArgs(base)).not.toContain('-colorspace');
  });

  it('keeps the original frame (no crop, no 1080x1920 scale) when cropping is off', () => {
    const args = buildExportArgs({ ...base, cropEnabled: false });
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    expect(args.join(' ')).not.toContain('crop=');
    expect(args.join(' ')).not.toContain('1080:1920');
  });

  it('clamps the crop position inside the frame', () => {
    const args = buildExportArgs({ ...base, cropX: 5000 });
    expect(args[args.indexOf('-vf') + 1]).toBe('crop=606:ih:1314:0,scale=1080:1920:flags=lanczos,setsar=1');
  });
});

describe('without a song', () => {
  const noSong: ExportRequest = { ...base, songPath: null, songDuration: 0, songStart: 0 };

  it('uses the clip length and ignores the song fields', () => {
    expect(exportDuration(noSong)).toBe(3);
    expect(exportDuration(base)).toBe(3);
  });

  it('copies AAC audio from the clip, with one input and no fade', () => {
    const args = buildExportArgs(noSong);
    expect(args.filter((a) => a === '-i')).toHaveLength(1);
    expect(args).toContain('0:a:0?');
    expect(args).not.toContain('1:a:0');
    expect(args.slice(args.indexOf('-c:a'), args.indexOf('-c:a') + 2)).toEqual(['-c:a', 'copy']);
    expect(args).not.toContain('-af');
    expect(args[args.indexOf('-t') + 1]).toBe('3.000');
  });

  it('re-encodes clip audio that is not AAC', () => {
    const args = buildExportArgs({ ...noSong, clipAudioCodec: 'opus' });
    expect(args.slice(args.indexOf('-c:a'), args.indexOf('-c:a') + 4)).toEqual([
      '-c:a', 'aac', '-b:a', '256k',
    ]);
  });

  it('is valid without any song information', () => {
    expect(validateRequest(noSong)).toEqual([]);
  });

  it('still refuses to overwrite the clip', () => {
    expect(validateRequest({ ...noSong, outputPath: 'C:\\clips\\a.mp4' }).join(' ')).toMatch(/must differ/);
  });
});

describe('validateRequest', () => {
  it('accepts a normal request', () => {
    expect(validateRequest(base)).toEqual([]);
  });
  it('rejects sources that are not wider than 9:16', () => {
    const errors = validateRequest({ ...base, video: { ...video, width: 600, height: 1080 } });
    expect(errors.join(' ')).toMatch(/not wider than 9:16/);
  });
  it('accepts a portrait source when cropping is off', () => {
    const portrait = { ...base, cropEnabled: false, video: { ...video, width: 600, height: 1080 } };
    expect(validateRequest(portrait)).toEqual([]);
  });
  it('rejects out <= in', () => {
    expect(validateRequest({ ...base, outPoint: 1 }).join(' ')).toMatch(/out point/);
  });
  it('rejects a song start past the end of the song', () => {
    expect(validateRequest({ ...base, songStart: 10 }).join(' ')).toMatch(/song start/);
  });
  it('refuses to overwrite an input file', () => {
    expect(validateRequest({ ...base, outputPath: 'c:/clips/A.mp4' }).join(' ')).toMatch(/must differ/);
    expect(validateRequest({ ...base, outputPath: 'C:\\music\\s.mp3' }).join(' ')).toMatch(/must differ/);
  });
});
