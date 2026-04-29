import {useCallback, useEffect, useRef, useState} from 'react'
import {Linking, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {toBase58Check} from 'verus-typescript-primitives'

import {LOCAL_DEV_VSKY_SERVER} from '#/lib/constants'
import {cleanError, isNetworkError} from '#/lib/strings/errors'
import {logger} from '#/logger'
import {useSession} from '#/state/session'
import {atoms as a, web} from '#/alf'
import {Admonition} from '#/components/Admonition'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {useGlobalDialogsControlContext} from '#/components/dialogs/Context'
import * as TextField from '#/components/forms/TextField'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {IS_NATIVE, IS_WEB} from '#/env'
import {QrCodeInner} from '../StarterPack/QrCode'

enum Stages {
  UpdateCredentials = 'UpdateCredentials',
  AwaitingResponse = 'AwaitingResponse',
  Done = 'Done',
}

export function useVerusIdCredentialUpdateDialogControl() {
  return useGlobalDialogsControlContext().verusIdCredentialUpdateDialogControl
}

export function VerusIDCredentialUpdateDialog() {
  const {_} = useLingui()
  const control = useVerusIdCredentialUpdateDialogControl()

  const onClose = useCallback(() => {
    control.clear()
  }, [control])

  return (
    <Dialog.Outer control={control.control} onClose={onClose}>
      <Dialog.Handle />
      <Dialog.ScrollableInner
        label={_(msg`Update VerusID Sign in Credentials`)}
        style={web({maxWidth: 400})}>
        <Inner initialPassword={control.value?.password} />
        <Dialog.Close />
      </Dialog.ScrollableInner>
    </Dialog.Outer>
  )
}

function Inner({initialPassword}: {initialPassword?: string}) {
  const {_} = useLingui()
  const {currentAccount} = useSession()
  const control = Dialog.useDialogContext()

  const [stage, setStage] = useState(Stages.UpdateCredentials)
  const [isProcessing, setIsProcessing] = useState(false)
  const [email, setEmail] = useState(currentAccount?.email || '')
  const [password, setPassword] = useState(initialPassword || '')
  const [error, setError] = useState('')
  const [deeplinkUri, setDeeplinkUri] = useState('')
  const [qrString, setQrString] = useState('')
  const [requestId, setRequestId] = useState('')

  // Identity name from current session
  const identityName =
    currentAccount?.type === 'vsky' ? currentAccount.name + '@' : ''

  // Poll for update response
  useEffect(() => {
    if (stage !== Stages.AwaitingResponse || !requestId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `${LOCAL_DEV_VSKY_SERVER}/api/v2/identityupdates/get-update-response?requestId=${encodeURIComponent(requestId)}`,
        )

        if (res.status === 200) {
          clearInterval(interval)
          setStage(Stages.Done)
          setIsProcessing(false)
          logger.debug('Successfully updated VerusSky credentials')
        }
      } catch (e) {
        // keep polling
      }
    }, 1500)

    return () => clearInterval(interval)
  }, [stage, requestId])

  const onUpdateCredentials = async () => {
    if (!email.trim()) {
      setError(_(msg`Please enter your email`))
      return
    }
    if (!password.trim()) {
      setError(_(msg`Please enter your password`))
      return
    }
    if (!identityName) {
      setError(_(msg`No VerusID identity found for this account`))
      return
    }

    setError('')
    setIsProcessing(true)

    try {
      // Generate a requestId
      const randBytes = new Uint8Array(20)
      global.crypto.getRandomValues(randBytes)
      const newRequestId = toBase58Check(Buffer.from(randBytes), 102)

      const response = await fetch(
        `${LOCAL_DEV_VSKY_SERVER}/api/v2/identityupdates/sign-update-request`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            requestId: newRequestId,
            identityName,
            email,
            password,
          }),
        },
      )

      if (!response.ok) {
        const err = await response.json().catch(() => ({error: response.statusText}))
        throw new Error(err.error || 'Failed to sign update request')
      }

      const res = await response.json()

      if (res.error) throw new Error(res.error)

      setDeeplinkUri(res.deeplinkUri)
      setQrString(res.qrstring)
      setRequestId(newRequestId)
      setStage(Stages.AwaitingResponse)
    } catch (e: any) {
      const errMsg = e.toString()
      logger.warn('Failed to initiate credential update', {error: errMsg})
      if (isNetworkError(e)) {
        setError(_(msg`Unable to contact the service. Please check your Internet connection.`))
      } else {
        setError(cleanError(errMsg))
      }
      setIsProcessing(false)
    }
  }

  const onOpenDeeplink = async () => {
    if (!deeplinkUri) return

    if (IS_WEB) {
      window.location.href = deeplinkUri
    } else {
      try {
        const canOpen = await Linking.canOpenURL(deeplinkUri)
        if (canOpen) {
          await Linking.openURL(deeplinkUri)
        } else {
          setError(_(msg`Unable to open Verus Mobile. Please ensure it is installed.`))
        }
      } catch (e: any) {
        logger.warn('Failed to open Verus Mobile deeplink', {error: e.toString()})
        setError(_(msg`Failed to open Verus Mobile.`))
      }
    }
  }

  const uiStrings = {
    [Stages.UpdateCredentials]: {
      title: currentAccount?.type === 'vsky'
        ? _(msg`Update VerusID sign in`)
        : _(msg`Save sign in with VerusID`),
      message: currentAccount?.type === 'vsky'
        ? _(msg`Update the sign in credentials stored in your VerusID.`)
        : _(msg`Add your sign in credentials to your VerusID for seamless logins.`),
    },
    [Stages.AwaitingResponse]: {
      title: _(msg`Awaiting confirmation`),
      message: IS_NATIVE
        ? _(msg`Press Open Verus Mobile to confirm the credential update.`)
        : _(msg`Scan the QR code below or press Open Verus Wallet to confirm.`),
    },
    [Stages.Done]: {
      title: _(msg`Update confirmed`),
      message: _(msg`Your VerusID sign in credentials have been updated.`),
    },
  }

  return (
    <View style={[a.gap_xl]}>
      <View style={[a.gap_sm]}>
        <Text style={[a.font_bold, a.text_2xl]}>{uiStrings[stage].title}</Text>
        <Text style={[a.text_md, a.leading_snug]}>{uiStrings[stage].message}</Text>
        {error ? <Admonition type="error">{error}</Admonition> : null}
      </View>

      {stage === Stages.UpdateCredentials && (
        <View style={[a.gap_md]}>
          <View>
            <TextField.LabelText>
              <Trans>Email</Trans>
            </TextField.LabelText>
            <TextField.Root>
              <TextField.Input
                label={_(msg`Email`)}
                placeholder={_(msg`alice@example.com`)}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
              />
            </TextField.Root>
          </View>
          <View>
            <TextField.LabelText>
              <Trans>Password</Trans>
            </TextField.LabelText>
            <TextField.Root>
              <TextField.Input
                label={_(msg`Password`)}
                placeholder={_(msg`Your Bluesky password`)}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
              />
            </TextField.Root>
          </View>
        </View>
      )}

      {stage === Stages.AwaitingResponse && IS_WEB && qrString && (
        <View style={[a.align_center, a.py_lg]}>
          <QrCodeInner link={qrString} useBackupSVG={false} />
        </View>
      )}

      <View style={[a.gap_sm]}>
        {stage === Stages.UpdateCredentials && (
          <Button
            label={_(msg`Update credentials`)}
            color="primary"
            size="large"
            disabled={isProcessing}
            onPress={onUpdateCredentials}>
            <ButtonText>
              <Trans>Update credentials</Trans>
            </ButtonText>
            {isProcessing && <ButtonIcon icon={Loader} />}
          </Button>
        )}

        {stage === Stages.AwaitingResponse && (
          <>
            <Button
              label={_(msg`Open Verus Mobile`)}
              color="primary"
              size="large"
              disabled={isProcessing}
              onPress={onOpenDeeplink}>
              <ButtonText>
                {IS_NATIVE
                  ? <Trans>Open Verus Mobile</Trans>
                  : <Trans>Open Verus Wallet</Trans>}
              </ButtonText>
              {isProcessing && <ButtonIcon icon={Loader} />}
            </Button>
            <Button
              label={_(msg`Cancel`)}
              color="secondary"
              size="large"
              onPress={() => {
                setStage(Stages.UpdateCredentials)
                setRequestId('')
                setDeeplinkUri('')
                setQrString('')
              }}>
              <ButtonText>
                <Trans>Cancel</Trans>
              </ButtonText>
            </Button>
          </>
        )}

        {stage === Stages.Done && (
          <Button
            label={_(msg`Close`)}
            color="primary"
            size="large"
            onPress={() => control.close()}>
            <ButtonText>
              <Trans>Close</Trans>
            </ButtonText>
          </Button>
        )}
      </View>
    </View>
  )
}