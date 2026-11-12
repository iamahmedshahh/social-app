import {type QueryClient, useQuery} from '@tanstack/react-query'
import {GenericResponse} from 'verus-typescript-primitives'
import {type VerusIdInterface} from 'verusid-ts-client'

import {LOCAL_DEV_VSKY_SERVER} from '#/lib/constants'
import {useVerusService} from '#/state/preferences'
import {IS_NATIVE} from '#/env'

const RESPONSES_GET_ENDPOINT = `${LOCAL_DEV_VSKY_SERVER}/api/v2/responses/get`

// Verified responses that a wallet on this phone sent back in a link, by
// request ID. They never reach the server.
const responsesFromLinks = new Map<string, GenericResponse>()

export async function getVerusIdRequestResponse({
  requestId,
  verusIdInterface,
}: {
  requestId: string
  verusIdInterface: VerusIdInterface
}): Promise<GenericResponse | null> {
  const responseFromLink = responsesFromLinks.get(requestId)
  if (responseFromLink) {
    return responseFromLink
  }

  // On a phone, wallets reply with a link, never to the server.
  if (IS_NATIVE) {
    return null
  }

  const response = await fetch(
    `${RESPONSES_GET_ENDPOINT}?requestId=${encodeURIComponent(requestId)}`,
  )

  // Occurs when the server hasn't received a response yet
  if (response.status === 204) {
    // The link may have arrived while this poll waited for the server.
    return responsesFromLinks.get(requestId) ?? null
  }

  if (!response.ok) {
    throw new Error('Failed to fetch VerusID request response')
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return await parseAndVerifyResponse(buffer, verusIdInterface)
}

// Throws unless the bytes are a response with a valid signature.
async function parseAndVerifyResponse(
  buffer: Buffer,
  verusIdInterface: VerusIdInterface,
): Promise<GenericResponse> {
  const genericResponse = new GenericResponse()
  genericResponse.fromBuffer(buffer)

  const isValid = await verusIdInterface.verifyGenericResponse(genericResponse)

  if (!isValid) {
    throw new Error('Invalid VerusID request response')
  }

  return genericResponse
}

/**
 * Takes a response that a wallet on this phone sent back in a link, checks it
 * like a response from the server, and hands it to the screen that is waiting
 * for its request.
 */
export async function receiveVerusIdRequestResponse({
  encodedResponse,
  verusIdInterface,
  queryClient,
}: {
  encodedResponse: string
  verusIdInterface: VerusIdInterface
  queryClient: QueryClient
}) {
  // Wallets encode the response as base64url.
  const base64 = encodedResponse.replace(/-/g, '+').replace(/_/g, '/')
  const genericResponse = await parseAndVerifyResponse(
    Buffer.from(base64, 'base64'),
    verusIdInterface,
  )

  const requestId = genericResponse.requestID?.toAddress()
  if (!requestId) {
    throw new Error('Missing request ID in VerusID request response')
  }

  responsesFromLinks.set(requestId, genericResponse)

  // Every query that waits for a response has the request ID in its key. Let
  // it pick the response up now instead of at its next poll.
  await queryClient.refetchQueries({
    predicate: query => query.queryKey.includes(requestId),
    type: 'active',
  })
}

const createVerusIdRequestQueryKey = (requestId: string) => [
  'verusid-request',
  requestId,
]

export function useVerusIdRequestQuery({
  requestId,
  enabled = true,
}: {
  requestId: string
  enabled?: boolean
}) {
  const {verusIdInterface} = useVerusService()
  return useQuery({
    enabled: !!requestId && enabled !== false,
    queryKey: createVerusIdRequestQueryKey(requestId),
    queryFn: async () => {
      return await getVerusIdRequestResponse({requestId, verusIdInterface})
    },
    refetchInterval: query => {
      return query.state.data ? false : 1000
    },
    staleTime: 0,
    retry: false,
  })
}
