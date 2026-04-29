import * as express from 'express'
import {BN} from 'bn.js'
import {
  CompactIAddressObject,
  Credential,
  GenericRequest,
  GenericResponse,
  IDENTITY_CREDENTIAL,
  IDENTITY_CREDENTIAL_PLAINLOGIN,
  IdentityUpdateRequestDetails,
  IdentityUpdateRequestOrdinalVDXFObject,
  PartialIdentity,
  ResponseURI,
  VerifiableSignatureData,
} from 'verus-typescript-primitives'

import {CHAIN, SERVER_URL, signingAddress, verusDaemonConfig} from '../../config'
import {callRPCDaemon} from '../../utils/callRPCDaemon'
import {RequestResponseStore} from '../../utils/RequestResponseStore'

const identityUpdateRouter = express.Router()
identityUpdateRouter.use(express.json())

const updates = new RequestResponseStore<string, GenericRequest, GenericResponse>()

let cachedSystemID: string | null = null

const getSystemID = async (): Promise<string> => {
  if (cachedSystemID) return cachedSystemID
  const result = await callRPCDaemon(verusDaemonConfig, 'getinfo', [])
  cachedSystemID = (result.result as any).chainid as string
  return cachedSystemID
}

/**
 * POST /api/v2/identityupdates/sign-update-request
 * Body: { requestId: string, identityName: string, email: string, password: string }
 *
 * Builds a GenericRequest containing an IdentityUpdateRequestOrdinalVDXFObject
 * with plaintext credentials under IDENTITY_CREDENTIAL.vdxfid.
 * Verus Mobile handles encryption internally when it sees this key.
 */
identityUpdateRouter.post('/sign-update-request', async (req, res) => {
  const {requestId, identityName, email, password} = req.body

  if (!requestId || !identityName || !email || !password) {
    res.status(400).json({error: 'requestId, identityName, email, and password are required'})
    return
  }

  console.log(`Signing identity update request with id ${requestId} at ${new Date().toLocaleTimeString()}`)

  try {
    const systemID = await getSystemID()

    // Build the credential object — Verus Mobile will encrypt this
    const _credential = new Credential({
      version: Credential.VERSION_CURRENT,
      credentialKey: IDENTITY_CREDENTIAL_PLAINLOGIN.vdxfid,
      credential: [email, password],
      scopes: [signingAddress],
    })

    // Build the partial identity with the credential under IDENTITY_CREDENTIAL.vdxfid
    // Verus Mobile detects this key and handles encryption before updateidentity
    const partialIdentity = PartialIdentity.fromJson({
    name: identityName.replace('@', ''),
    contentmultimap: {
        [IDENTITY_CREDENTIAL.vdxfid]: [
            {
            version: 1,
            credentialkey: IDENTITY_CREDENTIAL_PLAINLOGIN.vdxfid,
            credential: [email, password],
            scopes: [signingAddress],
            } as any,
    ],
  } as any,
    })
    // Build the IdentityUpdateRequestDetails
    const updateDetails = new IdentityUpdateRequestDetails({
      identity: partialIdentity,
    })

    // Wrap in ordinal
    const updateOrdinal = new IdentityUpdateRequestOrdinalVDXFObject({
      data: updateDetails,
    })

    // Build the callback URL
    const callbackUrl = `${SERVER_URL}/api/v2/identityupdates/confirm-update?requestId=${requestId}`

    const responseURI = ResponseURI.fromUriString(callbackUrl, ResponseURI.TYPE_POST)

    // Wrap in GenericRequest
    const genericReq = new GenericRequest({
      details: [updateOrdinal],
      createdAt: new BN(Math.floor(Date.now() / 1000)),
      responseURIs: [responseURI],
    })

    if (CHAIN === 'VRSCTEST') {
      genericReq.flags = genericReq.flags.or(GenericRequest.FLAG_IS_TESTNET)
    }

    genericReq.signature = new VerifiableSignatureData({
      systemID: CompactIAddressObject.fromAddress(systemID),
      identityID: CompactIAddressObject.fromAddress(signingAddress),
    })
    genericReq.setSigned()

    const dataHash = genericReq.getRawDataSha256().toString('hex')

    const signResult = await callRPCDaemon(verusDaemonConfig, 'signdata', [
      {
        address: signingAddress,
        datahash: dataHash,
      },
    ])

    if (signResult.error) throw new Error(signResult.error.message)

    const signature = (signResult.result as any).signature as string
    genericReq.signature.signatureAsVch = Buffer.from(signature, 'base64')

    updates.setRequest(requestId, genericReq)

    res.status(200).json({
      deeplinkUri: genericReq.toWalletDeeplinkUri(),
      qrstring: genericReq.toQrString(),
    })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Failed to sign identity update request:', error.message)
    res.status(500).json({error: error.message})
  }
})

/**
 * POST /api/v2/identityupdates/confirm-update?requestId=xxx
 * Verus Mobile POSTs the GenericResponse here after submitting the updateidentity tx.
 */
identityUpdateRouter.post(
  '/confirm-update',
  express.raw({type: 'application/octet-stream'}),
  async (req, res) => {
    try {
      const requestId = req.query.requestId as string | undefined

      if (!requestId) {
        res.status(400).send('Missing requestId in callback URL')
        return
      }

      const response = new GenericResponse()
      response.fromBuffer(req.body as Buffer, 0)

      if (updates.hasAttempt(requestId)) {
        console.log(`Received identity update response with id ${requestId} at ${new Date().toLocaleTimeString()}`)
        updates.setResponse(requestId, response)
        res.status(200).send('Identity update response received.')
      } else {
        res.status(400).send('Unknown identity update request ID.')
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('Error processing identity update response:', error.message)
      res.status(500).json({error: error.message})
    }
  },
)

/**
 * GET /api/v2/identityupdates/get-update-response?requestId=xxx
 */
identityUpdateRouter.get('/get-update-response', async (req, res) => {
  const {requestId} = req.query

  if (!requestId) {
    res.status(400).json({error: 'requestId is required'})
    return
  }

  const update = updates.getAttempt(requestId as string)

  if (update && update.response) {
    res.status(200).json({
      buffer: update.response.toBuffer().toString('hex'),
    })
  } else {
    res.status(204).send()
  }
})

export {identityUpdateRouter}