import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { expect } from 'vitest'
import { add } from 'sv'
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
      const mocks_directory = path.resolve(cwd, 'src/mocks')

      fs.mkdirSync(mocks_directory, { recursive: true })
      fs.writeFileSync(
        path.resolve(mocks_directory, `handlers.${extension}`),
        "export const handlers = ['existing handlers'];\n",
        'utf8',
      )
      fs.writeFileSync(
        path.resolve(mocks_directory, `browser.${extension}`),
        "export const worker = 'existing worker';\n",
        'utf8',
      )
      fs.writeFileSync(
        path.resolve(mocks_directory, `node.${extension}`),
        "export const server = 'existing server';\n",
        'utf8',
      )
      fs.writeFileSync(
        path.resolve(cwd, `src/hooks.client.${extension}`),
        'export function init() { console.log("existing client init"); }\n',
        'utf8',
      )
      fs.writeFileSync(
        path.resolve(cwd, `src/hooks.server.${extension}`),
        'export const init = () => console.log("existing server init");\n',
        'utf8',
      )
      const viteConfigPath = fs
        .readdirSync(cwd)
        .find((file) => /^vite\.config\.[jt]s$/.test(file))
      assert(viteConfigPath, 'Expected a Vite config')
      const viteConfig = fs.readFileSync(
        path.resolve(cwd, viteConfigPath),
        'utf8',
      )
      fs.writeFileSync(
        path.resolve(cwd, viteConfigPath),
        "import { msw as mockServiceWorker } from 'msw/vite';\n" +
          viteConfig.replace('plugins: [', 'plugins: [mockServiceWorker(), '),
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
      path.resolve(cwd, `src/mocks/handlers.${extension}`),
      'utf8',
    )
    expect(handlers).toBe("export const handlers = ['existing handlers'];\n")

    const browser = fs.readFileSync(
      path.resolve(cwd, `src/mocks/browser.${extension}`),
      'utf8',
    )
    expect(browser).toBe("export const worker = 'existing worker';\n")

    const node = fs.readFileSync(
      path.resolve(cwd, `src/mocks/node.${extension}`),
      'utf8',
    )
    expect(node).toBe("export const server = 'existing server';\n")

    const hooks_client = fs.readFileSync(
      path.resolve(cwd, `src/hooks.client.${extension}`),
      'utf8',
    )
    expect(hooks_client).toContain('existing client init')
    expect(hooks_client).toContain('export async function init()')
    expect(hooks_client).toContain('await network.enable()')
    expect(hooks_client).toContain(
      '// Use import.meta.env.DEV so Vite drops MSW imports before dependency discovery.',
    )
    expect(hooks_client.indexOf('await network.enable()')).toBeLessThan(
      hooks_client.indexOf('existing client init'),
    )

    const hooks_server = fs.readFileSync(
      path.resolve(cwd, `src/hooks.server.${extension}`),
      'utf8',
    )
    expect(hooks_server).toContain('existing server init')
    expect(hooks_server).toContain('export const init = async () =>')
    expect(hooks_server).toContain('return console.log(')
    expect(hooks_server).toContain('await network.enable()')
    expect(hooks_server).toContain(
      '// Use import.meta.env.DEV so Vite drops MSW imports before dependency discovery.',
    )

    // Re-applying the add-on must not duplicate hooks, plugins, or type references.
    const viteConfigPath = fs
      .readdirSync(cwd)
      .find((file) => /^vite\.config\.[jt]s$/.test(file))
    assert(viteConfigPath, 'Expected a Vite config')
    const files = [
      `src/hooks.client.${extension}`,
      `src/hooks.server.${extension}`,
      'src/app.d.ts',
      viteConfigPath,
    ]
    const before = files.map((file) =>
      fs.readFileSync(path.resolve(cwd, file), 'utf8'),
    )
    expect(before[3]).toContain('mockServiceWorker()')
    expect(before[3]).not.toContain('msw()')
    await add({
      cwd,
      addons: { [addon.id]: addon },
      options: testCase.kind.options,
      packageManager: 'pnpm',
    })
    const after = files.map((file) =>
      fs.readFileSync(path.resolve(cwd, file), 'utf8'),
    )
    expect(after).toEqual(before)
  },
)
