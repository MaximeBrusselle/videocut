import { $ } from '../lib/dom';

const RELEASES_URL = 'https://api.github.com/repos/MaximeBrusselle/videocut/releases?per_page=30';

interface Release {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string | null;
  draft: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/(https:\/\/[^\s<)]+)/g, '<span class="link">$1</span>');
}

/** Minimal markdown: headings, bullets, paragraphs, bold and code. Input is escaped first. */
export function renderNotes(body: string): string {
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) out.push('</ul>');
    inList = false;
  };
  for (const raw of body.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*]\s+(.*)/.exec(line);
    const heading = /^#{1,6}\s+(.*)/.exec(line);
    if (bullet) {
      if (!inList) out.push('<ul class="list-disc pl-5">');
      inList = true;
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      closeList();
      if (heading) out.push(`<h4 class="mt-2 font-semibold">${inline(heading[1])}</h4>`);
      else if (line) out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('');
}

export function initChangelog(): void {
  const dialog = $<HTMLDialogElement>('changelog-dialog');
  const list = $('changelog-list');
  let loaded = false;

  async function load(): Promise<void> {
    list.innerHTML = '<p class="muted">Loading…</p>';
    try {
      const res = await fetch(RELEASES_URL, { headers: { Accept: 'application/vnd.github+json' } });
      if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
      const releases = ((await res.json()) as Release[]).filter((r) => !r.draft);
      list.innerHTML = releases
        .map((r) => {
          const date = r.published_at ? new Date(r.published_at).toLocaleDateString() : '';
          // Only the hand-written notes are useful; drop the download boilerplate.
          const notes = (r.body ?? '')
            .split('\n\nWindows builds:')[0]
            .replace(/^See the assets to download and install\.$/m, '')
            .trim();
          return `<article class="flex flex-col gap-1 text-sm">
            <h3 class="flex items-baseline gap-2 text-base font-semibold">${escapeHtml(r.tag_name)}
              <span class="muted text-xs font-normal">${escapeHtml(date)}</span></h3>
            ${notes ? renderNotes(notes) : '<p class="muted">No notes for this release.</p>'}
          </article>`;
        })
        .join('');
      if (!releases.length) list.innerHTML = '<p class="muted">No releases yet.</p>';
      loaded = true;
    } catch (err) {
      list.innerHTML = `<p class="text-error text-sm">Could not load the changelog (${escapeHtml(String(err))}). Check your connection.</p>`;
    }
  }

  $('open-changelog').addEventListener('click', () => {
    dialog.showModal();
    if (!loaded) void load();
  });
  $('close-changelog').addEventListener('click', () => dialog.close());
}
