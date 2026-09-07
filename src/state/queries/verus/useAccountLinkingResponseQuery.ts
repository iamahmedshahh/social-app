import {useQuery} from '@tanstack/react-query'
import {type GenericRequest} from 'verus-typescript-primitives'

import {
  type AccountLinkingResponse,
  processAccountLinkingResponse,
} from '#/lib/verus/requests/accountLinking'
import {useVerusService} from '#/state/preferences'
import {getVerusIdRequestResponse} from './useVerusIdRequestQuery'

export const createAccountLinkingResponseQueryKey = (requestId: string) => [
  'verus-account-linking-response',
  requestId,
]

export function useAccountLinkingResponseQuery({
  request,
  rfqn,
  detailsToSign,
  enabled = true,
}: {
  request: GenericRequest | null
  rfqn: string
  detailsToSign: string
  enabled?: boolean
}) {
  const {verusIdInterface} = useVerusService()
  const requestId = request?.requestID?.toAddress() ?? ''

  return useQuery<AccountLinkingResponse | null>({
    enabled: enabled && !!request && !!requestId,
    queryKey: createAccountLinkingResponseQueryKey(requestId),
    queryFn: async () => {
      const response = await getVerusIdRequestResponse({
        requestId,
        verusIdInterface,
      })

      if (!response) {
        return null
      }

      const result = processAccountLinkingResponse(request!, response)

      const verified = await verusIdInterface.verifyMessage(
        rfqn,
        result.signature,
        detailsToSign,
      )

      if (!verified) {
        throw new Error('Invalid signature. Please try again.')
      }

      return result
    },
    // Don't poll on errors and just surface.
    refetchInterval: query =>
      query.state.data || query.state.error ? false : 1000,
    staleTime: 0,
    retry: false,
  })
}
