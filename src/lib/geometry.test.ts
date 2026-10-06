import { describe, expect, it } from 'vitest';
import { centeredCropX, clampCropX, cropWidth, frameRect } from './geometry';

describe('cropWidth', () => {
  it('is 9/16 of the height, rounded down to even', () => {
    expect(cropWidth(1080)).toBe(606);
    expect(cropWidth(2160)).toBe(1214);
    expect(cropWidth(720)).toBe(404);
  });
});

describe('clampCropX', () => {
  it('rounds down to an even number', () => {
    expect(clampCropX(100.9, 1920, 1080)).toBe(100);
    expect(clampCropX(101, 1920, 1080)).toBe(100);
  });
  it('clamps to the left edge', () => {
    expect(clampCropX(-5, 1920, 1080)).toBe(0);
  });
  it('clamps to the right edge (x + cropWidth <= width)', () => {
    const x = clampCropX(5000, 1920, 1080);
    expect(x).toBe(1314);
    expect(x + cropWidth(1080)).toBeLessThanOrEqual(1920);
  });
});

describe('centeredCropX', () => {
  it('centres the window', () => {
    expect(centeredCropX(1920, 1080)).toBe(656);
  });
});

describe('frameRect', () => {
  it('fits a wide frame into a wide container', () => {
    const r = frameRect(800, 450, 1920, 1080);
    expect(r.left).toBeCloseTo(0);
    expect(r.top).toBeCloseTo(0);
    expect(r.width).toBeCloseTo(800);
    expect(r.height).toBeCloseTo(450);
    expect(r.scale).toBeCloseTo(800 / 1920);
  });
  it('letterboxes vertically in a taller container', () => {
    const r = frameRect(800, 600, 1920, 1080);
    expect(r.top).toBeCloseTo(75);
    expect(r.height).toBeCloseTo(450);
  });
});
