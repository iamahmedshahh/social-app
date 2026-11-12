import {Linking} from 'react-native'

import {IS_WEB} from '#/env'

// Opens the wallet that handles verus:// links: Verus Desktop on a computer,
// Verus Mobile on a phone. Rejects on a phone with no Verus wallet installed.
export async function openVerusWallet(deeplinkUri: string): Promise<void> {
  if (IS_WEB) {
    window.location.href = deeplinkUri
    return
  }

  await Linking.openURL(deeplinkUri)
}
