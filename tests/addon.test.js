import fs from 'node:fs'
import path from 'node:path'
import { expect } from 'vitest'
import addon from '../src/index.js'
import { setupTest } from './setup/suite.js'

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
  },
)

test.concurrent.for(testCases)(
  '@msw/msw-add $kind.type $variant',
  async (testCase, ctx) => {
    const cwd = ctx.cwd(testCase)
    const extension = testCase.variant.includes('ts') ? 'ts' : 'js'

    const package_json = JSON.parse(
      fs.readFileSync(path.resolve(cwd, 'package.json'), 'utf8'),
    )
    expect(package_json.devDependencies.msw).toMatch(/^\^\d+\.\d+\.\d+/)
    expect(package_json.msw.workerDirectory).toEqual(['static'])

    const handlers = fs.readFileSync(
      path.resolve(cwd, `src/msw/handlers.${extension}`),
      'utf8',
    )
    expect(handlers).toContain("import { http, HttpResponse } from 'msw';")
    expect(handlers).toContain("http.get('/api/hello'")

    const browser = fs.readFileSync(
      path.resolve(cwd, `src/msw/browser.${extension}`),
      'utf8',
    )
    expect(browser).toContain("import { setupWorker } from 'msw/browser';")
    expect(browser).toContain('setupWorker(...handlers)')

    const node = fs.readFileSync(
      path.resolve(cwd, `src/msw/node.${extension}`),
      'utf8',
    )
    expect(node).toContain("import { setupServer } from 'msw/node';")
    expect(node).toContain('setupServer(...handlers)')

    const hooks_client = fs.readFileSync(
      path.resolve(cwd, `src/hooks.client.${extension}`),
      'utf8',
    )
    expect(hooks_client).toContain("import { dev } from '$app/environment';")
    expect(hooks_client).toContain("import { worker } from './msw/browser';")
    expect(hooks_client).toContain('export async function init()')
    expect(hooks_client).toContain('worker.start()')

    const hooks_server = fs.readFileSync(
      path.resolve(cwd, `src/hooks.server.${extension}`),
      'utf8',
    )
    expect(hooks_server).toContain("import { dev } from '$app/environment';")
    expect(hooks_server).toContain(
      "import { server as msw_server } from './msw/node';",
    )
    expect(hooks_server).toContain('if (dev)')
    expect(hooks_server).toContain(
      "msw_server.listen({ onUnhandledRequest: 'bypass' })",
    )
  },
)
