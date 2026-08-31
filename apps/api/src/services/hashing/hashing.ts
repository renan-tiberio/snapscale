import { createHash } from 'node:crypto'

/** One digest for everything this service hashes: OTP codes and `processed_images.params_hash`. */
const HASH_ALGORITHM = 'sha256'

type HashHexParams = {
  readonly value: string
}

export const hashHex = ({ value }: HashHexParams): string =>
  createHash(HASH_ALGORITHM).update(value).digest('hex')
