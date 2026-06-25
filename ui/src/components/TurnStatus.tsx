import type { EligibilityStatus } from '@yetis-diary/sdk';
import { useCurrentAccount } from '@mysten/dapp-kit-react';

function shortenAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface TurnStatusProps {
  eligibility: EligibilityStatus | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function TurnStatus({ eligibility, isLoading, error }: TurnStatusProps) {
  const account = useCurrentAccount();

  let content: React.ReactNode;

  if (!account) {
    content = (
      <p className="text-sm text-[#5c4638]">Connect a wallet to see whether it&apos;s your turn to write.</p>
    );
  } else if (error) {
    content = (
      <p className="text-sm text-red-800">
        Could not check eligibility: {error.message}
      </p>
    );
  } else if (isLoading || !eligibility) {
    content = <p className="text-sm italic text-[#7a6558]">Consulting the queue…</p>;
  } else if (eligibility.status === 'eligible') {
    content = (
      <p className="font-display text-2xl text-[#4a7c59]">
        ✦ It&apos;s your turn. The diary listens.
      </p>
    );
  } else if (eligibility.status === 'not_registered') {
    content = (
      <p className="text-sm text-[#5c4638]">
        You haven&apos;t joined the writer queue yet. Register below to claim your place in line.
      </p>
    );
  } else if (eligibility.status === 'not_your_turn') {
    content = (
      <div className="space-y-1 text-sm text-[#5c4638]">
        <p>
          Not your turn yet. Currently writing:{' '}
          <span className="font-semibold">{shortenAddress(eligibility.currentTurn)}</span>
        </p>
        {eligibility.queuePosition !== null && (
          <p>
            Your queue position: #{eligibility.queuePosition + 1} of {eligibility.queueLength}
          </p>
        )}
      </div>
    );
  } else {
    content = (
      <p className="text-sm text-[#5c4638]">
        Cooldown active — wait {formatDuration(eligibility.remainingMs)} before you can write again
        {eligibility.queuePosition !== null ? ` (position #${eligibility.queuePosition + 1})` : ''}.
      </p>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-2">
      <div className="rounded-xl border border-[#d4c4a8] bg-[#f0e6d0]/80 px-5 py-4 shadow-sm">
        <h2 className="font-display mb-2 text-xl text-[#3d2b1f]">Your turn</h2>
        {content}
      </div>
    </section>
  );
}
