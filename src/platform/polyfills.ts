import 'react-native-get-random-values'
import 'fast-text-encoding'

export {}

// Fix Buffer in react native.
global.Buffer = global.Buffer || require('buffer').Buffer
