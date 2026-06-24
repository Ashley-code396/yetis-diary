import { ConnectButton } from '@mysten/dapp-kit-react/ui';

export function Header() {
  return (
    <header className="mx-auto flex max-w-3xl flex-col gap-4 px-6 pt-10 pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="font-display text-sm tracking-wide text-[#6b8f71] uppercase">
          Lofi the Yeti · CLAY Hackathon
        </p>
        <h1 className="font-display mt-1 text-5xl leading-none text-[#3d2b1f]">Yeti&apos;s Diary</h1>
        <p className="mt-3 max-w-md text-base italic text-[#5c4638]">
          A story nobody owns, and nobody can erase.
        </p>
        <p className="mt-2 max-w-lg text-sm text-[#7a6558]">
          Uncensored collective folklore — only length and turn limits are enforced on-chain.
        </p>
      </div>
      <div className="shrink-0 pt-1">
        <ConnectButton />
      </div>
    </header>
  );
}
