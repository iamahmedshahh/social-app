import {Router} from 'express'

import {genericLoginRouter} from './v2/index'
import {identityUpdateRouter} from './v2/identityUpdateRouter'

const router = Router()

router.use('/genericlogin', genericLoginRouter)
router.use('/identityupdates', identityUpdateRouter)

export {router as v2Router}