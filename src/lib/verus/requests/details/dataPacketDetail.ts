import BN from 'bn.js'
import {
  type CompactIAddressObject,
  type DataDescriptor,
  DataPacketRequestDetails,
  DataPacketRequestOrdinalVDXFObject,
  type DataResponseOrdinalVDXFObject,
  type GenericRequest,
  SignatureData,
  SignatureDataKey,
  VdxfUniValue,
} from 'verus-typescript-primitives'

import {generateRequestID} from '#/lib/verus/addresses'

export interface DataPacketRequestOptions {
  signableObjects: Array<DataDescriptor | string>
  statements?: string[]
  requestID?: CompactIAddressObject
}

export function generateDataPacketRequestOrdinal(
  options: DataPacketRequestOptions,
): DataPacketRequestOrdinalVDXFObject {
  const detail = new DataPacketRequestDetails({
    flags: new BN(0),
    signableObjects: options.signableObjects,
    statements: options.statements,
    requestID: options.requestID ?? generateRequestID(),
  })

  detail.setFlags()
  detail.flags = detail.flags.or(
    DataPacketRequestDetails.FLAG_FOR_USERS_SIGNATURE,
  )

  if (!detail.isValid()) {
    throw new Error('Generated DataPacketRequestDetails is not valid')
  }

  return new DataPacketRequestOrdinalVDXFObject({data: detail})
}

// Finds the data packet response based on their corresponding detail in the request
// and extracts the signature within the vdxf data.
export function extractDataPacketSignatures({
  request,
  dataResponseMap,
}: {
  request: GenericRequest
  dataResponseMap: Map<string, DataResponseOrdinalVDXFObject>
}): SignatureData[] {
  const dataPacketRequestID = request.details.find(
    (ordinal): ordinal is DataPacketRequestOrdinalVDXFObject =>
      ordinal instanceof DataPacketRequestOrdinalVDXFObject,
  )?.data.requestID

  if (!dataPacketRequestID) {
    throw new Error('Missing request ID for the data packet in the request')
  }

  const dataPacketOrdinal = dataResponseMap.get(
    dataPacketRequestID.toIAddress(),
  )

  if (!dataPacketOrdinal) {
    throw new Error('Missing data packet ordinal in VerusID response')
  }

  const vdxfUniValue = new VdxfUniValue()
  vdxfUniValue.fromBuffer(dataPacketOrdinal.data.data.objectdata)

  const signatures: SignatureData[] = []

  for (const value of vdxfUniValue.values) {
    const signatureData = value[SignatureDataKey.vdxfid]
    if (signatureData instanceof SignatureData) {
      signatures.push(signatureData)
    }
  }

  if (signatures.length === 0) {
    throw new Error('Missing signatures in VerusID response')
  }

  return signatures
}
