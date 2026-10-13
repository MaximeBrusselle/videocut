import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { $ } from '../lib/dom';

export function initUpdater(): void {
  const banner = $('update-banner');
  const text = $('update-text');
  const progress = $<HTMLProgressElement>('update-progress');
  const install = $<HTMLButtonElement>('update-install');
  const dismiss = $<HTMLButtonElement>('update-dismiss');
  let update: Update | null = null;

  dismiss.addEventListener('click', () => {
    banner.hidden = true;
  });

  install.addEventListener('click', async () => {
    if (!update) return;
    install.disabled = true;
    dismiss.hidden = true;
    progress.hidden = false;
    text.textContent = `Downloading Videocut ${update.version}…`;
    let total = 0;
    let done = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') total = event.data.contentLength ?? 0;
        else if (event.event === 'Progress') {
          done += event.data.chunkLength;
          if (total > 0) progress.value = Math.round((done / total) * 100);
        } else text.textContent = 'Installing…';
      });
      await relaunch();
    } catch (err) {
      text.textContent = `Update failed: ${String(err)}`;
      install.disabled = false;
      dismiss.hidden = false;
      progress.hidden = true;
    }
  });

  // Silent on failure: offline or no release yet must not bother the user.
  check()
    .then((found) => {
      if (!found) return;
      update = found;
      text.textContent = `Videocut ${found.version} is available.`;
      banner.hidden = false;
    })
    .catch(() => {});
}
