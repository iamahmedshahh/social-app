import {
  type GenericRequest,
  type GenericResponse,
  IdentityUpdateResponseOrdinalVDXFObject,
  type OrdinalVDXFObject,
} from 'verus-typescript-primitives'

import {
  generateIdentityUpdateRequestOrdinal,
  type IdentityUpdateRequestOptions,
} from './details/identityUpdateDetail'
import {assertResponseMatchesRequest} from './genericResponse'

export function generateIdentityUpdateRequestOrdinals(
  options: IdentityUpdateRequestOptions,
): [OrdinalVDXFObject] {
  return [generateIdentityUpdateRequestOrdinal(options)]
}

export function processIdentityUpdateResponse(
  request: GenericRequest,
  response: GenericResponse,
): string | null {
  assertResponseMatchesRequest(request, response)

  // The only ordinal in the response should be for the identity update.
  if (response.details.length <= 0) {
    throw new Error('Found no details in the response')
  }

  const ordinal = response.details[0]

  if (!(ordinal instanceof IdentityUpdateResponseOrdinalVDXFObject)) {
    throw new Error('Unexpected non-identity update ordinal in response')
  }

  const detail = ordinal.data

  if (detail.txid) {
    return detail.txid.toString('hex')
  }

  return null
}
