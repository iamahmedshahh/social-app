import React, {useCallback, useEffect, useRef, useState} from 'react'
import {Keyboard, Linking, type TextInput, View} from 'react-native'
import {
  ComAtprotoServerCreateSession,
  type ComAtprotoServerDescribeServer,
} from '@atproto/api'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {toBase58Check} from 'verus-typescript-primitives'

import {LOCAL_DEV_VSKY_SERVER} from '#/lib/constants'
import {useRequestNotificationsPermission} from '#/lib/notifications/notifications'
import {cleanError, isNetworkError} from '#/lib/strings/errors'
import {createFullHandle} from '#/lib/strings/handles'
import {logger} from '#/logger'
import {emitVerusIDLoginCompleted} from '#/state/events'
import {useSetHasCheckedForStarterPack} from '#/state/preferences/used-starter-packs'
import {useGenericLoginQuery} from '#/state/queries/verus/useGenericLoginQuery'
import {useSessionApi} from '#/state/session'
import {type VskySession} from '#/state/session/types'
import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {atoms as a, ios, useTheme, web} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {useRemoveVerusIdAccountLinkDialogControl} from '#/components/dialogs/RemoveVerusIDAccountLinkDialog'
import {useVerusIdCredentialUpdateDialogControl} from '#/components/dialogs/VerusIDCredentialUpdateDialog'
import {FormError} from '#/components/forms/FormError'
import {HostingProvider} from '#/components/forms/HostingProvider'
import * as TextField from '#/components/forms/TextField'
import * as Toggle from '#/components/forms/Toggle'
import {At_Stroke2_Corner0_Rounded as At} from '#/components/icons/At'
import {Lock_Stroke2_Corner0_Rounded as Lock} from '#/components/icons/Lock'
import {Ticket_Stroke2_Corner0_Rounded as Ticket} from '#/components/icons/Ticket'
import {Loader} from '#/components/Loader'
import {QrCodeInner} from '#/components/StarterPack/QrCode'
import {Text} from '#/components/Typography'
import {IS_IOS, IS_NATIVE, IS_WEB} from '#/env'
import {VERUSSKY_CONFIG} from '#/env/verussky'
import {FormContainer} from './FormContainer'

type ServiceDescription = ComAtprotoServerDescribeServer.OutputSchema

export const LoginForm = ({
  error,
  serviceUrl,
  serviceDescription,
  initialHandle,
  setError,
  setServiceUrl,
  onPressRetryConnect,
  onPressBack,
  onPressForgotPassword,
  onAttemptSuccess,
  onAttemptFailed,
}: {
  error: string
  serviceUrl: string
  serviceDescription: ServiceDescription | undefined
  initialHandle: string
  setError: (v: string) => void
  setServiceUrl: (v: string) => void
  onPressRetryConnect: () => void
  onPressBack: () => void
  onPressForgotPassword: () => void
  onAttemptSuccess: () => void
  onAttemptFailed: () => void
}) => {
  const t = useTheme()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorField, setErrorField] = useState<
    'none' | 'identifier' | 'password' | '2fa'
  >('none')
  const [isVerusIdLogin, setIsVerusIdLogin] = useState<boolean>(
    VERUSSKY_CONFIG.defaultLoginVerusid,
  )
  const [saveLoginWithVerusId, setSaveLoginWithVerusId] =
    useState<boolean>(false)
  const [openRemoveVerusIdLinkDialog, setOpenRemoveVerusIdLinkDialog] =
    useState<boolean>(false)
  const [isAuthFactorTokenNeeded, setIsAuthFactorTokenNeeded] = useState(false)
  const identifierValueRef = useRef<string>(initialHandle || '')
  const passwordValueRef = useRef<string>('')
  const [authFactorToken, setAuthFactorToken] = useState('')
  const identifierRef = useRef<TextInput>(null)
  const vskySessionValueRef = useRef<VskySession>({auth: '', id: '', name: ''})
  const passwordRef = useRef<TextInput>(null)
  const hasFocusedOnce = useRef<boolean>(false)
  const verusIdLoginFailed = useRef<boolean>(false)
  const {_} = useLingui()
  const {login} = useSessionApi()
  const requestNotificationsPermission = useRequestNotificationsPermission()
  const {setShowLoggedOut} = useLoggedOutViewControls()
  const setHasCheckedForStarterPack = useSetHasCheckedForStarterPack()
  const updateVerusCredentialsControl =
    useVerusIdCredentialUpdateDialogControl()
  const removeVerusIdAccountLinkControl =
    useRemoveVerusIdAccountLinkDialogControl()

  const [loginUri, setLoginUri] = useState<string>('')
  const [qrString, setQrString] = useState<string>('')
  // useState instead of useRef so useGenericLoginQuery re-evaluates when requestId changes
  const [requestId, setRequestId] = useState<string>('')

  const {data: genericLoginResult, error: genericLoginError} =
    useGenericLoginQuery({
      requestId,
      enabled: isVerusIdLogin && requestId !== '',
    })

  const clearVskySessionValues = () => {
    vskySessionValueRef.current = {auth: '', id: '', name: ''}
  }

  useEffect(() => {
    const createAndSignLoginRequest = async () => {
      setIsProcessing(true)
      setLoginUri('')
      setQrString('')
      setRequestId('')

      try {
        const randBytes = new Uint8Array(20)
        global.crypto.getRandomValues(randBytes)
        const randID = Buffer.from(randBytes)
        const newRequestId = toBase58Check(randID, 102)

        const response = await fetch(
          `${LOCAL_DEV_VSKY_SERVER}/api/v2/genericlogin/sign-login-request`,
          {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({requestId: newRequestId}),
          },
        )

        if (!response.ok) {
          logger.warn('Failed to sign generic login request', {
            error: response.statusText,
          })
          setError('Failed to sign the login request using the signing server')
          setIsProcessing(false)
          return
        }

        const res = await response.json()
        console.log('LOGIN SERVER RESPONSE:', JSON.stringify(res))

        if (res.error) {
          logger.warn('Failed to sign generic login request', {
            error: res.error,
          })
          setError('Failed to sign the login request using the signing server')
          setIsProcessing(false)
          return
        }

        setLoginUri(res.deeplinkUri)
        setQrString(res.qrstring)
        setRequestId(newRequestId) // triggers useGenericLoginQuery to start polling
        setError('')
      } catch (e: any) {
        const errMsg = e.toString()
        logger.warn('Failed to create generic login request', {error: errMsg})
        setError(cleanError(errMsg))
        setRequestId('')
      }

      setIsProcessing(false)
    }

    if (isVerusIdLogin) {
      createAndSignLoginRequest()
    }
  }, [isVerusIdLogin, setError])

  const onPressSelectService = useCallback(() => {
    Keyboard.dismiss()
  }, [])

  const onPressNext = async () => {
    if (isProcessing) return
    Keyboard.dismiss()
    setError('')
    setErrorField('none')

    const identifier = identifierValueRef.current.toLowerCase().trim()
    const password = passwordValueRef.current
    const vskySession = vskySessionValueRef.current

    const validVerusIdLogin = vskySession.id !== '' && vskySession.name !== ''

    if (!identifier) {
      setError(_(msg`Please enter your username`))
      setErrorField('identifier')
      return
    }

    if (!password) {
      setError(_(msg`Please enter your password`))
      setErrorField('password')
      return
    }

    setIsProcessing(true)

    try {
      let fullIdent = identifier
      if (
        !identifier.includes('@') &&
        !identifier.includes('.') &&
        serviceDescription &&
        serviceDescription.availableUserDomains.length > 0
      ) {
        let matched = false
        for (const domain of serviceDescription.availableUserDomains) {
          if (fullIdent.endsWith(domain)) {
            matched = true
          }
        }
        if (!matched) {
          fullIdent = createFullHandle(
            identifier,
            serviceDescription.availableUserDomains[0],
          )
        }
      }

      await login(
        {
          service: serviceUrl,
          identifier: fullIdent,
          password,
          authFactorToken: authFactorToken.trim(),
          vskySession: validVerusIdLogin ? vskySession : undefined,
        },
        'LoginForm',
      )

      const isManualLoginAfterVskyFailed = verusIdLoginFailed.current

      onAttemptSuccess()
      setShowLoggedOut(false)
      setHasCheckedForStarterPack(true)
      requestNotificationsPermission('Login')

      if (isManualLoginAfterVskyFailed) {
        logger.debug(
          'Successfully logged in manually after VerusID login failed',
        )
      }

      if (saveLoginWithVerusId) {
        setTimeout(() => {
          updateVerusCredentialsControl.open({
            password: passwordValueRef.current,
            openRemoveAccountLinkDialog: openRemoveVerusIdLinkDialog,
          })
        }, 750)
      } else if (openRemoveVerusIdLinkDialog) {
        setTimeout(() => {
          removeVerusIdAccountLinkControl.open()
        }, 250)
      } else if (validVerusIdLogin) {
        setTimeout(() => {
          emitVerusIDLoginCompleted()
        }, 250)
      }
    } catch (e: any) {
      const errMsg = e.toString()
      setIsProcessing(false)
      if (
        e instanceof ComAtprotoServerCreateSession.AuthFactorTokenRequiredError
      ) {
        setIsAuthFactorTokenNeeded(true)
      } else {
        onAttemptFailed()
        if (errMsg.includes('Token is invalid')) {
          logger.debug('Failed to login due to invalid 2fa token', {
            error: errMsg,
          })
          setError(_(msg`Invalid 2FA confirmation code.`))
          setErrorField('2fa')
        } else if (
          errMsg.includes('Authentication Required') ||
          errMsg.includes('Invalid identifier or password')
        ) {
          logger.debug('Failed to sign in due to invalid credentials', {
            error: errMsg,
          })
          if (isVerusIdLogin) {
            verusIdLoginFailed.current = true
            setSaveLoginWithVerusId(true)
            setIsVerusIdLogin(false)
            setError(
              _(
                msg`Unable to verify Bluesky credentials. Please sign in manually.`,
              ),
            )
          } else {
            setError(_(msg`Incorrect username or password`))
          }
        } else if (isNetworkError(e)) {
          logger.warn('Failed to sign in due to network error', {
            error: errMsg,
          })
          setError(
            _(
              msg`Unable to contact your service. Please check your Internet connection.`,
            ),
          )
        } else {
          logger.warn('Failed to sign in', {error: errMsg})
          setError(cleanError(errMsg))
        }
      }
    }
  }

  const startVskyLogin = async () => {
    if (isProcessing || !loginUri) return

    if (IS_WEB) {
      window.location.href = loginUri
    } else {
      try {
        const canOpen = await Linking.canOpenURL(loginUri)
        if (canOpen) {
          await Linking.openURL(loginUri)
        } else {
          setError(
            _(
              msg`Unable to open Verus Mobile. Please ensure it is installed.`,
            ),
          )
        }
      } catch (e: any) {
        logger.warn('Failed to open Verus Mobile deeplink', {
          error: e.toString(),
        })
        setError(_(msg`Failed to open Verus Mobile.`))
      }
    }
  }

  useEffect(() => {
    if (!genericLoginResult) return

    try {
      setIsProcessing(true)

      vskySessionValueRef.current = {
        auth: '',
        id: genericLoginResult.signingId,
        name: genericLoginResult.identityName,
      }

      identifierValueRef.current = genericLoginResult.username
      passwordValueRef.current = genericLoginResult.password
    } catch (e: any) {
      setError(
        _(msg`Failed to process VerusID login. Please sign in manually.`),
      )
      verusIdLoginFailed.current = true
      setSaveLoginWithVerusId(true)
      setIsVerusIdLogin(false)
      setIsProcessing(false)
      onAttemptFailed()
      return
    }

    setIsProcessing(false)
    onPressNext()

    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genericLoginResult])

  useEffect(() => {
    if (!genericLoginError) return

    const errMsg = (genericLoginError as Error).message
    logger.warn('Failed to complete generic login', {error: errMsg})

    if (errMsg.includes('No credential found in contentmultimap')) {
      setError(
        _(
          msg`No VerusID credentials found. Please sign in manually and save your login with VerusID.`,
        ),
      )
    } else if (errMsg.includes('decrypt')) {
      setError(
        _(
          msg`Failed to decrypt VerusID credentials. Please sign in manually.`,
        ),
      )
    } else {
      setError(cleanError(errMsg))
    }

    verusIdLoginFailed.current = true
    setSaveLoginWithVerusId(true)
    setIsVerusIdLogin(false)
    setIsProcessing(false)
    onAttemptFailed()
  }, [genericLoginError, _, setError, onAttemptFailed])

  return (
    <FormContainer testID="loginForm" titleText={<Trans>Sign in</Trans>}>
      <View>
        <TextField.LabelText>
          <Trans>Account provider</Trans>
        </TextField.LabelText>
        <HostingProvider
          serviceUrl={serviceUrl}
          onSelectServiceUrl={url => {
            setServiceUrl(url)
            verusIdLoginFailed.current = false
            clearVskySessionValues()
          }}
          onOpenDialog={onPressSelectService}
        />
      </View>
      {!isVerusIdLogin ? (
        <>
          <View>
            <TextField.LabelText>
              <Trans>Account</Trans>
            </TextField.LabelText>
            <View style={[a.gap_sm]}>
              <TextField.Root isInvalid={errorField === 'identifier'}>
                <TextField.Icon icon={At} />
                <TextField.Input
                  testID="loginUsernameInput"
                  inputRef={identifierRef}
                  label={_(msg`Username or email address`)}
                  autoCapitalize="none"
                  autoFocus={!IS_IOS}
                  autoCorrect={false}
                  autoComplete="username"
                  returnKeyType="next"
                  textContentType="username"
                  defaultValue={
                    verusIdLoginFailed.current ? '' : initialHandle || ''
                  }
                  onChangeText={v => {
                    identifierValueRef.current = v
                    if (errorField) setErrorField('none')
                  }}
                  onSubmitEditing={() => {
                    passwordRef.current?.focus()
                  }}
                  blurOnSubmit={false}
                  editable={!isProcessing}
                  accessibilityHint={_(
                    msg`Enter the username or email address you used when you created your account`,
                  )}
                />
              </TextField.Root>

              <TextField.Root isInvalid={errorField === 'password'}>
                <TextField.Icon icon={Lock} />
                <TextField.Input
                  testID="loginPasswordInput"
                  inputRef={passwordRef}
                  label={_(msg`Password`)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  returnKeyType="done"
                  enablesReturnKeyAutomatically={true}
                  secureTextEntry={true}
                  clearButtonMode="while-editing"
                  onChangeText={v => {
                    passwordValueRef.current = v
                    if (errorField) setErrorField('none')
                  }}
                  onSubmitEditing={onPressNext}
                  blurOnSubmit={false}
                  editable={!isProcessing}
                  accessibilityHint={_(msg`Enter your password`)}
                  onLayout={ios(() => {
                    if (hasFocusedOnce.current) return
                    hasFocusedOnce.current = true
                    identifierRef.current?.focus()
                  })}
                />
                <Button
                  testID="forgotPasswordButton"
                  onPress={onPressForgotPassword}
                  label={_(msg`Forgot password?`)}
                  accessibilityHint={_(msg`Opens password reset form`)}
                  variant="solid"
                  color="secondary"
                  style={[
                    a.rounded_sm,
                    {marginLeft: 'auto', left: 6, padding: 6},
                    a.z_10,
                  ]}>
                  <ButtonText>
                    <Trans>Forgot?</Trans>
                  </ButtonText>
                </Button>
              </TextField.Root>
            </View>
          </View>
          <Toggle.Item
            label={_(msg`Save Login with VerusID`)}
            name="saveLoginWithVerusID"
            value={saveLoginWithVerusId}
            onChange={setSaveLoginWithVerusId}
            style={[a.mt_md]}>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <Toggle.Platform />
              <Text style={[a.text_md]}>
                <Trans>Save my sign in with VerusID</Trans>
              </Text>
            </View>
          </Toggle.Item>
          <Toggle.Item
            label={_(msg`Remove linked VerusID`)}
            name="removeLinkedVerusID"
            value={openRemoveVerusIdLinkDialog}
            onChange={setOpenRemoveVerusIdLinkDialog}
            style={[a.mt_sm]}>
            <View style={[a.flex_row, a.align_center, a.gap_sm]}>
              <Toggle.Platform />
              <Text style={[a.text_md]}>
                <Trans>Remove linked VerusID</Trans>
              </Text>
            </View>
          </Toggle.Item>
        </>
      ) : (
        <View>
          <TextField.LabelText>
            <Trans>VerusID Sign in</Trans>
          </TextField.LabelText>
          <Text
            style={[
              a.text_sm,
              t.atoms.text_contrast_medium,
              a.mt_xs,
              a.mb_sm,
            ]}>
            <Trans>
              {IS_NATIVE
                ? 'Press Sign in to open Verus Mobile'
                : 'Scan the QR code below or press Sign in to continue'}
            </Trans>
          </Text>
          {IS_WEB && qrString && (
            <View style={[a.align_center, a.py_lg]}>
              <QrCodeInner link={qrString} useBackupSVG={false} />
            </View>
          )}
        </View>
      )}
      {isAuthFactorTokenNeeded && (
        <View>
          <TextField.LabelText>
            <Trans>2FA Confirmation</Trans>
          </TextField.LabelText>
          <TextField.Root isInvalid={errorField === '2fa'}>
            <TextField.Icon icon={Ticket} />
            <TextField.Input
              testID="loginAuthFactorTokenInput"
              label={_(msg`Confirmation code`)}
              autoCapitalize="none"
              autoFocus
              autoCorrect={false}
              autoComplete="one-time-code"
              returnKeyType="done"
              blurOnSubmit={false}
              value={authFactorToken}
              onChangeText={text => {
                setAuthFactorToken(text)
                if (errorField) setErrorField('none')
              }}
              onSubmitEditing={onPressNext}
              editable={!isProcessing}
              accessibilityHint={_(
                msg`Input the code which has been emailed to you`,
              )}
              style={{
                textTransform: authFactorToken === '' ? 'none' : 'uppercase',
              }}
            />
          </TextField.Root>
          <Text style={[a.text_sm, t.atoms.text_contrast_medium, a.mt_sm]}>
            <Trans>
              Check your email for a sign in code and enter it here.
            </Trans>
          </Text>
        </View>
      )}
      <FormError error={error} />
      <View style={[a.pt_md, web([a.justify_between, a.flex_row])]}>
        {IS_WEB && (
          <Button
            label={_(msg`Back`)}
            color="secondary"
            size="large"
            onPress={onPressBack}>
            <ButtonText>
              <Trans>Back</Trans>
            </ButtonText>
          </Button>
        )}
        {!serviceDescription && error ? (
          <Button
            testID="loginRetryButton"
            label={_(msg`Retry`)}
            accessibilityHint={_(msg`Retries signing in`)}
            color="primary_subtle"
            size="large"
            onPress={onPressRetryConnect}>
            <ButtonText>
              <Trans>Retry</Trans>
            </ButtonText>
          </Button>
        ) : !serviceDescription ? (
          <Button
            label={_(msg`Connecting to service...`)}
            size="large"
            color="secondary"
            disabled>
            <ButtonIcon icon={Loader} />
            <ButtonText>Connecting...</ButtonText>
          </Button>
        ) : (
          <View style={[a.flex_row, a.gap_sm]}>
            <Button
              testID="loginMethodSwitchButton"
              label={_(msg`Switch`)}
              accessibilityHint={_(msg`Switches login method`)}
              variant="solid"
              color="secondary"
              size="large"
              onPress={() => {
                setIsVerusIdLogin(!isVerusIdLogin)
                setLoginUri('')
                setQrString('')
                setRequestId('')
                setError('')
              }}>
              <ButtonText>
                {isVerusIdLogin ? (
                  <Trans>Sign in without VerusID</Trans>
                ) : (
                  <Trans>Sign in with VerusID</Trans>
                )}
              </ButtonText>
            </Button>
            <Button
              testID="loginNextButton"
              label={_(msg`Next`)}
              accessibilityHint={
                isVerusIdLogin
                  ? _(msg`Links to signing in on the same device`)
                  : _(msg`Navigates to the next screen`)
              }
              color="primary"
              size="large"
              onPress={isVerusIdLogin ? startVskyLogin : onPressNext}>
              <ButtonText>
                <Trans>Sign in</Trans>
              </ButtonText>
              {isProcessing && <ButtonIcon icon={Loader} />}
            </Button>
          </View>
        )}
      </View>
    </FormContainer>
  )
}