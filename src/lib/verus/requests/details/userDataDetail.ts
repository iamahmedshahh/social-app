import type BN from 'bn.js'
import {
  type CompactIAddressObject,
  UserDataRequestDetails,
  UserDataRequestOrdinalVDXFObject,
} from 'verus-typescript-primitives'

import {generateRequestID} from '#/lib/verus/addresses'
import {createHash} from '#/platform/crypto'

export interface UserDataRequestOptions {
  // Maps a VDXF key to a plain label, such as 'Login Credentials'.
  searchDataKey: Array<{[key: string]: string}>
  requestedKeys?: string[]
  signer?: CompactIAddressObject
  dataType: BN
  requestType: BN
}

// Wallets only accept each label as a binary hash. SHA-256 is the detail's
// default hash type, so the type does not need to be set.
function hashSearchDataKey(
  searchDataKey: Array<{[key: string]: string}>,
): Array<{[key: string]: Buffer}> {
  return searchDataKey.map(item =>
    Object.fromEntries(
      Object.entries(item).map(([key, label]) => [
        key,
        createHash('sha256').update(label).digest(),
      ]),
    ),
  )
}

export function generateUserDataRequestDetails(
  options: UserDataRequestOptions,
) {
  return new UserDataRequestDetails({
    flags: UserDataRequestDetails.FLAG_HAS_REQUEST_ID,
    requestID: generateRequestID(),
    searchDataKey: hashSearchDataKey(options.searchDataKey),
    requestedKeys: options.requestedKeys,
    signer: options.signer,
    dataType: options.dataType,
    requestType: options.requestType,
  })
}

export function generateUserDataRequestOrdinal(
  options: UserDataRequestOptions,
) {
  return new UserDataRequestOrdinalVDXFObject({
    data: generateUserDataRequestDetails(options),
  })
}
