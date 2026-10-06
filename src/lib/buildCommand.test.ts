import { describe, expect, it } from 'vitest';
import {
  buildExportArgs,
  exportDuration,
  planDuration,
  validateRequest,
  type ExportRequest,
} from './buildCommand';
import { PRESETS, matchPreset, type ExportSettings } from './presets';
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
  settings: PRESETS.quality.settings,
  clipAudioCodec: 'aac',
};

const withSettings = (change: Partial<ExportSettings>, extra: Partial<ExportRequest> = {}): ExportRequest => ({
  ...base,
  ...extra,
  settings: { ...base.settings, ...change },
});

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
    const args = buildExportArgs({ ...base, settings: PRESETS.discord.settings });
    expect(args).toContain('crop=606:ih:100:0,scale=720:1280:flags=lanczos,setsar=1');
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 4)).toEqual(['-c:v', 'libx264', '-crf', '27']);
    expect(args[args.indexOf('-b:a') + 1]).toBe('96k');
  });

  it('encodes H.265 with the hvc1 tag for the smallest preset', () => {
    const args = buildExportArgs({ ...base, settings: PRESETS.small.settings });
    expect(args[args.indexOf('-c:v') + 1]).toBe('libx265');
    expect(args[args.indexOf('-tag:v') + 1]).toBe('hvc1');
  });

  it('downscales an uncropped landscape clip to 720p, keeping the aspect ratio', () => {
    const args = buildExportArgs({ ...base, settings: PRESETS.discord.settings, cropEnabled: false });
    expect(args).toContain('scale=1280:720:flags=lanczos,setsar=1');
  });

  it('does not upscale an uncropped clip that is already small', () => {
    const small = {
      ...base,
      settings: PRESETS.discord.settings,
      cropEnabled: false,
      video: { ...video, width: 640, height: 360 },
    };
    expect(buildExportArgs(small)).toContain('scale=trunc(iw/2)*2:trunc(ih/2)*2');
  });

  it('re-encodes AAC clip audio for the Discord preset instead of copying it', () => {
    const args = buildExportArgs({ ...base, songPath: null, settings: PRESETS.discord.settings });
    expect(args).not.toContain('copy');
  });

  it('uses the codec menu: AV1 and H.265 stay MP4, VP9 switches to WebM with Opus', () => {
    const av1 = buildExportArgs(withSettings({ codec: 'av1' }));
    expect(av1.slice(av1.indexOf('-c:v'), av1.indexOf('-c:v') + 4)).toEqual(['-c:v', 'libsvtav1', '-crf', '24']);
    expect(av1).toContain('+faststart');

    const vp9 = buildExportArgs(withSettings({ codec: 'vp9' }, { outputPath: 'C:\\out\\a.webm' }));
    expect(vp9.slice(vp9.indexOf('-c:v'), vp9.indexOf('-c:v') + 6)).toEqual([
      '-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0',
    ]);
    expect(vp9.slice(vp9.indexOf('-c:a'), vp9.indexOf('-c:a') + 4)).toEqual(['-c:a', 'libopus', '-b:a', '160k']);
    expect(vp9).not.toContain('+faststart');
  });

  it('maps each quality tier to a codec-specific CRF', () => {
    const crf = (settings: Partial<ExportSettings>) => {
      const args = buildExportArgs(withSettings(settings));
      return args[args.indexOf('-crf') + 1];
    };
    expect(crf({ quality: 'high' })).toBe('20');
    expect(crf({ quality: 'small' })).toBe('27');
    expect(crf({ codec: 'h265', quality: 'balanced' })).toBe('25');
  });

  it('sizes the crop for every resolution with even dimensions', () => {
    const filter = (resolution: ExportSettings['resolution']) => {
      const args = buildExportArgs(withSettings({ resolution }));
      return args[args.indexOf('-vf') + 1];
    };
    expect(filter('p1080')).toBe('crop=606:ih:100:0,scale=1080:1920:flags=lanczos,setsar=1');
    expect(filter('p480')).toBe('crop=606:ih:100:0,scale=480:854:flags=lanczos,setsar=1');
  });

  it('removes audio with -an and no audio map', () => {
    const args = buildExportArgs(withSettings({ audio: 'none' }, { songPath: null }));
    expect(args).toContain('-an');
    expect(args.filter((a) => a === '-map')).toHaveLength(1);
    expect(args).not.toContain('-c:a');
  });

  it('uses the chosen audio bitrate', () => {
    const args = buildExportArgs(withSettings({ audio: '128k' }));
    expect(args.slice(args.indexOf('-c:a'), args.indexOf('-c:a') + 4)).toEqual(['-c:a', 'aac', '-b:a', '128k']);
  });

  it('does not copy AAC audio into a WebM', () => {
    const args = buildExportArgs(withSettings({ codec: 'vp9' }, { songPath: null }));
    expect(args).not.toContain('copy');
  });

  describe('target size', () => {
    const sized = (extra: Partial<ExportRequest> = {}) =>
      withSettings({ quality: 'size10', audio: '96k' }, { inPoint: 0, outPoint: 20, songDuration: 100, songStart: 0, ...extra });

    it('uses an average video bitrate that leaves room for the audio', () => {
      const args = buildExportArgs(sized());
      // 10 MB * 8000 * 0.92 / 20 s = 3680 kbps total, minus 96 kbps audio.
      expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 4)).toEqual(['-c:v', 'libx264', '-b:v', '3584k']);
      expect(args).not.toContain('-crf');
    });

    it('uses a plain bitrate for VP9', () => {
      const args = buildExportArgs({ ...sized(), settings: { ...sized().settings, codec: 'vp9' } });
      expect(args[args.indexOf('-b:v') + 1]).toBe('3584k');
      expect(args).not.toContain('-crf');
    });

    it('is refused when the clip is too long for the size', () => {
      const errors = validateRequest(sized({ outPoint: 3000, songDuration: 5000 }));
      expect(errors.join(' ')).toMatch(/too small/);
    });

    it('is accepted for a normal clip', () => {
      expect(validateRequest(sized())).toEqual([]);
    });
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

describe('presets', () => {
  it('match their own settings and report Custom once a menu changes', () => {
    for (const [id, preset] of Object.entries(PRESETS)) {
      expect(matchPreset(preset.settings)).toBe(id);
    }
    expect(matchPreset({ ...PRESETS.quality.settings, codec: 'av1' })).toBe('custom');
  });

  it('refuses to remove the audio while a song is selected', () => {
    expect(validateRequest(withSettings({ audio: 'none' })).join(' ')).toMatch(/Remove audio/);
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
