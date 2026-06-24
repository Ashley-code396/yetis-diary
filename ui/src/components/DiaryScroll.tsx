import type { DiaryEntry } from '@yetis-diary/sdk';

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return 'sometime';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface DiaryScrollProps {
  entries: DiaryEntry[];
  isLoading: boolean;
}

export function DiaryScroll({ entries, isLoading }: DiaryScrollProps) {
  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="rounded-2xl border border-[#dccfae] bg-[#faf3e3]/80 p-8 text-center italic text-[#7a6558] shadow-[0_8px_30px_var(--warm-shadow)]">
          The pages are turning…
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="rounded-2xl border border-dashed border-[#c9b896] bg-[#faf3e3]/60 p-10 text-center shadow-[0_8px_30px_var(--warm-shadow)]">
          <p className="font-display text-3xl text-[#6b8f71]">The first page waits, blank and cold.</p>
          <p className="mt-3 text-sm italic text-[#7a6558]">
            Be the yeti who breaks the silence — register, wait your turn, write one true sentence.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-4">
      <article className="relative overflow-hidden rounded-2xl border border-[#dccfae] bg-[#faf3e3]/90 px-8 py-10 shadow-[0_12px_40px_var(--warm-shadow)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%233d2b1f\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          }}
        />
        <div className="relative space-y-8">
          {entries.map((entry) => (
            <div key={entry.index} className="group">
              <p className="text-[1.05rem] leading-relaxed text-[#3d2b1f]">{entry.text}</p>
              <p className="mt-2 text-xs tracking-wide text-[#8a7568] uppercase">
                {shortenAddress(entry.author)} · {formatTimestamp(entry.timestamp)}
              </p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
