import fs from 'node:fs'
import path from 'node:path'
import { expect } from 'vitest'
import addon from '../../src/index.js'
import { setupTest } from '../setup/suite.js'

const { test, testCases } = setupTest(
  { addon },
  {
    kinds: [
      {
        type: 'default',
        options: { [addon.id]: { environments: ['browser', 'node'] } },
      },
    ],
    filter: (testCase) => testCase.variant.includes('kit'),
    browser: false,
    preAdd: ({ addonTestCase, cwd }) => {
      const extension = addonTestCase.variant.includes('ts') ? 'ts' : 'js'
      const msw_directory = path.resolve(cwd, 'src/msw')

      fs.mkdirSync(msw_directory, { recursive: true })
      fs.writeFileSync(
        path.resolve(msw_directory, `handlers.${extension}`),
        "export const handlers = ['existing handlers'];\n",
        'utf8',
      )
      fs.writeFileSync(
        path.resolve(msw_directory, `browser.${extension}`),
        "export const worker = 'existing worker';\n",
        'utf8',
      )
      fs.writeFileSync(
        path.resolve(msw_directory, `node.${extension}`),
        "export const server = 'existing server';\n",
        'utf8',
      )
      fs.writeFileSync(
        path.resolve(cwd, `src/hooks.client.${extension}`),
        'export const existing_client_hook = true;\n',
        'utf8',
      )
      fs.writeFileSync(
        path.resolve(cwd, `src/hooks.server.${extension}`),
        'export const existing_server_hook = true;\n',
        'utf8',
      )
    },
  },
)

test.concurrent.for(testCases)(
  '@msw/msw-add preserves existing files $kind.type $variant',
  async (testCase, ctx) => {
    const cwd = ctx.cwd(testCase)
    const extension = testCase.variant.includes('ts') ? 'ts' : 'js'

    const handlers = fs.readFileSync(
      path.resolve(cwd, `src/msw/handlers.${extension}`),
      'utf8',
    )
    expect(handlers).toBe("export const handlers = ['existing handlers'];\n")

    const browser = fs.readFileSync(
      path.resolve(cwd, `src/msw/browser.${extension}`),
      'utf8',
    )
    expect(browser).toBe("export const worker = 'existing worker';\n")

    const node = fs.readFileSync(
      path.resolve(cwd, `src/msw/node.${extension}`),
      'utf8',
    )
    expect(node).toBe("export const server = 'existing server';\n")

    const hooks_client = fs.readFileSync(
      path.resolve(cwd, `src/hooks.client.${extension}`),
      'utf8',
    )
    expect(hooks_client).toContain('existing_client_hook')
    expect(hooks_client).toContain('export async function init()')
    expect(hooks_client).toContain('worker.start()')

    const hooks_server = fs.readFileSync(
      path.resolve(cwd, `src/hooks.server.${extension}`),
      'utf8',
    )
    expect(hooks_server).toContain('existing_server_hook')
    expect(hooks_server).toContain(
      "msw_server.listen({ onUnhandledRequest: 'bypass' })",
    )
  },
)
