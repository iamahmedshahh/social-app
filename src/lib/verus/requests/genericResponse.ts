import {
  DataDescriptorOrdinalVDXFObject,
  DataResponseOrdinalVDXFObject,
  type GenericRequest,
  GenericResponse,
} from 'verus-typescript-primitives'

import {decryptDescriptor} from '#/lib/verus/zsupport/crypto'

// Throws an error unless the response answers this exact request. The signing server
// checks this too, but the app can't rely on a server receiving every reply.
export function assertResponseMatchesRequest(
  request: GenericRequest,
  response: GenericResponse,
) {
  const requestID = request.requestID?.toIAddress()

  if (!requestID || response.requestID?.toIAddress() !== requestID) {
    throw new Error('The VerusID response is for a different request')
  }

  if (
    !response.requestHash ||
    !request.getRawDataSha256().equals(response.requestHash)
  ) {
    throw new Error('The VerusID response does not match its request')
  }
}

/**
 * Returns the response with readable details. Wallets encrypt the details to
 * the request's encryptResponseToAddress. The signature covers the encrypted
 * details, so check the response before this step.
 */
export async function decryptResponseDetails(
  request: GenericRequest,
  response: GenericResponse,
  ivk: Buffer,
): Promise<GenericResponse> {
  if (!response.detailsAreEncrypted()) {
    // A request that names a reply address only accepts an encrypted reply.
    if (request.hasEncryptResponseToAddress()) {
      throw new Error('The VerusID response is not encrypted')
    }
    return response
  }

  const [encrypted] = response.details
  if (!(encrypted instanceof DataDescriptorOrdinalVDXFObject)) {
    throw new Error('The VerusID response has no encrypted details')
  }

  // The wallet wraps the details in a DataDescriptor before encrypting them.
  const descriptor = await decryptDescriptor({descriptor: encrypted.data, ivk})

  const decrypted = new GenericResponse()
  decrypted.fromBuffer(response.toBuffer())
  decrypted.flags = decrypted.flags.xor(
    GenericResponse.FLAG_DETAILS_ARE_ENCRYPTED,
  )
  decrypted.setDetailsFromBuffer(descriptor.objectdata)
  return decrypted
}

// Creates a map of data response ordinals to their request IDs for quick lookup.
export function buildDataResponseMap(
  response: GenericResponse,
): Map<string, DataResponseOrdinalVDXFObject> {
  const dataResponseMap = new Map<string, DataResponseOrdinalVDXFObject>()

  for (const ordinal of response.details) {
    if (
      ordinal instanceof DataResponseOrdinalVDXFObject &&
      ordinal.data.requestID
    ) {
      dataResponseMap.set(ordinal.data.requestID.toIAddress(), ordinal)
    }
  }

  return dataResponseMap
}
