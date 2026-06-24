import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount, useCurrentClient } from '@mysten/dapp-kit-react';
import { checkEligibility, type EligibilityStatus } from '@yetis-diary/sdk';
import { DIARY_ID, PACKAGE_ID } from '../lib/config';

export function useEligibility() {
  const client = useCurrentClient();
  const account = useCurrentAccount();

  return useQuery({
    queryKey: ['eligibility', DIARY_ID, account?.address],
    queryFn: async (): Promise<EligibilityStatus> => {
      if (!account?.address) {
        return { status: 'not_registered' };
      }
      return checkEligibility(client, PACKAGE_ID, DIARY_ID, account.address);
    },
    enabled: Boolean(DIARY_ID && PACKAGE_ID && account?.address),
    refetchInterval: 5000,
  });
}
