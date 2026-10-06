import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  buildExportArgs,
  exportDuration,
  planDuration,
  validateRequest,
  type ExportRequest,
} from './lib/buildCommand';
import { cancelExport, exportVideo, onProgress, probeMedia } from './lib/backend';
import { $ } from './lib/dom';
import { centeredCropX } from './lib/geometry';
import { defaultOutputPath, fileName } from './lib/paths';
import {
  AUDIO_OPTIONS,
  CODECS,
  CRF_QUALITIES,
  PRESETS,
  RESOLUTIONS,
  SIZE_QUALITIES,
  containerOf,
  isAudioId,
  isCodecId,
  isPresetId,
  isQualityId,
  isResolutionId,
  matchPreset,
  type ExportSettings,
} from './lib/presets';
import { DEFAULT_SONG_FADE_IN, DEFAULT_SONG_FADE_OUT, DEFAULT_SONG_VOLUME } from './lib/songMix';
import { store, type AppState } from './lib/state';
import { formatMmSs, parseMmSs } from './lib/time';
import { CropOverlay } from './ui/cropOverlay';
import { Player } from './ui/player';
import { Timeline } from './ui/timeline';
import { Waveform } from './ui/waveform';

const MIN_CLIP_SECONDS = 0.1;
const DEFAULT_MIX = {
  songVolume: DEFAULT_SONG_VOLUME,
  songFadeIn: DEFAULT_SONG_FADE_IN,
  songFadeOut: DEFAULT_SONG_FADE_OUT,
};

const player = new Player();
const crop = new CropOverlay();
const timeline = new Timeline();
const waveform = new Waveform();

const statusEl = $('status');
const progressEl = $<HTMLProgressElement>('progress');
const songStartInput = $<HTMLInputElement>('song-start');
const previewSongInput = $<HTMLInputElement>('preview-song');
const volumeInput = $<HTMLInputElement>('song-volume');
const fadeInInput = $<HTMLInputElement>('song-fade-in');
const fadeOutInput = $<HTMLInputElement>('song-fade-out');

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

// ---- export menus ----------------------------------------------------------

const presetSelect = $<HTMLSelectElement>('preset');
const codecSelect = $<HTMLSelectElement>('codec');
const resolutionSelect = $<HTMLSelectElement>('resolution');
const qualitySelect = $<HTMLSelectElement>('quality');
const audioSelect = $<HTMLSelectElement>('audio-option');
const exportMenus = [presetSelect, codecSelect, resolutionSelect, qualitySelect, audioSelect];

function addOptions(select: HTMLSelectElement | HTMLOptGroupElement, items: Array<[string, string]>): void {
  for (const [value, label] of items) select.append(new Option(label, value));
}

function labelled(record: Record<string, { label: string }>): Array<[string, string]> {
  return Object.entries(record).map<[string, string]>(([id, { label }]) => [id, label]);
}

addOptions(presetSelect, labelled(PRESETS));
presetSelect.append(new Option('Custom', 'custom'));
addOptions(codecSelect, labelled(CODECS));
addOptions(resolutionSelect, labelled(RESOLUTIONS));
addOptions(audioSelect, labelled(AUDIO_OPTIONS));

const constantQuality = document.createElement('optgroup');
constantQuality.label = 'Constant quality';
addOptions(constantQuality, Object.entries(CRF_QUALITIES));
const targetSize = document.createElement('optgroup');
targetSize.label = 'Target file size';
addOptions(targetSize, labelled(SIZE_QUALITIES));
qualitySelect.append(constantQuality, targetSize);

function renderExportMenus(settings: ExportSettings): void {
  presetSelect.value = matchPreset(settings);
  codecSelect.value = settings.codec;
  resolutionSelect.value = settings.resolution;
  qualitySelect.value = settings.quality;
  audioSelect.value = settings.audio;
  $('codec-note').textContent = CODECS[settings.codec].note;
}

function updateSettings(change: Partial<ExportSettings>): void {
  store.set({ settings: { ...store.get().settings, ...change } });
}

presetSelect.addEventListener('change', () => {
  if (isPresetId(presetSelect.value)) store.set({ settings: { ...PRESETS[presetSelect.value].settings } });
});
codecSelect.addEventListener('change', () => {
  if (isCodecId(codecSelect.value)) updateSettings({ codec: codecSelect.value });
});
resolutionSelect.addEventListener('change', () => {
  if (isResolutionId(resolutionSelect.value)) updateSettings({ resolution: resolutionSelect.value });
});
qualitySelect.addEventListener('change', () => {
  if (isQualityId(qualitySelect.value)) updateSettings({ quality: qualitySelect.value });
});
audioSelect.addEventListener('change', () => {
  if (isAudioId(audioSelect.value)) updateSettings({ audio: audioSelect.value });
});

// ---- rendering -------------------------------------------------------------

function render(s: AppState): void {
  const v = s.video;
  $('clip-info').textContent =
    s.clipPath && v
      ? `${fileName(s.clipPath)} — ${v.width}×${v.height} @ ${v.fps.toFixed(2)} fps, ${formatMmSs(s.clipDuration, 1)}`
      : 'Drop a video here or click Open';
  $('song-name').textContent = s.songPath
    ? `${fileName(s.songPath)} (${formatMmSs(s.songDuration)})`
    : 'No song — the clip keeps its own audio';
  $('time-readout').textContent = formatMmSs(s.playhead, 1);
  $('in-readout').textContent = formatMmSs(s.inPoint, 2);
  $('out-readout').textContent = formatMmSs(s.outPoint, 2);
  $('len-readout').textContent = s.clipPath ? `Length ${formatMmSs(s.outPoint - s.inPoint, 2)}` : '';

  crop.update(v, s.cropX, s.cropEnabled);
  timeline.update(s.clipDuration, s.inPoint, s.outPoint, s.playhead);
  player.setRange(s.inPoint, s.outPoint);
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

  const warning = $('song-warning');
  if (s.clipPath && s.songPath) {
    const plan = planDuration(s.inPoint, s.outPoint, s.songStart, s.songDuration);
    warning.hidden = !plan.capped;
    warning.textContent = `The song ends before the clip does — the export will be trimmed to ${formatMmSs(Math.max(plan.duration, 0), 2)}.`;
  } else {
    warning.hidden = true;
  }

  $('clear-song').hidden = !s.songPath;
  songStartInput.disabled = !s.songPath;
  previewSongInput.disabled = !s.songPath;

  $<HTMLButtonElement>('export').disabled = !s.clipPath || s.busy;
  renderExportMenus(s.settings);
  for (const menu of exportMenus) menu.disabled = s.busy;
  $('cancel').hidden = !s.busy;
  progressEl.hidden = !s.busy;
}

store.subscribe(render);
player.onTime((t) => store.set({ playhead: t }));
player.onSongError = () =>
  setStatus('This song cannot be previewed here, but it will still be used in the export.');

// ---- opening files ---------------------------------------------------------

let openCounter = 0;

async function openClip(path: string): Promise<void> {
  if (store.get().busy) return;
  const id = ++openCounter;
  setStatus('Reading video…');
  try {
    const info = await probeMedia(path);
    if (id !== openCounter) return;
    if (!info.video) throw new Error('No video stream found in that file.');
    const v = info.video;
    store.set({
      clipPath: path,
      clipDuration: info.duration,
      video: v,
      clipAudioCodec: info.audioCodec,
      inPoint: 0,
      outPoint: info.duration,
      cropX: centeredCropX(v.width, v.height),
      playhead: 0,
    });
    await player.load(path, (text) => {
      if (id === openCounter) setStatus(text);
    });
    if (id !== openCounter) return;
    player.seek(0);
    if (statusEl.textContent === 'Reading video…') setStatus('');
    if (v.colorTransfer === 'arib-std-b67' || v.colorTransfer === 'smpte2084') {
      setStatus(
        'HDR footage detected: the export is 8-bit SDR, so colours may look flatter than the original.',
      );
    }
  } catch (error) {
    if (id === openCounter) setStatus(errorText(error), true);
  }
}

async function chooseClip(): Promise<void> {
  if (store.get().busy) return;
  const picked = await open({
    multiple: false,
    filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'] }],
  });
  if (typeof picked === 'string') await openClip(picked);
}

async function chooseSong(): Promise<void> {
  if (store.get().busy) return;
  const picked = await open({
    multiple: false,
    filters: [{ name: 'Audio', extensions: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'] }],
  });
  if (typeof picked !== 'string') return;
  try {
    const info = await probeMedia(picked);
    if (!info.hasAudio) {
      setStatus('That file has no audio stream.', true);
      return;
    }
    store.set({ songPath: picked, songDuration: info.duration, songStart: 0, ...DEFAULT_MIX });
    songStartInput.value = '0:00';
    player.setSong(picked);
    void waveform.setSong(picked);
    setStatus('');
  } catch (error) {
    setStatus(errorText(error), true);
  }
}

function clearSong(): void {
  if (store.get().busy) return;
  store.set({ songPath: null, songDuration: 0, songStart: 0, ...DEFAULT_MIX });
  songStartInput.value = '0:00';
  previewSongInput.checked = false;
  player.setPreviewSong(false);
  player.setSong(null);
  void waveform.setSong(null);
}

// ---- exporting -------------------------------------------------------------

async function runExport(): Promise<void> {
  const s = store.get();
  if (!s.clipPath || !s.video) return;

  const container = containerOf(s.settings);
  const picked = await save({
    defaultPath: defaultOutputPath(s.clipPath, container),
    filters: [{ name: container === 'mp4' ? 'MP4 video' : 'WebM video', extensions: [container] }],
  });
  if (!picked) return;
  const outputPath = new RegExp(`\\.${container}$`, 'i').test(picked) ? picked : `${picked}.${container}`;

  const request: ExportRequest = {
    clipPath: s.clipPath,
    songPath: s.songPath,
    outputPath,
    video: s.video,
    songDuration: s.songDuration,
    inPoint: s.inPoint,
    outPoint: s.outPoint,
    songStart: s.songStart,
    songVolume: s.songVolume,
    songFadeIn: s.songFadeIn,
    songFadeOut: s.songFadeOut,
    cropX: s.cropX,
    cropEnabled: s.cropEnabled,
    settings: s.settings,
    clipAudioCodec: s.clipAudioCodec,
  };
  const errors = validateRequest(request);
  if (errors.length > 0) {
    setStatus(errors.join('\n'), true);
    return;
  }

  const duration = exportDuration(request);
  store.set({ busy: true });
  progressEl.value = 0;
  setStatus('Exporting…');
  const stopListening = await onProgress((percent) => {
    progressEl.value = percent;
  });
  try {
    await exportVideo(buildExportArgs(request), duration, outputPath);
    setStatus(`Saved ${outputPath}`);
  } catch (error) {
    if (error === 'cancelled') setStatus('Export cancelled.');
    else setStatus(errorText(error), true);
  } finally {
    stopListening();
    store.set({ busy: false });
  }
}

// ---- controls --------------------------------------------------------------

crop.onChange = (cropX) => store.set({ cropX });
$<HTMLInputElement>('crop-enabled').addEventListener('change', (event) =>
  store.set({ cropEnabled: (event.target as HTMLInputElement).checked }),
);

timeline.onSeek = (time) => {
  store.set({ playhead: time }); // move the playhead right away; the video catches up
  player.seek(time);
};
timeline.onIn = (time) => {
  const { outPoint } = store.get();
  store.set({ inPoint: Math.min(time, outPoint - MIN_CLIP_SECONDS) });
};
timeline.onOut = (time) => {
  const { inPoint, clipDuration } = store.get();
  store.set({ outPoint: Math.min(Math.max(time, inPoint + MIN_CLIP_SECONDS), clipDuration) });
};

function setInAtPlayhead(): void {
  timeline.onIn(player.time);
}
function setOutAtPlayhead(): void {
  timeline.onOut(player.time);
}

/** Moves one frame (or one second with `large`) backwards or forwards. */
function stepFrames(direction: 1 | -1, large: boolean): void {
  const fps = store.get().video?.fps || 30;
  player.step(direction * (large ? Math.round(fps) : 1), fps);
}

const iconPlay = $('icon-play');
const iconPause = $('icon-pause');
player.onPlayState((playing) => {
  // SVG elements have no .hidden property, so toggle the attribute directly.
  iconPlay.toggleAttribute('hidden', playing);
  iconPause.toggleAttribute('hidden', !playing);
});

$('open-video').addEventListener('click', () => void chooseClip());
$('empty-state').addEventListener('click', () => void chooseClip());
$('empty-state').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    void chooseClip();
  }
});
$('open-song').addEventListener('click', () => void chooseSong());
$('clear-song').addEventListener('click', clearSong);
$('play').addEventListener('click', () => player.toggle());
$('btn-start').addEventListener('click', () => player.jumpToIn());
$('btn-end').addEventListener('click', () => player.jumpToOut());
$('btn-back').addEventListener('click', () => stepFrames(-1, false));
$('btn-forward').addEventListener('click', () => stepFrames(1, false));
$('set-in').addEventListener('click', setInAtPlayhead);
$('set-out').addEventListener('click', setOutAtPlayhead);
$('export').addEventListener('click', () => void runExport());
$('cancel').addEventListener('click', () => void cancelExport());

waveform.onStart = (songStart) => store.set({ songStart });
volumeInput.addEventListener('input', () => store.set({ songVolume: Number(volumeInput.value) / 100 }));
fadeInInput.addEventListener('input', () => store.set({ songFadeIn: Number(fadeInInput.value) }));
fadeOutInput.addEventListener('input', () => store.set({ songFadeOut: Number(fadeOutInput.value) }));

previewSongInput.addEventListener('change', () => player.setPreviewSong(previewSongInput.checked));

songStartInput.addEventListener('change', () => {
  const { songDuration, songStart } = store.get();
  const parsed = parseMmSs(songStartInput.value);
  if (parsed === null || parsed >= songDuration) {
    songStartInput.value = formatMmSs(songStart);
    return;
  }
  store.set({ songStart: parsed });
});

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target instanceof HTMLInputElement && ['text', 'range'].includes(event.target.type)) return;
  const arrow = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  if (event.repeat && !arrow) return;
  if (event.code === 'Space') {
    event.preventDefault();
    player.toggle();
  } else if (store.get().clipPath === null) {
    return;
  } else if (arrow) {
    event.preventDefault();
    stepFrames(event.key === 'ArrowLeft' ? -1 : 1, event.shiftKey);
  } else if (event.key === 'i' || event.key === 'I') {
    setInAtPlayhead();
  } else if (event.key === 'o' || event.key === 'O') {
    setOutAtPlayhead();
  }
});

void getCurrentWebview().onDragDropEvent((event) => {
  if (event.payload.type === 'drop' && event.payload.paths.length > 0) {
    void openClip(event.payload.paths[0]);
  }
});
