/**
 * Re-exports only, declaring nothing: the value objects own these rules, and `schemas/*` modules
 * sit two folders deep, where a `../../` import is banned and this package has no path alias.
 */
export { emailSchema } from '../value-objects/email/index.js'
export { OTP_CODE_LENGTH, OTP_CODE_PATTERN } from '../value-objects/otp-code/index.js'
