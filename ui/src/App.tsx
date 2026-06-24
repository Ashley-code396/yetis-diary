import { Header } from './components/Header';
import { DiaryScroll } from './components/DiaryScroll';
import { TurnStatus } from './components/TurnStatus';
import { WriteBox } from './components/WriteBox';
import { useDiary } from './hooks/useDiary';
import { useEligibility } from './hooks/useEligibility';
import { isConfigured } from './lib/config';

export function App() {
  const diaryQuery = useDiary();
  const eligibilityQuery = useEligibility();

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="font-display text-4xl text-[#3d2b1f]">Yeti&apos;s Diary</h1>
        <p className="mt-4 text-[#5c4638]">
          Set <code className="rounded bg-white/60 px-1">VITE_PACKAGE_ID</code> and{' '}
          <code className="rounded bg-white/60 px-1">VITE_DIARY_ID</code> in{' '}
          <code className="rounded bg-white/60 px-1">ui/.env</code> after deploying the Move package.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      <Header />

      {diaryQuery.data?.verificationError && (
        <div
          className="mx-auto max-w-3xl px-6 py-2"
          role="alert"
        >
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            <p className="font-semibold">Content verification failed</p>
            <p className="mt-1">
              Walrus content does not match the on-chain hash. The diary text is hidden until integrity
              is restored.
            </p>
          </div>
        </div>
      )}

      <DiaryScroll
        entries={
          diaryQuery.data?.verificationError ? [] : (diaryQuery.data?.payload.entries ?? [])
        }
        isLoading={diaryQuery.isLoading}
      />

      <TurnStatus
        eligibility={eligibilityQuery.data}
        isLoading={eligibilityQuery.isLoading}
      />

      <WriteBox eligibility={eligibilityQuery.data} />

      {diaryQuery.isError && (
        <p className="mx-auto max-w-3xl px-6 text-center text-sm text-red-800" role="alert">
          {diaryQuery.error instanceof Error ? diaryQuery.error.message : 'Failed to load diary'}
        </p>
      )}
    </div>
  );
}
