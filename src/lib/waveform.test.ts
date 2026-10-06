import { describe, expect, it } from 'vitest';
import { clampSongStart, computePeaks, windowFractions } from './waveform';

describe('computePeaks', () => {
  it('takes the max absolute sample per bucket, normalised to 1', () => {
    const peaks = computePeaks([new Float32Array([0, 0.25, -0.5, 0.1])], 2);
    expect(peaks).toEqual([0.5, 1]);
  });
  it('merges channels', () => {
    const peaks = computePeaks([new Float32Array([0.2, 0.2]), new Float32Array([0.4, 0])], 2);
    expect(peaks[0]).toBeCloseTo(1);
    expect(peaks[1]).toBeCloseTo(0.5);
  });
  it('returns zeros for silence', () => {
    expect(computePeaks([new Float32Array(4)], 2)).toEqual([0, 0]);
  });
});

describe('clampSongStart', () => {
  it('keeps the window inside the song', () => {
    expect(clampSongStart(8, 5, 10)).toBe(5);
    expect(clampSongStart(-1, 5, 10)).toBe(0);
    expect(clampSongStart(2, 5, 10)).toBe(2);
  });
  it('is 0 when the song is shorter than the window', () => {
    expect(clampSongStart(3, 12, 10)).toBe(0);
  });
});

describe('windowFractions', () => {
  it('gives left and width as fractions of the song', () => {
    const { left, width } = windowFractions(2, 5, 10);
    expect(left).toBeCloseTo(0.2);
    expect(width).toBeCloseTo(0.5);
  });
  it('caps the width at the song end', () => {
    const { left, width } = windowFractions(8, 5, 10);
    expect(left).toBeCloseTo(0.8);
    expect(width).toBeCloseTo(0.2);
    expect(windowFractions(0, 12, 10)).toEqual({ left: 0, width: 1 });
  });
  it('is empty without a song', () => {
    expect(windowFractions(0, 5, 0)).toEqual({ left: 0, width: 0 });
  });
});
