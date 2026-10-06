# Soundtrack options: volume, fades, waveform start picker

## Goal
When a song is chosen, the Soundtrack card offers volume, fade in, fade out, and a waveform on which the song start is set by dragging.

## State (`src/lib/state.ts`)
- `songVolume` (number, default 1, range 0–2)
- `songFadeIn` (seconds, default 0, range 0–5, step 0.5)
- `songFadeOut` (seconds, default 1, range 0–5, step 0.5) — default keeps today's hardcoded 1 s fade-out
- All three reset to defaults when a song is chosen or removed (same as `songStart`).

## Export (`src/lib/buildCommand.ts`)
- `ExportRequest` gains `songVolume`, `songFadeIn`, `songFadeOut`.
- When a song is used and audio is not `none`, the `-af` chain is, in order:
  1. `volume=<songVolume>` (omitted when 1)
  2. `alimiter=limit=0.97` when `songVolume > 1`
  3. `afade=t=in:st=0:d=<fadeIn>` (omitted when 0)
  4. `afade=t=out:st=<duration-fadeOut>:d=<fadeOut>` (omitted when 0)
- Fade lengths are clamped to the export duration; fade-out start is never negative.
- Replaces the hardcoded 1 s fade-out (which also required duration >= 1).

## Waveform (`src/lib/waveform.ts`, `src/ui/waveform.ts`)
- Pure helpers (unit tested): bucket PCM samples into ~600 peaks; convert song start (s) <-> window x position; clamp the window so it stays inside the song (start <= songDuration - windowLength, or 0 when the song is shorter than the clip).
- UI: canvas showing the whole song's peaks; a highlighted window whose width is the clip length (out - in) as a fraction of the song duration. Dragging the window horizontally updates `songStart`. The "Start at" text field and the window stay in sync both ways. Window redraws when in/out points change.
- Peaks come from `fetch(fileUrl(path))` + `AudioContext.decodeAudioData` in the webview. On decode failure the canvas shows a flat bar; the window stays draggable.
- Peaks are computed once per chosen song; a stale decode (song changed meanwhile) is discarded.

## Controls (`index.html`, `src/main.ts`)
- Volume slider 0–200% (step 5%), fade-in and fade-out sliders 0–5 s (step 0.5), each with a readout. All disabled when no song. A hint shows next to volume above 100%: preview is capped at 100%, export applies the full value.

## Preview (`src/ui/player.ts`)
- `setSongVolume`, `setSongFades`. Gain = `min(volume, 1)` times a fade factor computed from the position in the clip, applied to `audio.volume` in the existing animation loop.
- Web Audio gain is deliberately not used: asset-protocol media elements risk silent output through `createMediaElementSource`.

## Testing
- `buildCommand.test.ts`: filter chain for volume, limiter, fade in/out, clamping, omission of no-op filters, no `-af` without a song.
- `waveform.test.ts`: peak bucketing, position math, clamping incl. song shorter than clip.
