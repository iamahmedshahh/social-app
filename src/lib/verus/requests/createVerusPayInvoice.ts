import {
  BigNumber,
  DEST_ID,
  fromBase58Check,
  GenericRequest,
  TransferDestination,
  VerusPayInvoiceDetails,
  VerusPayInvoiceDetailsOrdinalVDXFObject,
} from 'verus-typescript-primitives'
import {type VerusIdInterface} from 'verusid-ts-client'

import {generateRequestID} from '#/lib/verus/addresses'
import {getServiceSystem} from '#/lib/verus/serviceSystem'

const AMOUNT_TO_SATS = 100000000 // 10^8
const MAX_ESTIMATED_SLIPPAGE = new BigNumber(0.05 * AMOUNT_TO_SATS, 10)

/**
 * Creates an unsigned VerusPay request. Wallets accept VerusPay requests
 * without a signature, so no signing server is needed.
 */
export function createVerusPayInvoiceRequest(
  verusIdInterface: VerusIdInterface,
  destinationId: string,
  currencyId: string,
  amount?: number,
): GenericRequest {
  const {isTestnet} = getServiceSystem(verusIdInterface)

  const details = new VerusPayInvoiceDetails({
    amount: amount ? new BigNumber(amount * AMOUNT_TO_SATS, 10) : undefined,
    destination: new TransferDestination({
      type: DEST_ID,
      destinationBytes: fromBase58Check(destinationId).hash,
    }),
    requestedcurrencyid: currencyId,
    maxestimatedslippage: MAX_ESTIMATED_SLIPPAGE,
  })

  details.setFlags({
    acceptsAnyAmount: !amount,
    // Conversions aren't allowed for unknown amounts.
    acceptsConversion: !!amount,
    isTestnet,
  })

  return new GenericRequest({
    requestID: generateRequestID(),
    createdAt: new BigNumber((Date.now() / 1000).toFixed(0)),
    details: [new VerusPayInvoiceDetailsOrdinalVDXFObject({data: details})],
    flags: isTestnet
      ? GenericRequest.BASE_FLAGS.or(GenericRequest.FLAG_IS_TESTNET)
      : GenericRequest.BASE_FLAGS,
  })
}
