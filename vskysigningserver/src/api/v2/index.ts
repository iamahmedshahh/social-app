import * as express from 'express'
import {
  AppEncryptionResponseOrdinalVDXFObject,
  Credential,
  DATA_DESCRIPTOR_VDXF_KEY,
  IDENTITY_CREDENTIAL_PLAINLOGIN,
  GenericRequest,
  GenericResponse,
} from 'verus-typescript-primitives'

import {SERVER_URL, verusDaemonConfig} from '../../config'
import {RequestResponseStore} from '../../utils/RequestResponseStore'
import {callRPCDaemon} from '../../utils/callRPCDaemon'
import {
  createSignedGenericLoginRequest,
} from './getGenericLoginRequest'

const genericLoginRouter = express.Router()
genericLoginRouter.use(express.json())

const logins = new RequestResponseStore<string, GenericRequest, GenericResponse>()

genericLoginRouter.post('/sign-login-request', async (req, res) => {
  const {requestId} = req.body
  if (!requestId) { res.status(400).json({error: 'requestId is required'}); return }
  console.log(`Signing generic login request with id ${requestId} at ${new Date().toLocaleTimeString()}`)
  try {
    const signedReq = await createSignedGenericLoginRequest(requestId, `${SERVER_URL}/api/v2/genericlogin/confirm-login`)
    logins.setRequest(requestId, signedReq)
    res.status(200).json({ deeplinkUri: signedReq.toWalletDeeplinkUri(), qrstring: signedReq.toQrString() })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Failed to sign generic login request:', error.message)
    res.status(500).json({error: error.message})
  }
})

genericLoginRouter.post('/confirm-login', express.raw({type: 'application/octet-stream'}), async (req, res) => {
  try {
    const requestId = req.query.requestId as string | undefined
    if (!requestId) { res.status(400).send('Missing requestId in callback URL'); return }
    const response = new GenericResponse()
    response.fromBuffer(req.body as Buffer, 0)
    if (logins.hasAttempt(requestId)) {
      console.log(`Received generic login response with id ${requestId} at ${new Date().toLocaleTimeString()}`)
      logins.setResponse(requestId, response)
      res.status(200).send('Generic login response received.')
    } else {
      console.log(`Received generic login response with unknown id ${requestId} at ${new Date().toLocaleTimeString()}`)
      res.status(400).send('Unknown generic login request ID.')
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Error processing generic login response:', error.message)
    res.status(500).json({error: error.message})
  }
})

genericLoginRouter.get('/get-login-response', async (req, res) => {
  const {requestId} = req.query
  if (!requestId) { res.status(400).json({error: 'requestId is required'}); return }
  const login = logins.getAttempt(requestId as string)
  console.log('get-login-response queried for requestId:', requestId)
  if (!login || !login.response) { res.status(204).send(); return }
  try {
    const response = login.response
    const appEncOrdinal = (response.details as any[])?.find(
      (d: any) => d instanceof AppEncryptionResponseOrdinalVDXFObject,
    ) as AppEncryptionResponseOrdinalVDXFObject | undefined
    if (!appEncOrdinal) {
      console.error('Missing AppEncryptionResponse:', JSON.stringify((response.details as any[])?.map((d: any) => d?.constructor?.name)))
      res.status(500).json({error: 'Missing AppEncryptionResponse in GenericResponse'}); return
    }
    const encResponse = appEncOrdinal.data
    const ivk = encResponse.incomingViewingKey.toString('hex')
    const extfvk = encResponse.extendedViewingKey.toKeyString()
    const signingId = response.signature?.identityID?.toIAddress()
    console.log('Extracted keys - signingId:', signingId, 'ivk length:', ivk.length, 'extfvk length:', extfvk.length)
    if (!signingId) throw new Error('Missing signingId in response signature')
    const identityResult = await callRPCDaemon(verusDaemonConfig, 'getidentity', [signingId])
    if (identityResult.error) throw new Error(identityResult.error.message)
    if (!identityResult.result) throw new Error('Identity not found: ' + signingId)
    const identity = (identityResult.result as any).identity
    const identityName = (identityResult.result as any).fullyqualifiedname as string ?? identity.name as string

    console.log('Identity found:', identityName)
    const vdxfIdResult = await callRPCDaemon(verusDaemonConfig, 'getvdxfid', ['vrsc::identity.credentials', {vdxfkey: extfvk}])
    if (vdxfIdResult.error) throw new Error(vdxfIdResult.error.message)
    if (!vdxfIdResult.result) throw new Error('Failed to compute contentmap key')
    const hashedKey = (vdxfIdResult.result as any).vdxfid as string
    console.log('Hashed contentmap key:', hashedKey)
    const contentmultimap = (identity.contentmultimap ?? {}) as Record<string, any[]>
    const credentialEntries = contentmultimap[hashedKey]
    if (!credentialEntries || credentialEntries.length === 0) {
      throw new Error('No credential found in contentmultimap. Please sign in manually and save your login with VerusID first.')
    }
    const credentialEntry = credentialEntries[0]
    // Daemon returns vdxfid (i-address) form of the key, not string form
    const dataDescriptorJson =
      credentialEntry[DATA_DESCRIPTOR_VDXF_KEY.vdxfid] ??
      credentialEntry['vrsc::data.type.object.datadescriptor']
    if (!dataDescriptorJson) {
      console.error('credentialEntry keys:', JSON.stringify(Object.keys(credentialEntry)))
      throw new Error('Invalid contentmultimap entry format — datadescriptor not found')
    }
    const decryptResult = await callRPCDaemon(verusDaemonConfig, 'decryptdata', [{datadescriptor: {...dataDescriptorJson, ivk}}])
    if (decryptResult.error) throw new Error(decryptResult.error.message)
    const decryptedData = decryptResult.result as any[]
    console.log('decryptedData:', JSON.stringify(decryptedData).substring(0, 500))
    const credentialData = decryptedData[0]?.['iDTG49YLqmkHMYRyuQBYgEyTByQwAzqGd6'] ??
        decryptedData[0]?.[IDENTITY_CREDENTIAL_PLAINLOGIN.vdxfid]
    if (!credentialData) throw new Error('Missing IDENTITY_CREDENTIAL_PLAINLOGIN in decrypted data')
    const credential = Credential.fromJson(credentialData)
    const plainLogin = credential.credential
    if (!Array.isArray(plainLogin) || plainLogin.length < 2) throw new Error('Invalid credential format')
    const [username, password] = plainLogin
    if (!username) throw new Error('Missing username in credential')
    if (!password) throw new Error('Missing password in credential')
    console.log('Login flow complete for:', identityName)
    res.status(200).json({username, password, signingId, identityName})
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Failed to complete login flow:', error.message)
    res.status(500).json({error: error.message})
  }
})

genericLoginRouter.post('/decrypt-contentmap', async (req, res) => {
  const {datadescriptor, ivk} = req.body
  if (!datadescriptor || !ivk) { res.status(400).json({error: 'datadescriptor and ivk are required'}); return }
  try {
    const result = await callRPCDaemon(verusDaemonConfig, 'decryptdata', [{datadescriptor: {...datadescriptor, ivk}}])
    if (result.error) throw new Error((result.error as any).message)
    res.status(200).json(result.result)
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error('Failed to decrypt contentmap entry:', error.message)
    res.status(500).json({error: error.message})
  }
})

export {genericLoginRouter}