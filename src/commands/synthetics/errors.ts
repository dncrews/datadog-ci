/* tslint:disable:max-classes-per-file */
const nonCriticalErrorCodes = ['NO_TESTS_TO_RUN'] as const
export type NonCriticalCiErrorCode = typeof nonCriticalErrorCodes[number]

const criticalErrorCodes = [
  'AUTHORIZATION_ERROR',
  'MISSING_API_KEY',
  'MISSING_APP_KEY',
  'POLL_RESULTS_FAILED',
  'TOO_MANY_TESTS_TO_TRIGGER',
  'TRIGGER_TESTS_FAILED',
  'TUNNEL_START_FAILED',
  'UNAVAILABLE_TEST_CONFIG',
  'UNAVAILABLE_TUNNEL_CONFIG',
] as const
export type CriticalCiErrorCode = typeof criticalErrorCodes[number]

export type CiErrorCode = NonCriticalCiErrorCode | CriticalCiErrorCode

export class CiError extends Error {
  constructor(public code: CiErrorCode, message?: string) {
    super(message)
  }
}

export class CriticalError extends CiError {
  constructor(public code: CriticalCiErrorCode, message?: string) {
    super(code, message)
  }
}
