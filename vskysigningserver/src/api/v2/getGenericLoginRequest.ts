import {
  AppEncryptionRequestDetails,
  AppEncryptionRequestOrdinalVDXFObject,
  AuthenticationRequestDetails,
  AuthenticationRequestOrdinalVDXFObject,
  CompactIAddressObject,
  GenericRequest,
  GenericResponse,
  ResponseURI,
  VerifiableSignatureData,
} from 'verus-typescript-primitives'
import {VerusIdInterface} from 'verusid-ts-client'
import {BN} from 'bn.js'

import {CHAIN, REMOTE_RPC_URL, signingAddress, verusDaemonConfig} from '../../config'
import {callRPCDaemon} from '../../utils/callRPCDaemon'

const idInterface = new VerusIdInterface(CHAIN, REMOTE_RPC_URL)

let cachedSystemID: string | null = null

const getSystemID = async (): Promise<string> => {
  if (cachedSystemID) return cachedSystemID
  const result = await callRPCDaemon(verusDaemonConfig, 'getinfo', [])
  cachedSystemID = (result.result as any).chainid as string
  return cachedSystemID
}

export const createSignedGenericLoginRequest = async (
  requestId: string,
  callbackUrl: string,
): Promise<GenericRequest> => {
  console.log(
    'Signing generic login request at',
    new Date().toLocaleTimeString(),
  )

  try {
    const systemID = await getSystemID()

    // Used only inside AppEncryptionRequestDetails as derivationID
    // NOT set on the GenericRequest envelope — matches Vue app pattern
    const appOrDelegatedID = new CompactIAddressObject({
      type: CompactIAddressObject.TYPE_I_ADDRESS,
      address: signingAddress,
    })

    const authOrdinal = new AuthenticationRequestOrdinalVDXFObject({
      data: new AuthenticationRequestDetails(),
    })

    const encOrdinal = new AppEncryptionRequestOrdinalVDXFObject({
      data: new AppEncryptionRequestDetails({
        flags: AppEncryptionRequestDetails.FLAG_HAS_DERIVATION_ID,
        derivationNumber: new BN(0),
        derivationID: appOrDelegatedID,
      }),
    })

    const responseURI = ResponseURI.fromUriString(
      `${callbackUrl}?requestId=${requestId}`,
      ResponseURI.TYPE_POST,
    )

    // No appOrDelegatedID on envelope — Verus Mobile falls back to requestSignerID
    const req = new GenericRequest({
      details: [authOrdinal, encOrdinal],
      createdAt: new BN(Math.floor(Date.now() / 1000)),
      responseURIs: [responseURI],
    })

    if (CHAIN === 'VRSCTEST') {
      req.flags = req.flags.or(GenericRequest.FLAG_IS_TESTNET)
    }

    req.signature = new VerifiableSignatureData({
      systemID: CompactIAddressObject.fromAddress(systemID),
      identityID: CompactIAddressObject.fromAddress(signingAddress),
    })
    req.setSigned()

    const dataHash = req.getRawDataSha256().toString('hex')
    console.log('signdata params:', JSON.stringify({address: signingAddress, datahash: dataHash}))

    const signResult = await callRPCDaemon(verusDaemonConfig, 'signdata', [
      {
        address: signingAddress,
        datahash: dataHash,
      },
    ])

    const signature = (signResult.result as any).signature as string
    req.signature.signatureAsVch = Buffer.from(signature, 'base64')

    console.log('GenericRequest flags:', req.flags.toString(10))
    console.log('hasAppOrDelegatedID:', req.hasAppOrDelegatedID())

    return req
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    throw new Error(`Failed to create generic login request: ${error.message}`)
  }
}

export const verifyGenericLoginResponse = async (
  response: GenericResponse,
): Promise<boolean> => {
  try {
    return await idInterface.verifyGenericResponse(response)
  } catch {
    return false
  }
}