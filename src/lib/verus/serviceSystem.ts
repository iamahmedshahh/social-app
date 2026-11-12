import {toIAddress} from 'verus-typescript-primitives'
import {type VerusIdInterface} from 'verusid-ts-client'

import {processIAddress} from '#/lib/verus/addresses'

const TESTNET_SYSTEM_ID = toIAddress('VRSCTEST')

export interface ServiceSystem {
  chain: string
  systemID: string
  isTestnet: boolean
}

// The system of the Verus service in use. Requests, signatures and names follow
// it, not the build default, since the user can switch to another service.
export function getServiceSystem(
  verusIdInterface: VerusIdInterface,
): ServiceSystem {
  const chain = verusIdInterface.interface.chain
  // A system name is its own parent, so VRSCTEST hashes on VRSCTEST.
  const systemID = processIAddress(chain, chain)
  return {chain, systemID, isTestnet: systemID === TESTNET_SYSTEM_ID}
}
