import { clearProxy, fileUrl, makeProxy } from '../lib/backend';
import { $ } from '../lib/dom';

/** Controls the preview <video> and the optional song <audio>. */
export class Player {
  private video = $<HTMLVideoElement>('video');
  private audio = $<HTMLAudioElement>('audio');
  private loaded = false;
  private inPoint = 0;
  private outPoint = 0;
  private songStart = 0;
  private previewSong = false;
  private songUsable = false;
  private listeners: Array<(time: number) => void> = [];

  /** Called when the webview cannot decode the chosen song. */
  onSongError: () => void = () => {};

  constructor() {
    this.video.addEventListener('play', () => {
      this.syncAudio();
      this.loop();
    });
    this.video.addEventListener('pause', () => this.audio.pause());
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

  private emit(): void {
    for (const callback of this.listeners) callback(this.video.currentTime);
  }

  private loop = (): void => {
    this.emit();
    if (this.video.paused) return;
    if (this.outPoint > 0 && this.video.currentTime >= this.outPoint) {
      this.video.pause();
      this.seek(this.inPoint);
      return;
    }
    requestAnimationFrame(this.loop);
  };

  /** Loads the clip; falls back to a 540p proxy when the webview can't decode it. */
  async load(path: string, onStatus: (text: string) => void): Promise<void> {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.loaded = false;
    await clearProxy();
    try {
      await this.attach(fileUrl(path));
    } catch {
      onStatus('This codec cannot be previewed directly — generating a preview copy…');
      const proxy = await makeProxy(path);
      await this.attach(fileUrl(proxy));
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
    void this.audio.play().catch(() => {});
  }
}
