import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { MediaInfo } from './types';

export const probeMedia = (path: string) => invoke<MediaInfo>('probe_media', { path });
export const exportVideo = (args: string[], duration: number, output: string) =>
  invoke<void>('export_video', { args, duration, output });
export const cancelExport = () => invoke<void>('cancel_export');
export const makeProxy = (input: string) => invoke<string>('make_proxy', { input });
export const clearProxy = () => invoke<void>('clear_proxy');
export const onProgress = (callback: (percent: number) => void) =>
  listen<number>('progress', (event) => callback(event.payload));
export const fileUrl = (path: string) => convertFileSrc(path);
