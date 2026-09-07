import {
  type AuthenticationRequestOrdinalVDXFObject,
  CompactIAddressObject,
  type DataPacketRequestOrdinalVDXFObject,
  type GenericRequest,
  type GenericResponse,
  RecipientConstraint,
} from 'verus-typescript-primitives'

import {
  type AuthenticationRequestOptions,
  generateAuthenticationRequestOrdinal,
} from './details/authDetail'
import {
  extractDataPacketSignatures,
  generateDataPacketRequestOrdinal,
} from './details/dataPacketDetail'
import {buildDataResponseMap} from './genericResponse'

export interface AccountLinkingRequestOptions {
  identityAddress: string
  detailsToSign: string
  auth?: AuthenticationRequestOptions
}

export interface AccountLinkingRequestOrdinals {
  ordinals: [
    AuthenticationRequestOrdinalVDXFObject,
    DataPacketRequestOrdinalVDXFObject,
  ]
}

export interface AccountLinkingResponse {
  signature: string
  identityAddress: string
}

export function generateAccountLinkingRequestOrdinals(
  options: AccountLinkingRequestOptions,
): AccountLinkingRequestOrdinals {
  const recipientConstraints = [
    new RecipientConstraint({
      type: RecipientConstraint.REQUIRED_ID,
      identity: new CompactIAddressObject({
        type: CompactIAddressObject.TYPE_I_ADDRESS,
        address: options.identityAddress,
      }),
    }),
  ]

  const authentication = generateAuthenticationRequestOrdinal({
    ...options.auth,
    recipientConstraints,
  })

  const dataPacketOrdinal = generateDataPacketRequestOrdinal({
    signableObjects: [options.detailsToSign],
  })

  return {
    ordinals: [authentication, dataPacketOrdinal],
  }
}

export function processAccountLinkingResponse(
  request: GenericRequest,
  response: GenericResponse,
): AccountLinkingResponse {
  const dataResponseMap = buildDataResponseMap(response)

  const signatures = extractDataPacketSignatures({request, dataResponseMap})
  const signatureData = signatures[0]

  return {
    signature: signatureData.signatureAsVch.toString('base64'),
    identityAddress: signatureData.identityID,
  }
}
