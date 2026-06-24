import { useQuery } from '@tanstack/react-query';
import { useCurrentClient } from '@mysten/dapp-kit-react';
import {
  DiaryContentVerificationError,
  getFullDiary,
  type DiaryPayload,
  type DiaryOnChainState,
} from '@yetis-diary/sdk';
import { DIARY_ID } from '../lib/config';

export function useDiary() {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ['diary', DIARY_ID],
    queryFn: async (): Promise<{
      payload: DiaryPayload;
      blobId: string;
      onChain: DiaryOnChainState;
      verificationError: DiaryContentVerificationError | null;
    }> => {
      try {
        const result = await getFullDiary(client, DIARY_ID);
        return {
          payload: result.payload,
          blobId: result.blobId,
          onChain: result.onChain,
          verificationError: null,
        };
      } catch (error) {
        if (error instanceof DiaryContentVerificationError) {
          return {
            payload: { version: 1, entries: [] },
            blobId: '',
            onChain: await import('@yetis-diary/sdk').then((m) =>
              m.getDiaryOnChainState(client, DIARY_ID),
            ),
            verificationError: error,
          };
        }
        throw error;
      }
    },
    enabled: Boolean(DIARY_ID),
    refetchInterval: 5000,
  });
}
