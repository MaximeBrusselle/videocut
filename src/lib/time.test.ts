import { describe, expect, it } from 'vitest';
import { formatMmSs, formatSeconds, parseMmSs } from './time';

describe('formatSeconds', () => {
  it('uses 3 decimals', () => {
    expect(formatSeconds(1)).toBe('1.000');
    expect(formatSeconds(2.34567)).toBe('2.346');
  });
  it('never goes negative', () => {
    expect(formatSeconds(-0.5)).toBe('0.000');
  });
});

describe('formatMmSs', () => {
  it('formats whole seconds', () => {
    expect(formatMmSs(0)).toBe('0:00');
    expect(formatMmSs(65)).toBe('1:05');
  });
  it('formats decimals', () => {
    expect(formatMmSs(65.46, 1)).toBe('1:05.5');
  });
  it('carries rounding into the minute', () => {
    expect(formatMmSs(59.96)).toBe('1:00');
  });
});

describe('parseMmSs', () => {
  it('parses plain seconds', () => {
    expect(parseMmSs('65')).toBe(65);
  });
  it('parses m:ss', () => {
    expect(parseMmSs('1:05')).toBe(65);
  });
  it('parses decimals and trims whitespace', () => {
    expect(parseMmSs(' 1:05.5 ')).toBe(65.5);
  });
  it('rejects garbage', () => {
    expect(parseMmSs('abc')).toBeNull();
    expect(parseMmSs('')).toBeNull();
    expect(parseMmSs('1:')).toBeNull();
  });
});
