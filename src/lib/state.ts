import { DEFAULT_PRESET, PRESETS, type ExportSettings } from './presets';
import { DEFAULT_SONG_FADE_IN, DEFAULT_SONG_FADE_OUT, DEFAULT_SONG_VOLUME } from './songMix';
import { createStore } from './store';
import type { VideoInfo } from './types';

export interface AppState {
  clipPath: string | null;
  clipDuration: number;
  video: VideoInfo | null;
  clipAudioCodec: string | null;
  songPath: string | null;
  songDuration: number;
  inPoint: number;
  outPoint: number;
  songStart: number;
  songVolume: number;
  songFadeIn: number;
  songFadeOut: number;
  /** Crop window x in source pixels. */
  cropX: number;
  cropEnabled: boolean;
  settings: ExportSettings;
  playhead: number;
  busy: boolean;
}

export const store = createStore<AppState>({
  clipPath: null,
  clipDuration: 0,
  video: null,
  clipAudioCodec: null,
  songPath: null,
  songDuration: 0,
  inPoint: 0,
  outPoint: 0,
  songStart: 0,
  songVolume: DEFAULT_SONG_VOLUME,
  songFadeIn: DEFAULT_SONG_FADE_IN,
  songFadeOut: DEFAULT_SONG_FADE_OUT,
  cropX: 0,
  cropEnabled: true,
  settings: { ...PRESETS[DEFAULT_PRESET].settings },
  playhead: 0,
  busy: false,
});
