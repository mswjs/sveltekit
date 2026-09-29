import { defineAddon, defineAddonOptions } from 'sv'
import { color, downloadJson, transforms } from './sv-utils.js'

const addonOptions = defineAddonOptions()
  .add('environments', {
    question: 'Where do you want to use MSW?',
    type: 'multiselect',
    default: ['browser', 'node'],
    required: true,
    options: [
      {
        value: 'browser',
        label: 'Browser',
        hint: 'Intercept the network in the browser.',
      },
      {
        value: 'node',
        label: 'Node',
        hint: 'Intercept the network in the SvelteKit server.',
      },
    ],
  })
  .build()

const FILES = {
  handlers: `import { http, HttpResponse } from 'msw/http';

export const handlers = [
	http.get('*/api/hello', () => {
		return HttpResponse.text('Hello world!');
	})
];
`,
}

export default defineAddon({
  id: '@msw/sveltekit',
  alias: 'msw',
  shortDescription: 'add Mock Service Worker to your SvelteKit app',
  homepage: 'https://mswjs.io',
  options: addonOptions,

  setup: ({ isKit, unsupported }) => {
    if (!isKit) {
      unsupported('Requires SvelteKit')
    }
  },

  run: async ({ directory, file, language, options, sv }) => {
    const mswVersion = await getMswVersion()
    const extension = language === 'ts' ? 'ts' : 'js'
    const mocksDirectory = `${directory.src}/mocks`

    sv.devDependency('msw', mswVersion)

    sv.file(file.viteConfig, addVitePlugin())
    sv.file(`${mocksDirectory}/handlers.${extension}`, seedFile(FILES.handlers))
    sv.file(`${directory.src}/app.d.ts`, addVirtualModuleTypes())

    if (options.environments.includes('browser')) {
      sv.file(`${directory.src}/hooks.client.${extension}`, addInitHook())
    }

    if (options.environments.includes('node')) {
      sv.file(`${directory.src}/hooks.server.${extension}`, addInitHook())
    }
  },

  nextSteps: () => [
    'Edit your request handlers in ' + color.path('src/mocks/handlers'),
  ],
})

async function getMswVersion() {
  const versionOverride = process.env.MSW_VERSION

  if (versionOverride) {
    return versionOverride
  }

  const { version } = await downloadJson(
    'https://registry.npmjs.org/msw/latest',
  )
  return `^${version}`
}

/**
 * @param {string} content
 * @returns
 */
function seedFile(content) {
  return transforms.text(({ content: existingContent }) => {
    return existingContent.trim() ? existingContent : content
  })
}

function addVitePlugin() {
  return transforms.script(({ ast, js }) => {
    const { alias } = js.imports.find(ast, { from: 'msw/vite', name: 'msw' })
    if (!alias) {
      js.imports.addNamed(ast, { from: 'msw/vite', imports: ['msw'] })
    }
    js.vite.addPlugin(ast, { code: `${alias ?? 'msw'}()` })
  })
}

function addVirtualModuleTypes() {
  return transforms.text(({ content }) => {
    if (/\/\/\/\s*<reference\s+types=["']msw\/vite\/client["']/.test(content)) {
      return content
    }

    return `/// <reference types="msw/vite/client" />\n${content}`
  })
}

function addInitHook() {
  return transforms.script(({ ast, js, comments, content }) => {
    let setup = js.common.parseStatement(`if (import.meta.env.DEV) {
	const { network } = await import('virtual:msw');
	const { handlers } = await import('./mocks/handlers');

	network.configure({ handlers });
	await network.enable();
}`)
    const exported = js.exports.createNamed(ast, {
      name: 'init',
      // falling back to an empty init that we will populate with the AST changes below
      fallback: js.common.parseFromString('const init = async () => {};'),
    })

    const declaration = exported.declaration
    const init =
      declaration?.type === 'VariableDeclaration'
        ? declaration.declarations[0].init
        : declaration

    if (
      !init ||
      (init.type !== 'FunctionDeclaration' &&
        init.type !== 'FunctionExpression' &&
        init.type !== 'ArrowFunctionExpression')
    ) {
      throw new Error('Cannot add MSW to an init hook that is not a function')
    }

    // converts non async, non block function bodies into block statements
    // so we can have multiple statements
    init.async = true
    if (init.body.type !== 'BlockStatement') {
      init.body = {
        type: 'BlockStatement',
        body: [{ type: 'ReturnStatement', argument: init.body }],
      }
      if (init.type === 'ArrowFunctionExpression') init.expression = false
    }

    const existingSetup = init.body.body.find((statement) =>
      js.common.areNodesEqual(statement, setup),
    )
    if (existingSetup) {
      setup = existingSetup
    } else {
      init.body.body.unshift(setup)
    }

    // let's add a few comments to show why we use import.meta.env.DEV
    for (const line of [
      'Use import.meta.env.DEV so Vite drops MSW imports before dependency discovery.',
      "SvelteKit's dev is folded later and can leave unused MSW assets in production.",
    ]) {
      if (!content.includes(line)) {
        comments.add(setup, { type: 'Line', value: ` ${line}` })
      }
    }
  })
}
