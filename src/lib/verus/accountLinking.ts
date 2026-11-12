import {SignatureData} from 'verus-typescript-primitives'
import {type VerusIdInterface} from 'verusid-ts-client'

import {processIAddress} from '#/lib/verus/addresses'
import {getServiceSystem} from '#/lib/verus/serviceSystem'
import {createHash} from '#/platform/crypto'
import {app} from '#/lexicons'
import * as bsky from '#/types/bsky'

export interface VerusIdLink {
  message: string
  identity: string
  signature: string
  postUri: string
}

function findVerusIdLink(
  posts: app.bsky.feed.defs.PostView[],
  linkIdentifier: string,
  handle: string,
): VerusIdLink | null {
  // The link is in the format of
  // linkId 1: controller of VerusID '${name}' controls ${handle}:${signature}
  // Message part is everything before the signature.
  const regexSafeHandle = handle.replace(/\./g, '\\.')
  const verusIdLinkPattern = new RegExp(
    `(${linkIdentifier} 1: controller of VerusID ["']([^"']+)["'] controls ${regexSafeHandle}):(\\S+)`,
    'm',
  )

  for (const post of posts) {
    const record = bsky.matches(app.bsky.feed.post, post.record)
      ? post.record
      : undefined

    if (record) {
      const text = record.text
      if (text) {
        const match = text.match(verusIdLinkPattern)

        if (match) {
          return {
            message: match[1],
            identity: match[2],
            signature: match[3],
            postUri: post.uri,
          }
        }
      }
    }
  }

  return null
}

/**
 * Verus Mobile signs a hash of
 * the message bound to the identity, system and block height, previous methods such as signing the message directly
 * dont work
 */
export async function verifyVerusIdLink(
  verusIdInterface: VerusIdInterface,
  {identity, message, signature}: Omit<VerusIdLink, 'postUri'>,
): Promise<boolean> {
  try {
    const {chain, systemID} = getServiceSystem(verusIdInterface)
    const identityID = processIAddress(identity, chain)

    const {version, hashtype, height} = await verusIdInterface.getSignatureInfo(
      identityID,
      signature,
      systemID,
    )
    const identityHash = new SignatureData({
      systemID,
      identityID,
      signatureHash: createHash('sha256').update(message).digest(),
    }).getIdentityHash({version, hash_type: hashtype, height})

    return await verusIdInterface.verifyHash(
      identityID,
      signature,
      identityHash,
      undefined,
      systemID,
    )
  } catch (error) {
    console.error('Failed to verify VerusID link:', error)
    throw error
  }
}

export async function checkIfLinkedVerusID(
  posts: app.bsky.feed.defs.PostView[],
  linkIdentifier: string,
  verusIdInterface: VerusIdInterface,
  handle?: string,
): Promise<VerusIdLink | null> {
  if (!handle) {
    throw new Error('No handle provided to check the linked VerusID')
  }

  const link = findVerusIdLink(posts, linkIdentifier, handle)

  if (!link) {
    return null
  }

  const verified = await verifyVerusIdLink(verusIdInterface, link)

  if (!verified) {
    return null
  }

  return link
}
