import { clearProxy, fileUrl, makeProxy } from '../lib/backend';
import { $ } from '../lib/dom';
import { fadeGain } from '../lib/songMix';

/** Controls the preview <video> and the optional song <audio>. */
export class Player {
  private video = $<HTMLVideoElement>('video');
  private audio = $<HTMLAudioElement>('audio');
  private loaded = false;
  private loadId = 0;
  private inPoint = 0;
  private outPoint = 0;
  private songStart = 0;
  private songVolume = 1;
  private songFadeIn = 0;
  private songFadeOut = 0;
  private songLength = 0;
  private previewSong = false;
  private songUsable = false;
  private listeners: Array<(time: number) => void> = [];
  private playListeners: Array<(playing: boolean) => void> = [];

  /** Called when the webview cannot decode the chosen song. */
  onSongError: () => void = () => {};

  constructor() {
    this.video.addEventListener('play', () => {
      this.syncAudio();
      this.loop();
      this.emitPlayState();
    });
    this.video.addEventListener('pause', () => {
      this.audio.pause();
      this.emitPlayState();
    });
    this.video.addEventListener('ended', () => this.seek(this.inPoint));
    this.video.addEventListener('seeked', () => {
      this.emit();
      if (!this.video.paused) this.syncAudio();
    });
    this.audio.addEventListener('error', () => {
      this.songUsable = false;
      this.onSongError();
    });
  }

  onTime(callback: (time: number) => void): void {
    this.listeners.push(callback);
  }

  /** Called with `true` when playback starts and `false` when it pauses or stops. */
  onPlayState(callback: (playing: boolean) => void): void {
    this.playListeners.push(callback);
  }

  private emitPlayState(): void {
    for (const callback of this.playListeners) callback(!this.video.paused);
  }

  private emit(): void {
    for (const callback of this.listeners) callback(this.video.currentTime);
  }

  private loop = (): void => {
    this.emit();
    if (this.video.paused) return;
    this.applyGain();
    if (this.video.currentTime < this.inPoint - 0.05) {
      this.seek(this.inPoint);
    } else if (this.outPoint > 0 && this.video.currentTime >= this.outPoint) {
      this.video.pause();
      this.seek(this.inPoint);
      return;
    }
    requestAnimationFrame(this.loop);
  };

  /** Loads the clip; falls back to a 540p proxy when the webview can't decode it. */
  async load(path: string, onStatus: (text: string) => void): Promise<void> {
    const id = ++this.loadId;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.loaded = false;
    await clearProxy();
    if (id !== this.loadId) return;
    try {
      await this.attach(fileUrl(path));
      if (id !== this.loadId) return;
    } catch {
      if (id !== this.loadId) return;
      onStatus('This codec cannot be previewed directly — generating a preview copy…');
      const proxy = await makeProxy(path);
      if (id !== this.loadId) return;
      await this.attach(fileUrl(proxy));
      if (id !== this.loadId) return;
      onStatus('Previewing a 540p copy; the export uses the original file.');
    }
    this.loaded = true;
  }

  private attach(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.video.removeEventListener('loadedmetadata', ready);
        this.video.removeEventListener('error', failed);
      };
      const ready = () => {
        cleanup();
        if (this.video.videoWidth === 0) reject(new Error('no decodable video track'));
        else resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error('unsupported'));
      };
      this.video.addEventListener('loadedmetadata', ready);
      this.video.addEventListener('error', failed);
      this.video.src = src;
      this.video.load();
    });
  }

  toggle(): void {
    if (!this.loaded) return;
    if (this.video.paused) {
      const t = this.video.currentTime;
      if (t < this.inPoint || t >= this.outPoint) this.video.currentTime = this.inPoint;
      void this.video.play();
    } else {
      this.video.pause();
    }
  }

  /** Pauses and moves by whole frames (negative = back), landing in the middle of the target frame. */
  step(frames: number, fps: number): void {
    if (!this.loaded) return;
    this.video.pause();
    const rate = fps > 0 ? fps : 30;
    const index = Math.floor(this.video.currentTime * rate + 0.001);
    const last = Number.isFinite(this.video.duration) ? this.video.duration - 0.5 / rate : Infinity;
    this.seek(Math.min(Math.max((index + frames + 0.5) / rate, 0), last));
  }

  jumpToIn(): void {
    this.video.pause();
    this.seek(this.inPoint);
  }

  jumpToOut(): void {
    this.video.pause();
    this.seek(this.outPoint);
  }

  seek(time: number): void {
    if (this.loaded) this.video.currentTime = time;
  }

  get time(): number {
    return this.video.currentTime;
  }

  setRange(inPoint: number, outPoint: number): void {
    this.inPoint = inPoint;
    this.outPoint = outPoint;
  }

  setSong(path: string | null): void {
    this.audio.pause();
    this.video.muted = path !== null; // a song replaces the clip's own audio
    if (path) {
      this.audio.src = fileUrl(path);
      this.songUsable = true;
    } else {
      this.audio.removeAttribute('src');
      this.songUsable = false;
    }
  }

  setSongStart(seconds: number): void {
    // render() calls this on every frame; only re-sync the audio when the value really changed.
    if (seconds === this.songStart) return;
    this.songStart = seconds;
    if (!this.video.paused) this.syncAudio();
  }

  setSongMix(volume: number, fadeIn: number, fadeOut: number, length: number): void {
    this.songVolume = volume;
    this.songFadeIn = fadeIn;
    this.songFadeOut = fadeOut;
    this.songLength = length;
    this.applyGain();
  }

  /** Preview gain: volume (capped at 100%, <audio> cannot boost) times the fade at the current position. */
  private applyGain(): void {
    const fade = fadeGain(this.video.currentTime - this.inPoint, this.songLength, this.songFadeIn, this.songFadeOut);
    this.audio.volume = Math.min(this.songVolume, 1) * fade;
  }

  setPreviewSong(on: boolean): void {
    this.previewSong = on;
    if (!this.video.paused) this.syncAudio();
    else this.audio.pause();
  }

  private syncAudio(): void {
    if (!this.previewSong || !this.songUsable) {
      this.audio.pause();
      return;
    }
    this.audio.currentTime = this.songStart + Math.max(0, this.video.currentTime - this.inPoint);
    this.applyGain();
    void this.audio.play().catch(() => {});
  }
}
