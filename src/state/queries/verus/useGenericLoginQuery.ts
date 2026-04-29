import {useQuery} from '@tanstack/react-query'
import {type VerusdRpcInterface} from 'verusd-rpc-ts-client'

import {LOCAL_DEV_VSKY_SERVER} from '#/lib/constants'
import {useVerusService} from '#/state/preferences'

export interface GenericLoginResult {
  username: string
  password: string
  signingId: string
  identityName: string
}

export async function getGenericLogin({
  requestId,
}: {
  requestId: string
  verusRpcInterface: VerusdRpcInterface
}): Promise<GenericLoginResult | null> {
  // Poll server — server does the full flow (extract keys, getidentity,
  // getvdxfid, find datadescriptor, decryptdata) and returns final credential
  const response = await fetch(
    `${LOCAL_DEV_VSKY_SERVER}/api/v2/genericlogin/get-login-response?requestId=${encodeURIComponent(requestId)}`,
  )

  if (response.status === 204) {
    return null
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({error: response.statusText}))
    throw new Error(errBody.error || 'Server error fetching login response')
  }

  const res = (await response.json()) as {
    username: string
    password: string
    signingId: string
    identityName: string
  }

  console.log('Login response received:', res.identityName, res.username)

  if (!res.username || !res.password || !res.signingId) {
    throw new Error('Invalid response from server: missing credential fields')
  }

  return {
    username: res.username,
    password: res.password,
    signingId: res.signingId,
    identityName: res.identityName,
  }
}

export const createGenericLoginQueryKey = (requestId: string) => [
  'generic-login',
  requestId,
]

export function useGenericLoginQuery({
  requestId,
  enabled = true,
}: {
  requestId: string
  enabled?: boolean
}) {
  const {verusRpcInterface} = useVerusService()

  return useQuery({
    enabled: !!requestId && enabled !== false,
    queryKey: createGenericLoginQueryKey(requestId),
    queryFn: async () => {
      return await getGenericLogin({requestId, verusRpcInterface})
    },
    refetchInterval: query => {
      return query.state.data ? false : 1000
    },
    staleTime: 0,
    retry: false,
  })
}