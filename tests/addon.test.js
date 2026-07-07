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
      {
        type: 'sveltekit-3',
        options: { [addon.id]: { environments: ['browser', 'node'] } },
      },
    ],
    filter: (testCase) => testCase.variant.includes('kit'),
    browser: false,
    preAdd: ({ addonTestCase, cwd }) => {
      if (addonTestCase.kind.type !== 'sveltekit-3') return

      const package_json_path = path.resolve(cwd, 'package.json')
      const package_json = JSON.parse(
        fs.readFileSync(package_json_path, 'utf8'),
      )
      package_json.devDependencies['@sveltejs/kit'] = '^3.0.0-next'
      fs.writeFileSync(
        package_json_path,
        JSON.stringify(package_json, null, '\t'),
      )
    },
  },
)

test.concurrent.for(testCases)(
  '@msw/msw-add $kind.type $variant',
  async (testCase, ctx) => {
    const cwd = ctx.cwd(testCase)
    const extension = testCase.variant.includes('ts') ? 'ts' : 'js'
    const appModule =
      testCase.kind.type === 'sveltekit-3' ? '$app/env' : '$app/environment'

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

    const hooksClient = fs.readFileSync(
      path.resolve(cwd, `src/hooks.client.${extension}`),
      'utf8',
    )
    expectDevImport(hooksClient, appModule)
    expect(hooksClient).toContain("import { worker } from './msw/browser';")
    expect(hooksClient).toContain('export async function init()')
    expect(hooksClient).toContain('worker.start()')

    const hooks_server = fs.readFileSync(
      path.resolve(cwd, `src/hooks.server.${extension}`),
      'utf8',
    )
    expectDevImport(hooks_server, appModule)
    expect(hooks_server).toContain(
      "import { server as msw_server } from './msw/node';",
    )
    expect(hooks_server).toContain('if (dev)')
    expect(hooks_server).toContain(
      "msw_server.listen({ onUnhandledRequest: 'bypass' })",
    )
  },
)

/**
 * @param {string} content
 * @param {string} module
 */
function expectDevImport(content, module) {
  expect(content).toContain(`import { dev } from '${module}';`)
  expect(content).not.toContain(
    module === '$app/env' ? "from '$app/environment'" : "from '$app/env'",
  )
}
