import 'react-native-get-random-values'

// randomBytes implementation using getRandomValues (works on Hermes)
function randomBytes(size: number): Buffer {
  const bytes = new Uint8Array(size)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes)
}

const cryptoShim = {
  randomBytes,
  getRandomValues: (arr: Uint8Array) => crypto.getRandomValues(arr),
}

export default cryptoShim
