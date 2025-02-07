// tslint:disable: no-string-literal
import {AxiosError, AxiosResponse} from 'axios'
import {Cli} from 'clipanion/lib/advanced'
import * as ciUtils from '../../../helpers/utils'
import * as api from '../api'
import {DEFAULT_COMMAND_CONFIG, DEFAULT_POLLING_TIMEOUT, RunTestCommand} from '../command'
import * as utils from '../utils'
import {getApiTest, getTestSuite, mockTestTriggerResponse} from './fixtures'

test('all option flags are supported', async () => {
  const options = [
    'apiKey',
    'appKey',
    'failOnCriticalErrors',
    'config',
    'datadogSite',
    'files',
    'failOnTimeout',
    'public-id',
    'search',
    'subdomain',
    'tunnel',
    'jUnitReport',
    'runName',
  ]

  const cli = new Cli()
  cli.register(RunTestCommand)
  const usage = cli.usage(RunTestCommand)

  options.forEach((option) => expect(usage).toContain(`--${option}`))
})

const getAxiosHttpError = (status: number, error: string) => {
  const serverError = new Error(error) as AxiosError
  serverError.response = {data: {errors: [error]}, status} as AxiosResponse
  serverError.config = {baseURL: 'baseURL', url: 'url'}

  return serverError
}

describe('run-test', () => {
  beforeEach(() => {
    process.env = {}
    jest.restoreAllMocks()
  })

  describe('resolveConfig', () => {
    beforeEach(() => {
      process.env = {}
    })

    test('override from ENV', async () => {
      const overrideEnv = {
        DATADOG_API_KEY: 'fake_api_key',
        DATADOG_APP_KEY: 'fake_app_key',
        DATADOG_SITE: 'datadoghq.eu',
        DATADOG_SUBDOMAIN: 'custom',
      }

      process.env = overrideEnv
      const command = new RunTestCommand()

      await command['resolveConfig']()
      expect(command['config']).toEqual({
        ...DEFAULT_COMMAND_CONFIG,
        apiKey: overrideEnv.DATADOG_API_KEY,
        appKey: overrideEnv.DATADOG_APP_KEY,
        datadogSite: overrideEnv.DATADOG_SITE,
        global: {pollingTimeout: DEFAULT_POLLING_TIMEOUT},
        subdomain: overrideEnv.DATADOG_SUBDOMAIN,
      })
    })

    test('override from config file', async () => {
      const overrideConfigFile = {
        apiKey: 'fake_api_key',
        appKey: 'fake_app_key',
        configPath: 'src/commands/synthetics/__tests__/config-fixtures/config-with-all-keys.json',
        datadogSite: 'datadoghq.eu',
        failOnCriticalErrors: true,
        failOnTimeout: false,
        files: ['my-new-file'],
        global: {locations: [], pollingTimeout: 2},
        locations: [],
        pollingTimeout: 1,
        proxy: {protocol: 'https'},
        publicIds: ['ran-dom-id'],
        subdomain: 'ppa',
        tunnel: true,
        variableStrings: [],
      }

      const command = new RunTestCommand()
      command.configPath = 'src/commands/synthetics/__tests__/config-fixtures/config-with-all-keys.json'

      await command['resolveConfig']()
      expect(command['config']).toEqual(overrideConfigFile)
    })

    test('override from CLI', async () => {
      const overrideCLI = {
        apiKey: 'fake_api_key',
        appKey: 'fake_app_key',
        configPath: 'src/commands/synthetics/__tests__/config-fixtures/empty-config-file.json',
        datadogSite: 'datadoghq.eu',
        failOnCriticalErrors: true,
        failOnTimeout: false,
        files: ['new-file'],
        publicIds: ['ran-dom-id'],
        subdomain: 'new-sub-domain',
        testSearchQuery: 'a-search-query',
        tunnel: true,
      }

      const command = new RunTestCommand()
      command['apiKey'] = overrideCLI.apiKey
      command['appKey'] = overrideCLI.appKey
      command['configPath'] = overrideCLI.configPath
      command['datadogSite'] = overrideCLI.datadogSite
      command['failOnCriticalErrors'] = overrideCLI.failOnCriticalErrors
      command['failOnTimeout'] = overrideCLI.failOnTimeout
      command['files'] = overrideCLI.files
      command['publicIds'] = overrideCLI.publicIds
      command['subdomain'] = overrideCLI.subdomain
      command['tunnel'] = overrideCLI.tunnel
      command['testSearchQuery'] = overrideCLI.testSearchQuery

      await command['resolveConfig']()
      expect(command['config']).toEqual({
        ...DEFAULT_COMMAND_CONFIG,
        apiKey: 'fake_api_key',
        appKey: 'fake_app_key',
        configPath: 'src/commands/synthetics/__tests__/config-fixtures/empty-config-file.json',
        datadogSite: 'datadoghq.eu',
        failOnCriticalErrors: true,
        failOnTimeout: false,
        files: ['new-file'],
        global: {pollingTimeout: DEFAULT_POLLING_TIMEOUT},
        publicIds: ['ran-dom-id'],
        subdomain: 'new-sub-domain',
        testSearchQuery: 'a-search-query',
        tunnel: true,
      })
    })

    test('override from config file < ENV < CLI', async () => {
      jest.spyOn(ciUtils, 'resolveConfigFromFile').mockImplementationOnce(async (config) => ({
        ...(config as Record<string, unknown>),
        apiKey: 'api_key_config_file',
        appKey: 'app_key_config_file',
        datadogSite: 'datadog.config.file',
      }))

      process.env = {
        DATADOG_API_KEY: 'api_key_env',
        DATADOG_APP_KEY: 'app_key_env',
      }

      const command = new RunTestCommand()
      command['apiKey'] = 'api_key_cli'

      await command['resolveConfig']()
      expect(command['config']).toEqual({
        ...DEFAULT_COMMAND_CONFIG,
        apiKey: 'api_key_cli',
        appKey: 'app_key_env',
        datadogSite: 'datadog.config.file',
        global: {pollingTimeout: DEFAULT_POLLING_TIMEOUT},
      })
    })

    test('pass command pollingTimeout as global override if undefined', async () => {
      const command = new RunTestCommand()
      command.configPath = 'src/commands/synthetics/__tests__/config-fixtures/config-with-global-polling-timeout.json'
      await command['resolveConfig']()
      expect(command['config']).toEqual({
        ...DEFAULT_COMMAND_CONFIG,
        configPath: 'src/commands/synthetics/__tests__/config-fixtures/config-with-global-polling-timeout.json',
        global: {followRedirects: false, pollingTimeout: 333},
        pollingTimeout: 333,
      })
    })

    test('override locations with ENV variable', async () => {
      const conf = {
        content: {tests: [{config: {}, id: 'publicId'}]},
        name: 'Suite 1',
      }

      jest.spyOn(ciUtils, 'resolveConfigFromFile').mockImplementation(async (config, _) => config)
      jest.spyOn(utils, 'getSuites').mockImplementation((() => [conf]) as any)

      // Throw to stop the test
      const triggerTests = jest.fn(() => {
        throw getAxiosHttpError(502, 'Bad Gateway')
      })

      const apiHelper = {
        getTest: jest.fn(() => ({...getApiTest('publicId')})),
        triggerTests,
      }

      const write = jest.fn()
      const command = new RunTestCommand()
      command.context = {stdout: {write}} as any
      command['config'].global = {locations: ['aws:us-east-2']}
      jest.spyOn(api, 'getApiHelper').mockImplementation(() => apiHelper as any)

      expect(await command.execute()).toBe(0)
      expect(triggerTests).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: [
            {
              executionRule: 'blocking',
              locations: ['aws:us-east-2'],
              pollingTimeout: DEFAULT_POLLING_TIMEOUT,
              public_id: 'publicId',
            },
          ],
        })
      )

      // Env > global
      process.env = {
        DATADOG_SYNTHETICS_LOCATIONS: 'aws:us-east-3',
      }
      expect(await command.execute()).toBe(0)
      expect(triggerTests).toHaveBeenCalledTimes(2)
      expect(triggerTests).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          tests: [
            {
              executionRule: 'blocking',
              locations: ['aws:us-east-3'],
              pollingTimeout: DEFAULT_POLLING_TIMEOUT,
              public_id: 'publicId',
            },
          ],
        })
      )

      process.env = {
        DATADOG_SYNTHETICS_LOCATIONS: 'aws:us-east-3;aws:us-east-4',
      }
      expect(await command.execute()).toBe(0)
      expect(triggerTests).toHaveBeenCalledTimes(3)
      expect(triggerTests).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          tests: [
            {
              executionRule: 'blocking',
              locations: ['aws:us-east-3', 'aws:us-east-4'],
              pollingTimeout: DEFAULT_POLLING_TIMEOUT,
              public_id: 'publicId',
            },
          ],
        })
      )

      // Test > env
      const confWithLocation = {
        content: {tests: [{config: {locations: ['aws:us-east-1']}, id: 'publicId'}]},
      }
      jest.spyOn(utils, 'getSuites').mockImplementation((() => [confWithLocation]) as any)

      expect(await command.execute()).toBe(0)
      expect(triggerTests).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: [
            {
              executionRule: 'blocking',
              locations: ['aws:us-east-1'],
              pollingTimeout: DEFAULT_POLLING_TIMEOUT,
              public_id: 'publicId',
            },
          ],
        })
      )
    })
  })

  describe('exit code respects `failOnCriticalErrors`', () => {
    test('404 leading to `NO_TESTS_TO_RUN` never exit with 1', async () => {
      const command = new RunTestCommand()
      command.context = {stdout: {write: jest.fn()}} as any
      command['config'].failOnCriticalErrors = true

      const apiHelper = {
        getTest: jest.fn(() => {
          throw getAxiosHttpError(404, 'Test not found')
        }),
      }
      jest.spyOn(api, 'getApiHelper').mockImplementation(() => apiHelper as any)
      jest.spyOn(ciUtils, 'resolveConfigFromFile').mockImplementation(async (config, _) => config)
      jest.spyOn(utils, 'getSuites').mockImplementation((() => [getTestSuite()]) as any)

      expect(await command.execute()).toBe(0)
      expect(apiHelper.getTest).toHaveBeenCalledTimes(1)
    })

    describe.each([false, true])('%s', (failOnCriticalErrors: boolean) => {
      const cases: [string, number?][] = [['HTTP 4xx error', 403], ['HTTP 5xx error', 502], ['Unknown error']]
      const expectedExit = failOnCriticalErrors ? 1 : 0

      describe.each(cases)('%s', (_, errorCode) => {
        test('unable to obtain test configurations', async () => {
          const command = new RunTestCommand()
          command.context = {stdout: {write: jest.fn()}} as any
          command['config'].failOnCriticalErrors = failOnCriticalErrors
          command['testSearchQuery'] = 'test:search'

          const apiHelper = {
            searchTests: jest.fn(() => {
              throw errorCode ? getAxiosHttpError(errorCode, 'Error') : new Error('Unknown error')
            }),
          }
          jest.spyOn(api, 'getApiHelper').mockImplementation(() => apiHelper as any)
          jest.spyOn(ciUtils, 'resolveConfigFromFile').mockImplementation(async (config, __) => config)

          expect(await command.execute()).toBe(expectedExit)
          expect(apiHelper.searchTests).toHaveBeenCalledTimes(1)
        })

        test('unavailable test config', async () => {
          const command = new RunTestCommand()
          command.context = {stdout: {write: jest.fn()}} as any
          command['config'].failOnCriticalErrors = failOnCriticalErrors

          const apiHelper = {
            getTest: jest.fn(() => {
              throw errorCode ? getAxiosHttpError(errorCode, 'Error') : new Error('Unknown error')
            }),
          }
          jest.spyOn(api, 'getApiHelper').mockImplementation(() => apiHelper as any)
          jest.spyOn(ciUtils, 'resolveConfigFromFile').mockImplementation(async (config, __) => config)
          jest.spyOn(utils, 'getSuites').mockImplementation((() => [getTestSuite()]) as any)

          expect(await command.execute()).toBe(expectedExit)
          expect(apiHelper.getTest).toHaveBeenCalledTimes(1)
        })

        test('unable to trigger tests', async () => {
          const command = new RunTestCommand()
          command.context = {stdout: {write: jest.fn()}} as any
          command['config'].failOnCriticalErrors = failOnCriticalErrors

          const apiHelper = {
            getTest: () => getApiTest('123-456-789'),
            triggerTests: jest.fn(() => {
              throw errorCode ? getAxiosHttpError(errorCode, 'Error') : new Error('Unknown error')
            }),
          }
          jest.spyOn(api, 'getApiHelper').mockImplementation(() => apiHelper as any)
          jest.spyOn(ciUtils, 'resolveConfigFromFile').mockImplementation(async (config, __) => config)
          jest.spyOn(utils, 'getSuites').mockImplementation((() => [getTestSuite()]) as any)

          expect(await command.execute()).toBe(expectedExit)
          expect(apiHelper.triggerTests).toHaveBeenCalledTimes(1)
        })

        test('unable to poll test results', async () => {
          const command = new RunTestCommand()
          command.context = {stdout: {write: jest.fn()}} as any
          command['config'].failOnCriticalErrors = failOnCriticalErrors

          const apiHelper = {
            getBatch: () => ({results: [], status: 'success'}),
            getTest: () => getApiTest('123-456-789'),
            pollResults: jest.fn(() => {
              throw errorCode ? getAxiosHttpError(errorCode, 'Error') : new Error('Unknown error')
            }),
            triggerTests: () => mockTestTriggerResponse,
          }
          jest.spyOn(api, 'getApiHelper').mockImplementation(() => apiHelper as any)
          jest.spyOn(ciUtils, 'resolveConfigFromFile').mockImplementation(async (config, __) => config)
          jest.spyOn(utils, 'getSuites').mockImplementation((() => [getTestSuite()]) as any)

          expect(await command.execute()).toBe(expectedExit)
          expect(apiHelper.pollResults).toHaveBeenCalledTimes(1)
        })
      })
    })
  })
})
