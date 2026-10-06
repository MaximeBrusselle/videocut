# Videocut — Design

Date: 2026-10-06

## Purpose

A small local Windows desktop app to turn **one** landscape (16:9) clip into a **TikTok-ready 9:16** video:

1. Cut the part of the clip to keep (in/out points).
2. Crop 16:9 to 9:16 with a user-chosen horizontal position.
3. Replace the audio with a section of a song.

Quality must stay visually identical to the source without exploding file size. Output is uploaded to TikTok, which re-encodes anyway, so visually lossless is the target, not mathematically lossless.

## Decisions

| Topic | Decision |
|---|---|
| App shell | Tauri 2 (Rust backend, WebView2 front end) |
| Front end | Plain HTML + TypeScript + Vite, no framework (single screen) |
| Media engine | FFmpeg / ffprobe from `PATH` (installed: ffmpeg 7.1.1). GStreamer rejected: harder Windows setup, weaker encoder/filter control |
| Crop mode | Draggable 9:16 window, output upscaled to 1080×1920 (Lanczos) |
| Audio | Replace original audio with the song; user picks song start offset |
| Encode | H.264 (`libx264`), CRF 15, preset slow, yuv420p, AAC 256 kbps, `+faststart` |
| Input | One clip at a time |

## Out of scope

Multiple clips, text/captions, filters, other aspect ratios, a settings screen, GPU encoding, installers, auto-update. Run via `tauri dev` or build a local `.exe` once.

## UI (one screen, top to bottom)

1. **Open video** (button or drag-drop). `ffprobe` returns width, height, fps, duration, color tags, codec.
2. **Preview player** with a 9:16 crop window overlaid on the 16:9 frame. The window width is `displayedHeight * 9/16`; the user drags it horizontally. The window is clamped to the frame.
3. **Timeline** with in/out handles. The in/out range defines the cut and the output duration.
4. **Song picker**, a start-offset field (`mm:ss`) inside the song, and a "preview with song" toggle (the preview video is muted and an `<audio>` element starts at the offset, synced to the playhead). If the webview cannot decode the song, preview plays without it and shows a note; export is unaffected.
5. **Export** button, progress bar, Cancel button, output path (default `<name>_tiktok.mp4` next to the source).

### Preview and proxy

The preview plays the original file. If the `<video>` element fires an error or reports the codec as unsupported (e.g. HEVC), the backend creates a 540p-high H.264 video-only proxy (CRF 28, ultrafast) in a temp directory, used for scrubbing only. It is deleted when a new clip is opened or the app closes. **Export always reads the original.**

## Architecture

```
videocut/
  package.json, vite.config.ts, index.html
  src/
    main.ts                 wires UI to state
    state.ts                in, out, cropX, songPath, songStart, source info
    ui/{player,timeline,cropOverlay}.ts
    lib/buildCommand.ts     pure: state -> ffmpeg args (unit tested)
  src-tauri/
    src/main.rs             Tauri commands: probe, export, cancel, make_proxy
    src/ffmpeg.rs           spawn, progress parsing, kill
```

- `buildCommand.ts` is pure and contains all crop/time math, so it is testable without ffmpeg.
- Rust only spawns processes and streams events; no media logic lives there beyond argument passing and progress parsing.
- Front end and Rust communicate through Tauri commands plus a `progress` event.

## Export pipeline

One ffmpeg invocation:

```
ffmpeg -y -ss {in} -i clip.mp4 -ss {songStart} -i song.ext
  -map 0:v:0 -map 1:a:0
  -vf "crop={cw}:{ih}:{x}:0,scale=1080:1920:flags=lanczos,setsar=1"
  -c:v libx264 -crf 15 -preset slow -pix_fmt yuv420p
  [-colorspace/-color_primaries/-color_trc copied from probe when present]
  -c:a aac -b:a 256k -af "afade=t=out:st={dur-1}:d=1"
  -t {dur} -movflags +faststart out.mp4
```

Rules:

- `dur = out - in`, and `-ss` placed before `-i` with re-encoding is frame-accurate.
- **Crop width** `cw = floor(ih * 9/16 / 2) * 2` (even). **Crop x** is the dragged position converted from preview pixels to source pixels, rounded down to an even number and clamped to `[0, iw - cw]`. For a 1080p source `cw` is 606.
- Always scale to 1080×1920, whatever the source resolution (4K downscales, 720p upscales).
- Frame rate is not forced; the source fps is kept.
- **Song shorter than the clip** (`songDuration - songStart < dur`): the UI warns and caps `dur` to the available song length. The song duration is read with `ffprobe`.
- **Fade-out:** a 1 second audio fade-out at the end. This is an addition beyond the request; remove the `-af` argument to drop it. For `dur < 1` the fade is skipped.
- A source that is not wider than 9:16 (`iw <= cw`) is rejected with an error message.

### Progress and cancel

ffmpeg runs with `-progress pipe:1 -nostats`. The Rust side parses `out_time_us`, computes percent against `dur`, and emits `progress`. Cancel kills the process and deletes the partial output file.

### Error handling (shown in the UI)

- `ffmpeg`/`ffprobe` not found on `PATH`.
- Input unreadable or no video stream.
- Song unreadable or no audio stream.
- Output file exists: overwrite prompt before export.
- ffmpeg exits non-zero: show the last 10 lines of stderr.

## Testing

- **Unit tests** (Vitest) for `buildCommand.ts`: crop width and x math, even rounding, clamping, time formatting, song-too-short capping, fade skip for short clips, argument list for a typical case.
- **Smoke test** (script): generate a 5 second 1920×1080 test clip and a 5 second sine tone with ffmpeg, run the exported command, then verify with `ffprobe`: 1080×1920, `h264`, `yuv420p`, duration within 0.1 s of expected, audio stream present and from the song.
- Manual check of the preview, crop dragging and cancel in the running app.

## Prerequisites

Rust (via rustup) and Visual Studio C++ Build Tools must be installed before the first build. WebView2 ships with Windows 11. Node 24 and ffmpeg are already present.
