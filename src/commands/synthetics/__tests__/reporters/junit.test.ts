// tslint:disable: no-string-literal
import {promises as fs} from 'fs'
import {Writable} from 'stream'

import {BaseContext} from 'clipanion/lib/advanced'

import {Result} from '../../interfaces'

import {RunTestCommand} from '../../command'
import {Args, getDefaultStats, JUnitReporter, XMLTestCase} from '../../reporters/junit'
import {
  BATCH_ID,
  getApiTest,
  getBrowserResult,
  getBrowserServerResult,
  getMultiStep,
  getMultiStepsServerResult,
  getStep,
  getSummary,
  MOCK_BASE_URL,
} from '../fixtures'

const globalTestMock = getApiTest('123-456-789')
const globalStepMock = getStep()
const globalResultMock = getBrowserResult('1', globalTestMock)
const globalSummaryMock = getSummary()

describe('Junit reporter', () => {
  const writeMock: Writable['write'] = jest.fn()
  const commandMock: Args = {
    context: ({stdout: {write: writeMock}} as unknown) as BaseContext,
    jUnitReport: 'junit',
    runName: 'Test Suite name',
  }

  let reporter: JUnitReporter

  describe('constructor', () => {
    beforeEach(() => {
      reporter = new JUnitReporter(commandMock as RunTestCommand)
    })

    it("should append '.xml' to destination if isn't there", () => {
      expect(reporter['destination']).toBe('junit.xml')
    })

    it('should give a default run name', () => {
      expect(new JUnitReporter({...commandMock, runName: undefined})['json'].testsuites.$.name).toBe('Undefined run')
    })
  })

  describe('runEnd', () => {
    beforeEach(() => {
      reporter = new JUnitReporter(commandMock as RunTestCommand)
      jest.spyOn(fs, 'writeFile')
      jest.spyOn(reporter['builder'], 'buildObject')
    })

    it('should build the xml', async () => {
      await reporter.runEnd(globalSummaryMock, MOCK_BASE_URL)
      expect(reporter['builder'].buildObject).toHaveBeenCalledWith(reporter['json'])
      expect(fs.writeFile).toHaveBeenCalledWith('junit.xml', expect.any(String), 'utf8')
      expect(writeMock).toHaveBeenCalledTimes(1)

      // Cleaning
      await fs.unlink(reporter['destination'])
    })

    it('should gracefully fail', async () => {
      jest.spyOn(reporter['builder'], 'buildObject').mockImplementation(() => {
        throw new Error('Fail')
      })

      await reporter.runEnd(globalSummaryMock, MOCK_BASE_URL)

      expect(fs.writeFile).not.toHaveBeenCalled()
      expect(writeMock).toHaveBeenCalledTimes(1)
    })

    it('should create the file', async () => {
      reporter['destination'] = 'junit/report.xml'
      await reporter.runEnd(globalSummaryMock, MOCK_BASE_URL)
      const stat = await fs.stat(reporter['destination'])
      expect(stat).toBeDefined()

      // Cleaning
      await fs.unlink(reporter['destination'])
      await fs.rmdir('junit')
    })

    it('should not throw on existing directory', async () => {
      await fs.mkdir('junit')
      reporter['destination'] = 'junit/report.xml'
      await reporter.runEnd(globalSummaryMock, MOCK_BASE_URL)

      // Cleaning
      await fs.unlink(reporter['destination'])
      await fs.rmdir('junit')
    })

    it('testsuites contains summary properties', async () => {
      jest.spyOn(fs, 'writeFile').mockResolvedValueOnce()

      await reporter.runEnd(
        {
          ...globalSummaryMock,
          criticalErrors: 1,
          failed: 2,
          failedNonBlocking: 3,
          passed: 4,
          skipped: 5,
          testsNotFound: new Set(['a', 'b', 'c']),
          timedOut: 6,
        },
        MOCK_BASE_URL
      )
      expect(reporter['json'].testsuites.$).toStrictEqual({
        batch_id: BATCH_ID,
        batch_url: `${MOCK_BASE_URL}synthetics/explorer/ci?batchResultId=${BATCH_ID}`,
        name: 'Test Suite name',
        tests_critical_error: 1,
        tests_failed: 2,
        tests_failed_non_blocking: 3,
        tests_not_found: 3,
        tests_passed: 4,
        tests_skipped: 5,
        tests_timed_out: 6,
      })
    })
  })

  describe('resultEnd', () => {
    beforeEach(() => {
      reporter = new JUnitReporter(commandMock as RunTestCommand)
    })

    it('should give a default suite name', () => {
      reporter.resultEnd(globalResultMock, '')
      const testsuite = reporter['json'].testsuites.testsuite[0]
      expect(testsuite.$.name).toBe('Undefined suite')
    })

    it('should use the same report for tests from same suite', () => {
      const result = {...globalResultMock, test: {suite: 'Suite 1', ...globalTestMock}}
      reporter.resultEnd(result, '')
      expect(reporter['json'].testsuites.testsuite.length).toBe(1)
    })

    it('should add stats to the run', () => {
      reporter.resultEnd(globalResultMock, '')
      const testsuite = reporter['json'].testsuites.testsuite[0]
      expect(testsuite.$).toMatchObject(getDefaultStats())
    })

    it('should report errors', () => {
      const browserResult1: Result = {
        ...globalResultMock,
        result: {
          ...getBrowserServerResult(),
          stepDetails: [
            {
              ...getStep(),
              allowFailure: true,
              browserErrors: [
                {
                  description: 'error description',
                  name: 'error name',
                  type: 'error type',
                },
                {
                  description: 'error description',
                  name: 'error name',
                  type: 'error type',
                },
              ],
              error: 'error',
              warnings: [
                {
                  message: 'warning message',
                  type: 'warning type',
                },
              ],
            },
            getStep(),
          ],
        },
      }
      const browserResult2: Result = {
        ...globalResultMock,
        result: getBrowserServerResult(),
      }
      const browserResult3: Result = {
        ...globalResultMock,
        result: {...getBrowserServerResult(), failure: {code: 'TIMEOUT', message: 'Result timed out'}},
        timedOut: true,
      }
      const apiResult: Result = {
        ...globalResultMock,
        result: {
          ...getMultiStepsServerResult(),
          steps: [
            {
              ...getMultiStep(),
              failure: {
                code: '1',
                message: 'message',
              },
            },
          ],
        },
      }
      reporter.resultEnd(browserResult1, '')
      reporter.resultEnd(browserResult2, '')
      reporter.resultEnd(browserResult3, '')
      reporter.resultEnd(apiResult, '')
      const testsuite = reporter['json'].testsuites.testsuite[0]
      const results = [
        [1, 2, 0, 1],
        [0, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 1, 0],
      ]
      const entries: [any, XMLTestCase][] = Object.entries(testsuite.testcase)
      for (const [i, testcase] of entries) {
        const result = results[i]
        expect(testcase.allowed_error.length).toBe(result[0])
        expect(testcase.browser_error.length).toBe(result[1])
        expect(testcase.error.length).toBe(result[2])
        expect(testcase.warning.length).toBe(result[3])
      }
    })
  })

  describe('getTestCase', () => {
    it('should add stats to the suite', () => {
      const resultMock = {
        ...globalResultMock,
        ...{
          result: {
            ...globalResultMock.result,
            stepDetails: [
              globalStepMock,
              {
                ...globalStepMock,
                ...{
                  browserErrors: [{type: 'error', name: 'Error', description: 'Description'}],
                  error: 'Error',
                  subTestStepDetails: [globalStepMock],
                  warnings: [{type: 'warning', message: 'Warning'}],
                },
              },
            ],
          },
        },
      }
      const suite = reporter['getTestCase'](resultMock, MOCK_BASE_URL)
      expect(suite.$).toMatchObject({
        ...getDefaultStats(),
        errors: 2,
        failures: 1,
        tests: 3,
        warnings: 1,
      })
    })
  })
})
