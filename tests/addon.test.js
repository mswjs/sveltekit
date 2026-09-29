import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
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
      {
        type: 'browser-only',
        options: { [addon.id]: { environments: ['browser'] } },
      },
      {
        type: 'node-only',
        options: { [addon.id]: { environments: ['node'] } },
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
      // Kit 3 configures SvelteKit through the Vite plugin.
      fs.unlinkSync(path.resolve(cwd, 'svelte.config.js'))
      const viteConfigPath = fs
        .readdirSync(cwd)
        .find((file) => /^vite\.config\.[jt]s$/.test(file))
      assert(viteConfigPath, 'Expected a Vite config')
      fs.writeFileSync(
        path.resolve(cwd, viteConfigPath),
        `
import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [sveltekit({ adapter: adapter() })] });
`,
      )
    },
  },
)

test.concurrent.for(testCases)(
  '@msw/msw-add $kind.type $variant',
  (testCase, ctx) => {
    const cwd = ctx.cwd(testCase)
    const extension = testCase.variant.includes('ts') ? 'ts' : 'js'

    const package_json = JSON.parse(
      fs.readFileSync(path.resolve(cwd, 'package.json'), 'utf8'),
    )
    expect(package_json.devDependencies.msw).toBe(process.env.MSW_VERSION)
    expect(package_json.msw).toBeUndefined()

    const viteConfigPath = fs
      .readdirSync(cwd)
      .find((file) => /^vite\.config\.[jt]s$/.test(file))
    assert(viteConfigPath, 'Expected a Vite config')
    const viteConfig = fs.readFileSync(
      path.resolve(cwd, viteConfigPath),
      'utf8',
    )
    expect(viteConfig).toContain("import { msw } from 'msw/vite';")
    expect(viteConfig).toContain('msw()')
    expect(viteConfig).toContain('sveltekit(')

    const appTypes = fs.readFileSync(path.resolve(cwd, 'src/app.d.ts'), 'utf8')
    expect(appTypes).toContain('/// <reference types="msw/vite/client" />')

    const handlers = fs.readFileSync(
      path.resolve(cwd, `src/msw/handlers.${extension}`),
      'utf8',
    )
    expect(handlers).toContain("import { http, HttpResponse } from 'msw/http';")
    expect(handlers).toContain("http.get('*/api/hello'")

    for (const file of ['browser', 'node']) {
      expect(
        fs.existsSync(path.resolve(cwd, `src/msw/${file}.${extension}`)),
      ).toBe(false)
    }
    expect(
      fs.existsSync(path.resolve(cwd, 'static/mockServiceWorker.js')),
    ).toBe(false)

    const environments = testCase.kind.options[addon.id].environments
    assert(Array.isArray(environments), 'Expected an environments array')
    for (const [environment, target] of [
      ['browser', 'client'],
      ['node', 'server'],
    ]) {
      const hookPath = path.resolve(cwd, `src/hooks.${target}.${extension}`)
      if (!environments.includes(environment)) {
        expect(fs.existsSync(hookPath)).toBe(false)
        continue
      }

      const hook = fs.readFileSync(hookPath, 'utf8')
      expect(hook).toContain('export const init = async () =>')
      expect(hook).toContain('if (import.meta.env.DEV)')
      expect(hook).toContain(
        '// Use import.meta.env.DEV so Vite drops MSW imports before dependency discovery.',
      )
      expect(hook).toContain(
        "// SvelteKit's dev is folded later and can leave unused MSW assets in production.",
      )
      expect(hook).toContain("await import('virtual:msw')")
      expect(hook).toContain("await import('./msw/handlers')")
      expect(hook).toContain('network.configure({ handlers })')
      expect(hook).toContain('await network.enable()')
    }
  },
)
