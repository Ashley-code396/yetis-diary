import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount, useCurrentClient, useDAppKit } from '@mysten/dapp-kit-react';
import {
  buildRegisterTx,
  buildRetryWriteEntryTx,
  buildWriteEntryFlow,
  clearPendingWrite,
  createWalletSigner,
  loadPendingWrite,
  MAX_ENTRY_LENGTH,
  type EligibilityStatus,
} from '@yetis-diary/sdk';
import { DIARY_ID, PACKAGE_ID } from '../lib/config';

interface WriteBoxProps {
  eligibility: EligibilityStatus | undefined;
}

type WriteStep = 'idle' | 'walrus' | 'chain' | 'done';

export function WriteBox({ eligibility }: WriteBoxProps) {
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const dAppKit = useDAppKit();
  const queryClient = useQueryClient();

  const [text, setText] = useState('');
  const [step, setStep] = useState<WriteStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  const pending = loadPendingWrite();
  const canWrite = eligibility?.status === 'eligible';
  const charsLeft = MAX_ENTRY_LENGTH - text.length;

  async function handleRegister() {
    if (!account) return;
    setIsRegistering(true);
    setError(null);
    try {
      const tx = buildRegisterTx(PACKAGE_ID, DIARY_ID);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === 'FailedTransaction') {
        throw new Error(result.FailedTransaction.status.error?.message ?? 'Registration failed');
      }
      await client.core.waitForTransaction({ digest: result.Transaction.digest });
      await queryClient.invalidateQueries({ queryKey: ['eligibility'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setIsRegistering(false);
    }
  }

  async function handleRetryPending() {
    if (!account || !pending) return;
    setStep('chain');
    setError(null);
    try {
      const tx = buildRetryWriteEntryTx(pending);
      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      if (result.$kind === 'FailedTransaction') {
        throw new Error(result.FailedTransaction.status.error?.message ?? 'Transaction failed');
      }
      await client.core.waitForTransaction({ digest: result.Transaction.digest });
      clearPendingWrite();
      setStep('done');
      await queryClient.invalidateQueries({ queryKey: ['diary'] });
      await queryClient.invalidateQueries({ queryKey: ['eligibility'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
      setStep('idle');
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!account || !canWrite) return;

    setStep('walrus');
    setError(null);

    try {
      const signer = createWalletSigner(account.address, (tx) =>
        dAppKit.signAndExecuteTransaction({ transaction: tx }),
      );
      const { transaction } = await buildWriteEntryFlow(client, {
        packageId: PACKAGE_ID,
        diaryId: DIARY_ID,
        text,
        author: account.address,
        signer,
      });

      setStep('chain');
      const result = await dAppKit.signAndExecuteTransaction({ transaction });
      if (result.$kind === 'FailedTransaction') {
        throw new Error(result.FailedTransaction.status.error?.message ?? 'Transaction failed');
      }

      await client.core.waitForTransaction({ digest: result.Transaction.digest });
      clearPendingWrite();
      setText('');
      setStep('done');
      await queryClient.invalidateQueries({ queryKey: ['diary'] });
      await queryClient.invalidateQueries({ queryKey: ['eligibility'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Write failed');
      setStep('idle');
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-6 py-6 pb-16">
      <div className="rounded-xl border border-[#d4c4a8] bg-white/40 px-5 py-5 shadow-sm backdrop-blur-sm">
        <h2 className="font-display mb-3 text-xl text-[#3d2b1f]">Add your sentence</h2>

        {pending && (
          <div className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Walrus upload succeeded — on-chain confirm pending</p>
            <p className="mt-1 italic">&ldquo;{pending.text}&rdquo;</p>
            <button
              type="button"
              onClick={handleRetryPending}
              disabled={step !== 'idle' && step !== 'done'}
              className="mt-3 rounded-lg bg-amber-800 px-4 py-2 text-white hover:bg-amber-900 disabled:opacity-50"
            >
              Retry on-chain confirm
            </button>
          </div>
        )}

        {eligibility?.status === 'not_registered' && account && (
          <button
            type="button"
            onClick={handleRegister}
            disabled={isRegistering}
            className="mb-4 rounded-lg bg-[#6b8f71] px-4 py-2 text-sm text-white hover:bg-[#5a7b60] disabled:opacity-50"
          >
            {isRegistering ? 'Registering…' : 'Join the writer queue'}
          </button>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_ENTRY_LENGTH))}
            disabled={!canWrite || step === 'walrus' || step === 'chain'}
            placeholder={
              canWrite
                ? 'One sentence for the yeti chronicle…'
                : 'Waiting for your turn…'
            }
            rows={4}
            className="w-full resize-none rounded-lg border border-[#c9b896] bg-[#faf6eb] px-4 py-3 text-[#3d2b1f] placeholder:text-[#a89584] focus:border-[#6b8f71] focus:outline-none focus:ring-2 focus:ring-[#6b8f71]/30 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-4">
            <span className={`text-xs ${charsLeft < 30 ? 'text-amber-800' : 'text-[#8a7568]'}`}>
              {charsLeft} characters left
            </span>
            <button
              type="submit"
              disabled={!canWrite || !text.trim() || step === 'walrus' || step === 'chain'}
              className="rounded-lg bg-[#3d2b1f] px-5 py-2.5 text-sm text-[#f5edd6] hover:bg-[#2a1d15] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {step === 'walrus'
                ? 'Storing on Walrus…'
                : step === 'chain'
                  ? 'Confirming on-chain…'
                  : 'Write to the diary'}
            </button>
          </div>
        </form>

        {error && (
          <p className="mt-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
