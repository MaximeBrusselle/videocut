import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildExportArgs, planDuration, type ExportRequest } from '../src/lib/buildCommand';
import { PRESETS, type ExportSettings } from '../src/lib/presets';

const toolsAvailable =
  spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

interface ProbedStream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
}

function probe(file: string): { streams: ProbedStream[]; format: { duration: string } } {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { encoding: 'utf8' },
  );
  return JSON.parse(out);
}

describe.skipIf(!toolsAvailable)('export smoke test', () => {
  let dir: string;
  let clip: string;
  let song: string;
  let clipWithAudio: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'videocut-'));
    clip = join(dir, 'clip.mp4');
    song = join(dir, 'song.wav');
    clipWithAudio = join(dir, 'clip-audio.mp4');
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30',
      '-t', '5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip,
    ]);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', song,
    ]);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=5', '-t', '5',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', clipWithAudio,
    ]);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function request(output: string, overrides: Partial<ExportRequest> = {}): ExportRequest {
    return {
      clipPath: clip,
      songPath: song,
      outputPath: output,
      video: {
        width: 1920, height: 1080, fps: 30, codec: 'h264',
        colorSpace: null, colorPrimaries: null, colorTransfer: null,
      },
      songDuration: 8,
      inPoint: 1,
      outPoint: 4,
      songStart: 2,
      songVolume: 1,
      songFadeIn: 0,
      songFadeOut: 1,
      cropX: 100,
      cropEnabled: true,
      settings: PRESETS.quality.settings,
      clipAudioCodec: null,
      ...overrides,
    };
  }

  it('produces a 1080x1920 H.264 file with the song as audio', () => {
    const output = join(dir, 'out.mp4');
    execFileSync('ffmpeg', buildExportArgs(request(output)));

    const info = probe(output);
    const video = info.streams.find((s) => s.codec_type === 'video');
    const audio = info.streams.find((s) => s.codec_type === 'audio');
    expect(video?.width).toBe(1080);
    expect(video?.height).toBe(1920);
    expect(video?.codec_name).toBe('h264');
    expect(video?.pix_fmt).toBe('yuv420p');
    expect(audio?.codec_name).toBe('aac');
    expect(info.streams).toHaveLength(2);
    expect(Math.abs(Number(info.format.duration) - 3)).toBeLessThan(0.1);
  });

  it('accepts the boosted volume, limiter and both fades', () => {
    const output = join(dir, 'mixed.mp4');
    execFileSync(
      'ffmpeg',
      buildExportArgs(request(output, { songVolume: 1.8, songFadeIn: 0.5, songFadeOut: 1.5 })),
    );

    const info = probe(output);
    expect(info.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
    expect(Math.abs(Number(info.format.duration) - 3)).toBeLessThan(0.1);
  });

  it('exports a silent clip without a song as video only', () => {
    const output = join(dir, 'silent.mp4');
    execFileSync('ffmpeg', buildExportArgs(request(output, { songPath: null })));

    const info = probe(output);
    expect(info.streams.map((s) => s.codec_type)).toEqual(['video']);
    expect(Math.abs(Number(info.format.duration) - 3)).toBeLessThan(0.1);
  });

  it('keeps the clip audio when there is no song', () => {
    const output = join(dir, 'kept-audio.mp4');
    execFileSync(
      'ffmpeg',
      buildExportArgs(request(output, { clipPath: clipWithAudio, songPath: null, clipAudioCodec: 'aac' })),
    );

    const info = probe(output);
    expect(info.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe('aac');
    expect(Math.abs(Number(info.format.duration) - 3)).toBeLessThan(0.1);
  });

  it('keeps the source resolution when cropping is off', () => {
    const output = join(dir, 'nocrop.mp4');
    execFileSync('ffmpeg', buildExportArgs(request(output, { cropEnabled: false })));

    const video = probe(output).streams.find((s) => s.codec_type === 'video');
    expect(video?.width).toBe(1920);
    expect(video?.height).toBe(1080);
  });

  it('produces a 720x1280 H.264 file for the Discord preset', () => {
    const output = join(dir, 'discord.mp4');
    execFileSync('ffmpeg', buildExportArgs(request(output, { settings: PRESETS.discord.settings })));

    const video = probe(output).streams.find((s) => s.codec_type === 'video');
    expect(video?.width).toBe(720);
    expect(video?.height).toBe(1280);
    expect(video?.codec_name).toBe('h264');
  });

  it('produces an H.265 file for the smallest preset', () => {
    const output = join(dir, 'small.mp4');
    execFileSync('ffmpeg', buildExportArgs(request(output, { settings: PRESETS.small.settings })));

    const video = probe(output).streams.find((s) => s.codec_type === 'video');
    expect(video?.width).toBe(720);
    expect(video?.codec_name).toBe('hevc');
  });

  const codecCases: Array<[string, ExportSettings['codec'], string, string, string]> = [
    ['AV1 in MP4', 'av1', 'mp4', 'av1', 'aac'],
    ['VP9 in WebM with Opus', 'vp9', 'webm', 'vp9', 'opus'],
  ];
  it.each(codecCases)('produces %s', (_name, codec, ext, videoCodec, audioCodec) => {
    const output = join(dir, `codec-${codec}.${ext}`);
    const settings: ExportSettings = { ...PRESETS.discord.settings, codec, resolution: 'p480' };
    execFileSync('ffmpeg', buildExportArgs(request(output, { settings })));

    const info = probe(output);
    const video = info.streams.find((s) => s.codec_type === 'video');
    expect(video?.codec_name).toBe(videoCodec);
    expect(video?.width).toBe(480);
    expect(video?.height).toBe(854);
    expect(info.streams.find((s) => s.codec_type === 'audio')?.codec_name).toBe(audioCodec);
  });

  it('removes the audio when asked', () => {
    const output = join(dir, 'no-audio.mp4');
    const settings: ExportSettings = { ...PRESETS.quality.settings, audio: 'none' };
    execFileSync('ffmpeg', buildExportArgs(request(output, { songPath: null, settings })));
    expect(probe(output).streams.map((s) => s.codec_type)).toEqual(['video']);
  });

  it('stays under the target size', () => {
    const output = join(dir, 'sized.mp4');
    const settings: ExportSettings = { ...PRESETS.discord10.settings, resolution: 'p480' };
    execFileSync('ffmpeg', buildExportArgs(request(output, { settings })));
    const bytes = statSync(output).size;
    expect(bytes).toBeLessThan(10_000_000);
  });

  it('caps the output to the remaining song length', () => {
    const output = join(dir, 'capped.mp4');
    const req = request(output, { inPoint: 0, outPoint: 5, songStart: 6 });
    const { duration, capped } = planDuration(req.inPoint, req.outPoint, req.songStart, req.songDuration);
    expect(capped).toBe(true);
    execFileSync('ffmpeg', buildExportArgs(req));

    expect(Math.abs(Number(probe(output).format.duration) - duration)).toBeLessThan(0.1);
    expect(duration).toBe(2);
  });
});
