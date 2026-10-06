import { describe, expect, it } from 'vitest';
import { fadeGain, songFilters } from './songMix';

describe('songFilters', () => {
  it('is empty for volume 1 and no fades', () => {
    expect(songFilters(1, 0, 0, 10)).toEqual([]);
  });
  it('adds volume and a limiter above 100%', () => {
    expect(songFilters(1.5, 0, 0, 10)).toEqual(['volume=1.5', 'alimiter=limit=0.97']);
  });
  it('adds volume without limiter below 100%', () => {
    expect(songFilters(0.5, 0, 0, 10)).toEqual(['volume=0.5']);
  });
  it('orders volume, fade in, fade out', () => {
    expect(songFilters(0.8, 2, 1.5, 10)).toEqual([
      'volume=0.8',
      'afade=t=in:st=0:d=2.000',
      'afade=t=out:st=8.500:d=1.500',
    ]);
  });
  it('clamps fades to the duration', () => {
    expect(songFilters(1, 5, 5, 3)).toEqual(['afade=t=in:st=0:d=3.000', 'afade=t=out:st=0.000:d=3.000']);
  });
});

describe('fadeGain', () => {
  it('is 1 with no fades', () => expect(fadeGain(5, 10, 0, 0)).toBe(1));
  it('ramps in', () => expect(fadeGain(1, 10, 2, 0)).toBeCloseTo(0.5));
  it('ramps out', () => expect(fadeGain(9, 10, 0, 2)).toBeCloseTo(0.5));
  it('is 0 at the very start with a fade in', () => expect(fadeGain(0, 10, 2, 0)).toBe(0));
  it('is 0 outside the range', () => {
    expect(fadeGain(-1, 10, 2, 2)).toBe(0);
    expect(fadeGain(11, 10, 2, 2)).toBe(0);
  });
});
