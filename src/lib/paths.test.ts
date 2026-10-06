import { describe, expect, it } from 'vitest';
import { defaultOutputPath, fileName, samePath } from './paths';

describe('defaultOutputPath', () => {
  it('swaps the extension and adds _tiktok', () => {
    expect(defaultOutputPath('C:\\clips\\holiday.MOV')).toBe('C:\\clips\\holiday_tiktok.mp4');
  });
  it('handles names without an extension', () => {
    expect(defaultOutputPath('C:\\clips\\holiday')).toBe('C:\\clips\\holiday_tiktok.mp4');
  });
  it('does not strip dots from folder names', () => {
    expect(defaultOutputPath('C:\\my.clips\\holiday')).toBe('C:\\my.clips\\holiday_tiktok.mp4');
  });
});

describe('fileName', () => {
  it('returns the last path segment', () => {
    expect(fileName('C:\\clips\\a.mp4')).toBe('a.mp4');
    expect(fileName('/home/u/a.mp4')).toBe('a.mp4');
  });
});

describe('samePath', () => {
  it('ignores case and slash direction', () => {
    expect(samePath('C:\\Clips\\A.mp4', 'c:/clips/a.mp4')).toBe(true);
    expect(samePath('C:\\clips\\a.mp4', 'C:\\clips\\b.mp4')).toBe(false);
  });
});
