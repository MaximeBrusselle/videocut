/** Mirrors the Rust `VideoInfo` struct (camelCase). */
export interface VideoInfo {
  width: number;
  height: number;
  fps: number;
  codec: string;
  colorSpace: string | null;
  colorPrimaries: string | null;
  colorTransfer: string | null;
}

/** Mirrors the Rust `MediaInfo` struct (camelCase). */
export interface MediaInfo {
  duration: number;
  video: VideoInfo | null;
  hasAudio: boolean;
  audioCodec: string | null;
}
