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
  /** Crop window x in source pixels. */
  cropX: number;
  cropEnabled: boolean;
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
  cropX: 0,
  cropEnabled: true,
  playhead: 0,
  busy: false,
});
