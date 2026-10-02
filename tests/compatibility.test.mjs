import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { add } from 'sv'
// Exercise the published entry point, including the bundled sv-utils.
import addon from '@msw/sveltekit'

const testDirectory = fileURLToPath(
  new URL('../.test-output/', import.meta.url),
)
fs.mkdirSync(testDirectory, { recursive: true })
process.env.MSW_VERSION = '3.0.0'

for (const extension of ['js', 'ts']) {
  for (const environments of [['browser'], ['node'], ['browser', 'node']]) {
    test(`published add-on: ${extension}, ${environments.join('+')}`, async (t) => {
      const cwd = fs.mkdtempSync(path.join(testDirectory, 'compatibility-'))
      t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))

      fs.mkdirSync(path.join(cwd, 'src'), { recursive: true })
      fs.writeFileSync(
        path.join(cwd, 'package.json'),
        JSON.stringify({
          name: 'compatibility-fixture',
          type: 'module',
          devDependencies: { '@sveltejs/kit': '^2.62.0', svelte: '^5.0.0' },
        }),
      )
      fs.writeFileSync(
        path.join(cwd, extension === 'ts' ? 'tsconfig.json' : 'jsconfig.json'),
        '{}',
      )
      fs.writeFileSync(
        path.join(cwd, 'svelte.config.js'),
        'export default {};\n',
      )
      fs.writeFileSync(
        path.join(cwd, `vite.config.${extension}`),
        "import { sveltekit } from '@sveltejs/kit/vite';\nexport default { plugins: [sveltekit()] };\n",
      )

      const options = {
        cwd,
        addons: { [addon.id]: addon },
        options: { [addon.id]: { environments } },
        packageManager: 'pnpm',
      }
      await add(options)

      const read = (file) => fs.readFileSync(path.join(cwd, file), 'utf8')
      const files = [
        'package.json',
        `vite.config.${extension}`,
        'src/app.d.ts',
        `src/mocks/handlers.${extension}`,
      ]
      assert.equal(
        JSON.parse(read('package.json')).devDependencies.msw,
        '3.0.0',
      )
      assert.match(read(`vite.config.${extension}`), /msw\(\)/)
      assert.match(read(`vite.config.${extension}`), /from ['"]msw\/vite['"]/)
      assert.match(read('src/app.d.ts'), /types="msw\/vite\/client"/)
      assert.match(read(`src/mocks/handlers.${extension}`), /http\.get\(/)

      for (const [environment, target] of [
        ['browser', 'client'],
        ['node', 'server'],
      ]) {
        const file = `src/hooks.${target}.${extension}`
        assert.equal(
          fs.existsSync(path.join(cwd, file)),
          environments.includes(environment),
        )
        if (!environments.includes(environment)) continue

        files.push(file)
        assert.match(read(file), /export const init = async/)
        assert.match(read(file), /if \(import\.meta\.env\.DEV\)/)
        assert.match(read(file), /await import\(['"]virtual:msw['"]\)/)
        assert.match(read(file), /await network\.enable\(\)/)
      }

      const before = files.map(read)
      await add(options)
      assert.deepEqual(
        files.map(read),
        before,
        'Reapplying the add-on must be idempotent',
      )
    })
  }
}
