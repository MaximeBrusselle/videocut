# Soundtrack Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soundtrack card gets volume (0–200%), fade in/out, and a waveform on which a clip-length window is dragged to set the song start.

**Architecture:** Pure logic (`songMix.ts`, `waveform.ts`) is unit tested. `buildCommand.ts` uses `songFilters` for the `-af` chain. `Waveform` (UI) decodes peaks in the webview and reports drags through `onStart`; `Player` applies fades/volume to the preview `<audio>` per animation frame.

**Tech Stack:** TypeScript, Vite, Tauri 2, vitest, daisyUI/Tailwind.

Spec: `docs/superpowers/specs/2026-10-06-soundtrack-options-design.md`. Run tests with `npm test`, typecheck with `npx tsc --noEmit`.

---

### Task 1: Song mix logic (`src/lib/songMix.ts`)

**Files:** Create `src/lib/songMix.ts`, `src/lib/songMix.test.ts`

- [ ] **Step 1: Failing tests** (`songMix.test.ts`)

```ts
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
  it('stays within 0..1 outside the range', () => {
    expect(fadeGain(-1, 10, 2, 2)).toBe(0);
    expect(fadeGain(11, 10, 2, 2)).toBe(0);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/songMix.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** (`songMix.ts`)

```ts
import { formatSeconds } from './time';

export const DEFAULT_SONG_VOLUME = 1;
export const DEFAULT_SONG_FADE_IN = 0;
export const DEFAULT_SONG_FADE_OUT = 1;

/** ffmpeg audio filters for the song: volume (+ limiter when boosting), then fade in and fade out. */
export function songFilters(volume: number, fadeIn: number, fadeOut: number, duration: number): string[] {
  const filters: string[] = [];
  const level = Number(volume.toFixed(2));
  if (level !== 1) filters.push(`volume=${level}`);
  if (level > 1) filters.push('alimiter=limit=0.97');
  const inLength = Math.min(Math.max(fadeIn, 0), duration);
  const outLength = Math.min(Math.max(fadeOut, 0), duration);
  if (inLength > 0) filters.push(`afade=t=in:st=0:d=${formatSeconds(inLength)}`);
  if (outLength > 0) {
    filters.push(`afade=t=out:st=${formatSeconds(duration - outLength)}:d=${formatSeconds(outLength)}`);
  }
  return filters;
}

/** Linear fade multiplier (0..1) at `time` seconds into a `duration`-second export. */
export function fadeGain(time: number, duration: number, fadeIn: number, fadeOut: number): number {
  if (time < 0 || time > duration) return 0;
  let gain = 1;
  if (fadeIn > 0) gain = Math.min(gain, time / fadeIn);
  if (fadeOut > 0) gain = Math.min(gain, (duration - time) / fadeOut);
  return Math.min(Math.max(gain, 0), 1);
}
```

- [ ] **Step 4:** run the test → PASS.
- [ ] **Step 5:** `git add src/lib/songMix*.ts && git commit -m "feat: song volume and fade filter logic"`

---

### Task 2: Use song mix in the export command

**Files:** Modify `src/lib/buildCommand.ts`, `src/lib/buildCommand.test.ts`, `tests/smoke.test.ts`

- [ ] **Step 1:** In `buildCommand.test.ts`: add `songVolume: 1, songFadeIn: 0, songFadeOut: 1,` to `base`; change the expectations `d=1` → `d=1.000` (lines ~62 and ~181); append tests:

```ts
describe('song mix', () => {
  it('applies volume, limiter and both fades', () => {
    const args = buildExportArgs({ ...base, songVolume: 1.5, songFadeIn: 0.5, songFadeOut: 2 });
    expect(args[args.indexOf('-af') + 1]).toBe(
      'volume=1.5,alimiter=limit=0.97,afade=t=in:st=0:d=0.500,afade=t=out:st=1.000:d=2.000',
    );
  });
  it('omits -af when nothing is set', () => {
    const args = buildExportArgs({ ...base, songFadeOut: 0 });
    expect(args).not.toContain('-af');
  });
  it('ignores the mix without a song', () => {
    const args = buildExportArgs({ ...base, songPath: null, songVolume: 0.5, settings: { ...base.settings, audio: 'keep' } });
    expect(args).not.toContain('-af');
  });
});
```

- [ ] **Step 2:** `npm test` → type/assert failures.
- [ ] **Step 3:** In `buildCommand.ts`: add `songVolume: number; songFadeIn: number; songFadeOut: number;` to `ExportRequest` (after `songStart`), import `songFilters` from `./songMix`, and replace the `-af` block with:

```ts
  if (song !== null && audio.mode !== 'none') {
    const filters = songFilters(req.songVolume, req.songFadeIn, req.songFadeOut, duration);
    if (filters.length > 0) args.push('-af', filters.join(','));
  }
```
Add the same three fields to the `request()` helper in `tests/smoke.test.ts` (`songVolume: 1, songFadeIn: 0, songFadeOut: 1`) and fix any `afade` expectation there to `d=1.000`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** commit `feat: export applies song volume and fades`.

---

### Task 3: Waveform math (`src/lib/waveform.ts`)

**Files:** Create `src/lib/waveform.ts`, `src/lib/waveform.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { clampSongStart, computePeaks, windowFractions } from './waveform';

describe('computePeaks', () => {
  it('takes the max absolute sample per bucket, normalised to 1', () => {
    const peaks = computePeaks([new Float32Array([0, 0.25, -0.5, 0.1])], 2);
    expect(peaks).toEqual([0.5, 1]);
  });
  it('merges channels', () => {
    const peaks = computePeaks([new Float32Array([0.2, 0.2]), new Float32Array([0.4, 0])], 2);
    expect(peaks).toEqual([1, 0.5]);
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
    expect(windowFractions(2, 5, 10)).toEqual({ left: 0.2, width: 0.5 });
  });
  it('caps the width at the song end', () => {
    expect(windowFractions(8, 5, 10)).toEqual({ left: 0.8, width: 0.2 });
    expect(windowFractions(0, 12, 10)).toEqual({ left: 0, width: 1 });
  });
  it('is empty without a song', () => {
    expect(windowFractions(0, 5, 0)).toEqual({ left: 0, width: 0 });
  });
});
```

- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**

```ts
/** Per-bucket peak (max absolute sample over all channels), scaled so the loudest bucket is 1. */
export function computePeaks(channels: Float32Array[], buckets: number): number[] {
  const length = channels[0]?.length ?? 0;
  const peaks = new Array<number>(buckets).fill(0);
  if (length === 0) return peaks;
  for (const data of channels) {
    for (let b = 0; b < buckets; b++) {
      const from = Math.floor((b * length) / buckets);
      const to = Math.max(Math.floor(((b + 1) * length) / buckets), from + 1);
      let max = peaks[b];
      for (let i = from; i < to && i < length; i++) max = Math.max(max, Math.abs(data[i]));
      peaks[b] = max;
    }
  }
  const loudest = Math.max(...peaks);
  return loudest > 0 ? peaks.map((p) => p / loudest) : peaks;
}

/** Latest start that keeps a `windowLength` window inside the song (0 when the song is shorter). */
export function clampSongStart(start: number, windowLength: number, songDuration: number): number {
  return Math.min(Math.max(start, 0), Math.max(songDuration - windowLength, 0));
}

/** Position of the start window as fractions of the song, with its width capped at the song end. */
export function windowFractions(
  songStart: number,
  windowLength: number,
  songDuration: number,
): { left: number; width: number } {
  if (songDuration <= 0) return { left: 0, width: 0 };
  const left = Math.min(Math.max(songStart / songDuration, 0), 1);
  return { left, width: Math.min(windowLength / songDuration, 1 - left) };
}
```

- [ ] **Step 4:** run → PASS (the `0.2/0.5` and `0.8/0.2` results are exact in floating point; if `toEqual` fails by rounding, switch those assertions to `toBeCloseTo`).
- [ ] **Step 5:** commit `feat: waveform peak and window math`.

---

### Task 4: State and HTML controls

**Files:** Modify `src/lib/state.ts`, `index.html`, `src/styles.css`

- [ ] **Step 1:** `state.ts`: add `songVolume: number; songFadeIn: number; songFadeOut: number;` to `AppState` (after `songStart`) and defaults `DEFAULT_SONG_VOLUME`, `DEFAULT_SONG_FADE_IN`, `DEFAULT_SONG_FADE_OUT` (imported from `./songMix`) to the store.
- [ ] **Step 2:** `index.html`: in the Soundtrack card, directly after `#song-name`, insert

```html
          <div id="wave" class="wave" hidden>
            <canvas id="wave-canvas"></canvas>
            <div id="wave-window"></div>
          </div>
```
and after the "Start at / Preview" row (before `#song-warning`) insert

```html
          <div class="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-x-3 gap-y-2 text-sm">
            <span>Volume</span>
            <input id="song-volume" class="range range-primary range-xs" type="range" min="0" max="200" step="5" value="100" />
            <span id="song-volume-readout" class="chip text-center">100%</span>
            <span>Fade in</span>
            <input id="song-fade-in" class="range range-primary range-xs" type="range" min="0" max="5" step="0.5" value="0" />
            <span id="song-fade-in-readout" class="chip text-center">0.0 s</span>
            <span>Fade out</span>
            <input id="song-fade-out" class="range range-primary range-xs" type="range" min="0" max="5" step="0.5" value="1" />
            <span id="song-fade-out-readout" class="chip text-center">1.0 s</span>
          </div>
          <p id="volume-hint" class="muted m-0 text-xs" hidden>Preview plays at most 100%; the export uses the full volume.</p>
```
- [ ] **Step 3:** `styles.css`, append:

```css
/* Song waveform with a draggable clip-length window */
.wave { position: relative; height: 64px; background: var(--color-base-100); border: 1px solid color-mix(in oklab, white 7%, transparent); border-radius: var(--radius-field); overflow: hidden; touch-action: none; cursor: ew-resize; }
#wave-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#wave-window { position: absolute; top: 0; bottom: 0; background: color-mix(in oklab, var(--color-primary) 28%, transparent); border-left: 2px solid var(--color-primary); border-right: 2px solid var(--color-primary); pointer-events: none; }
.wave, #wave-canvas { -webkit-user-drag: none; user-select: none; }
```
- [ ] **Step 4:** `npx tsc --noEmit` → errors only in `main.ts` (missing request fields) until Task 6. Commit with Task 6.

---

### Task 5: Waveform UI and preview gain

**Files:** Create `src/ui/waveform.ts`; modify `src/ui/player.ts`

- [ ] **Step 1:** `src/ui/waveform.ts`:

```ts
import { fileUrl } from '../lib/backend';
import { $ } from '../lib/dom';
import { clampSongStart, computePeaks, windowFractions } from '../lib/waveform';

const BUCKETS = 600;

/** Waveform of the song with a clip-length window; dragging the window sets the song start. */
export class Waveform {
  private wrap = $('wave');
  private canvas = $<HTMLCanvasElement>('wave-canvas');
  private win = $('wave-window');
  private peaks: number[] | null = null;
  private loadId = 0;
  private songDuration = 0;
  private windowLength = 0;
  private songStart = 0;
  private grab = 0;

  /** Called with the new song start (seconds) while dragging. */
  onStart: (seconds: number) => void = () => {};

  constructor() {
    new ResizeObserver(() => this.draw()).observe(this.wrap);
    this.wrap.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.wrap.setPointerCapture(event.pointerId);
      const pointer = this.timeAt(event.clientX);
      const inside = pointer >= this.songStart && pointer <= this.songStart + this.windowLength;
      this.grab = inside ? pointer - this.songStart : this.windowLength / 2;
      this.drag(event.clientX);
    });
    this.wrap.addEventListener('pointermove', (event) => {
      if (this.wrap.hasPointerCapture(event.pointerId)) this.drag(event.clientX);
    });
  }

  private timeAt(clientX: number): number {
    const box = this.wrap.getBoundingClientRect();
    const fraction = Math.min(Math.max((clientX - box.left) / box.width, 0), 1);
    return fraction * this.songDuration;
  }

  private drag(clientX: number): void {
    this.onStart(clampSongStart(this.timeAt(clientX) - this.grab, this.windowLength, this.songDuration));
  }

  /** Decodes the new song's peaks; a flat bar is shown when the webview cannot decode it. */
  async setSong(path: string | null): Promise<void> {
    const id = ++this.loadId;
    this.peaks = null;
    this.draw();
    if (path === null) return;
    try {
      const response = await fetch(fileUrl(path));
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(await response.arrayBuffer());
      void context.close();
      if (id !== this.loadId) return;
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
      this.peaks = computePeaks(channels, BUCKETS);
    } catch {
      return; // keep the flat bar
    }
    this.draw();
  }

  update(songDuration: number, songStart: number, windowLength: number): void {
    this.wrap.hidden = songDuration <= 0;
    this.songDuration = songDuration;
    this.songStart = songStart;
    this.windowLength = windowLength;
    const { left, width } = windowFractions(songStart, windowLength, songDuration);
    this.win.style.left = `${left * 100}%`;
    this.win.style.width = `${width * 100}%`;
    this.draw();
  }

  private draw(): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(this.canvas.clientWidth * ratio);
    const height = Math.round(this.canvas.clientHeight * ratio);
    if (width === 0 || height === 0) return;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, width, height);
    g.fillStyle = 'rgba(255, 255, 255, 0.45)';
    const mid = height / 2;
    if (this.peaks === null) {
      g.fillRect(0, mid - 1, width, 2);
      return;
    }
    const barWidth = width / this.peaks.length;
    this.peaks.forEach((peak, i) => {
      const h = Math.max(peak * (height - 6), 2);
      g.fillRect(i * barWidth, mid - h / 2, Math.max(barWidth - 1, 1), h);
    });
  }
}
```
(`draw()` runs on every `update`, which `render` calls on each frame during playback; it is cheap for 600 bars, but guard it: only redraw when `peaks`/size changed — in `update`, call `this.draw()` only if the canvas size differs. Simplest: remove the `this.draw()` call from `update`, since `setSong` and the ResizeObserver already cover every change that affects the canvas.)

- [ ] **Step 2:** `player.ts`: import `fadeGain`; add fields `songVolume = 1`, `songFadeIn = 0`, `songFadeOut = 0`, `songLength = 0`; add

```ts
  setSongMix(volume: number, fadeIn: number, fadeOut: number, length: number): void {
    this.songVolume = volume;
    this.songFadeIn = fadeIn;
    this.songFadeOut = fadeOut;
    this.songLength = length;
    this.applyGain();
  }

  /** Preview gain: volume (capped at 100% — <audio> cannot boost) times the fade at the current position. */
  private applyGain(): void {
    const t = this.video.currentTime - this.inPoint;
    const fade = fadeGain(t, this.songLength, this.songFadeIn, this.songFadeOut);
    this.audio.volume = Math.min(this.songVolume, 1) * fade;
  }
```
Call `this.applyGain()` at the top of `loop` (after `this.emit()`) and in `syncAudio` before `play()`. In `setSongMix` skip nothing; `render` calls it every frame, which is only a few assignments.
- [ ] **Step 3:** `npx tsc --noEmit` (still only `main.ts` errors).

---

### Task 6: Wire everything in `main.ts`

**Files:** Modify `src/main.ts`

- [ ] **Step 1:** Imports: `Waveform` from `./ui/waveform`, defaults from `./lib/songMix`. Add `const waveform = new Waveform();` and element lookups for `song-volume`, `song-fade-in`, `song-fade-out` and their `-readout` spans.
- [ ] **Step 2:** In `render`, replace `player.setSongStart(s.songStart);` with

```ts
  player.setSongStart(s.songStart);
  const mixLength = planDuration(s.inPoint, s.outPoint, s.songStart, s.songDuration).duration;
  player.setSongMix(s.songVolume, s.songFadeIn, s.songFadeOut, Math.max(mixLength, 0));
  waveform.update(s.songDuration, s.songStart, s.outPoint - s.inPoint);
  if (document.activeElement !== songStartInput) songStartInput.value = formatMmSs(s.songStart);

  volumeInput.value = String(Math.round(s.songVolume * 100));
  fadeInInput.value = String(s.songFadeIn);
  fadeOutInput.value = String(s.songFadeOut);
  $('song-volume-readout').textContent = `${Math.round(s.songVolume * 100)}%`;
  $('song-fade-in-readout').textContent = `${s.songFadeIn.toFixed(1)} s`;
  $('song-fade-out-readout').textContent = `${s.songFadeOut.toFixed(1)} s`;
  $('volume-hint').hidden = !s.songPath || s.songVolume <= 1;
  for (const input of [volumeInput, fadeInInput, fadeOutInput]) input.disabled = !s.songPath;
```
- [ ] **Step 3:** `chooseSong`: store reset becomes `store.set({ songPath: picked, songDuration: info.duration, songStart: 0, ...DEFAULT_MIX })` with `const DEFAULT_MIX = { songVolume: DEFAULT_SONG_VOLUME, songFadeIn: DEFAULT_SONG_FADE_IN, songFadeOut: DEFAULT_SONG_FADE_OUT };` defined at top; after `player.setSong(picked)` add `void waveform.setSong(picked);`. `clearSong`: add `...DEFAULT_MIX` to the store reset and `void waveform.setSong(null);`. The manual `songStartInput.value = '0:00'` lines can stay.
- [ ] **Step 4:** `runExport` request: add `songVolume: s.songVolume, songFadeIn: s.songFadeIn, songFadeOut: s.songFadeOut,`.
- [ ] **Step 5:** Controls:

```ts
waveform.onStart = (songStart) => store.set({ songStart });
volumeInput.addEventListener('input', () => store.set({ songVolume: Number(volumeInput.value) / 100 }));
fadeInInput.addEventListener('input', () => store.set({ songFadeIn: Number(fadeInInput.value) }));
fadeOutInput.addEventListener('input', () => store.set({ songFadeOut: Number(fadeOutInput.value) }));
```
- [ ] **Step 6:** `npx tsc --noEmit && npm test` → both pass.
- [ ] **Step 7:** commit `feat: soundtrack volume, fades and waveform start picker` (include Tasks 4–6 files).

---

### Task 7: Verify

- [ ] `npm run build` succeeds.
- [ ] Manual check in the app (`npm run tauri dev`): choose a song → waveform appears with the window; drag the window → "Start at" updates; type a start → window moves; move volume/fades; export and confirm audio (needs ffmpeg and a real clip).
