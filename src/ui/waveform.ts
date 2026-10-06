import { fileUrl } from '../lib/backend';
import { $ } from '../lib/dom';
import { clampSongStart, computePeaks, windowFractions } from '../lib/waveform';

const BUCKETS = 600;

/** Waveform of the song with a clip-length window; dragging the window sets the song start. */
export class Waveform {
  private wrap = $('wave');
  private canvas = $<HTMLCanvasElement>('wave-canvas');
  private win = $('wave-window');
  private playhead = $('wave-playhead');
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
    // Press inside the window to move it, or anywhere else to centre it there; keep dragging to adjust.
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

  /** `position` is the song time (seconds) currently playing, or null to hide the indicator. */
  update(songDuration: number, songStart: number, windowLength: number, position: number | null): void {
    const showPlayhead = position !== null && songDuration > 0 && position <= songDuration;
    this.playhead.hidden = !showPlayhead;
    if (showPlayhead) this.playhead.style.left = `${(position / songDuration) * 100}%`;
    this.wrap.hidden = songDuration <= 0;
    this.songDuration = songDuration;
    this.songStart = songStart;
    this.windowLength = windowLength;
    const { left, width } = windowFractions(songStart, windowLength, songDuration);
    this.win.style.left = `${left * 100}%`;
    this.win.style.width = `${width * 100}%`;
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
