import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildExportArgs, planDuration, type ExportRequest } from '../src/lib/buildCommand';

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

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'videocut-'));
    clip = join(dir, 'clip.mp4');
    song = join(dir, 'song.wav');
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30',
      '-t', '5', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clip,
    ]);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', song,
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
      cropX: 100,
      cropEnabled: true,
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

  it('keeps the source resolution when cropping is off', () => {
    const output = join(dir, 'nocrop.mp4');
    execFileSync('ffmpeg', buildExportArgs(request(output, { cropEnabled: false })));

    const video = probe(output).streams.find((s) => s.codec_type === 'video');
    expect(video?.width).toBe(1920);
    expect(video?.height).toBe(1080);
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
