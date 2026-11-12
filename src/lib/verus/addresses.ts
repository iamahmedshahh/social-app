import {
  CompactIAddressObject,
  fromBase58Check,
  I_ADDR_VERSION,
  toBase58Check,
  toIAddress,
} from 'verus-typescript-primitives'

import {DEFAULT_CHAIN} from '#/env/verussky'

// Returns the base58check version byte, or undefined if it isn't base58check.
function getAddressVersion(value: string): number | undefined {
  try {
    return fromBase58Check(value).version
  } catch {
    return undefined
  }
}

// Only identities are i-addresses, not other base58 addresses like R-addresses.
export function isIAddress(value: string): boolean {
  return getAddressVersion(value) === I_ADDR_VERSION
}

// Converts a name to an i-address or leaves an i-address unchanged.
export function processIAddress(address: string, chain: string): string {
  const version = getAddressVersion(address)

  if (version === I_ADDR_VERSION) {
    return address
  }

  if (version !== undefined) {
    throw new Error(`${address} is not a VerusID name or i-address`)
  }

  // A sub-ID needs its full name: bob.alice@, since bob@ is a different ID.
  return toIAddress(address, chain)
}

export function generateRequestID(): CompactIAddressObject {
  const randID = Buffer.from(crypto.getRandomValues(new Uint8Array(20)))
  return CompactIAddressObject.fromAddress(
    toBase58Check(randID, I_ADDR_VERSION),
    DEFAULT_CHAIN,
  )
}
