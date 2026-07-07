import { defineAddon, defineAddonOptions } from 'sv'
import { color, downloadJson, transforms, defineEnv } from './sv-utils.js'

const options = defineAddonOptions()
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
        hint: 'Intercept the network in Node.js (e.g. server, tests).',
      },
    ],
  })
  .build()

const FILES = {
  handlers: `import { http, HttpResponse } from 'msw';

export const handlers = [
	http.get('/api/hello', () => {
		return HttpResponse.text('Hello world!');
	})
];
`,
  browser: `import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
`,
  node: `import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
`,
}

export default defineAddon({
  id: '@msw/sveltekit',
  alias: 'msw',
  shortDescription: 'add Mock Service Worker to your SvelteKit app',
  homepage: 'https://mswjs.io',
  options,

  setup: ({ isKit, unsupported }) => {
    if (!isKit) {
      unsupported('Requires SvelteKit')
    }
  },

  run: async ({
    directory,
    file,
    language,
    options,
    sv,
    cwd,
    dependencyVersion,
  }) => {
    const mswVersion = await getMswVersion()
    const extension = language === 'ts' ? 'ts' : 'js'
    const mocksDirectory = `${directory.src}/msw`

    const env = defineEnv({ sv, cwd, dependencyVersion })

    sv.devDependency('msw', mswVersion)

    sv.file(`${mocksDirectory}/handlers.${extension}`, seedFile(FILES.handlers))

    if (options.environments.includes('browser')) {
      sv.file(`${mocksDirectory}/browser.${extension}`, seedFile(FILES.browser))
      sv.file(file.package, addMswWorkerDirectory())
      sv.file(`${directory.src}/hooks.client.${extension}`, addClientHook(env))
    }

    if (options.environments.includes('node')) {
      sv.file(`${mocksDirectory}/node.${extension}`, seedFile(FILES.node))
      sv.file(`${directory.src}/hooks.server.${extension}`, addServerHook(env))
    }
  },

  nextSteps: ({ options }) => {
    const steps = [
      'Edit your request handlers in ' + color.path('src/msw/handlers'),
    ]

    if (options.environments.includes('browser')) {
      steps.push(
        `Generate the browser worker with ${color.command('npx msw init static --save')}`,
      )
    }

    return steps
  },
})

async function getMswVersion() {
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

function addMswWorkerDirectory() {
  return transforms.json(({ data }) => {
    data.msw ??= {}
    data.msw.workerDirectory = ['static']
  })
}

/**
 * @param {ReturnType<typeof defineEnv>} env
 */
function addClientHook(env) {
  return transforms.script(({ ast, content, js }) => {
    env.importEnv(ast, js, ['dev'])
    js.imports.addNamed(ast, {
      from: './msw/browser',
      imports: ['worker'],
    })

    if (content.includes('worker.start(')) {
      return
    }

    js.common.appendFromString(ast, {
      code: `export async function init() {
	if (dev) {
		await worker.start();
	}
}`,
    })
  })
}

/**
 * @param {ReturnType<typeof defineEnv>} env
 */
function addServerHook(env) {
  return transforms.script(({ ast, js }) => {
    env.importEnv(ast, js, ['dev'])
    js.imports.addNamed(ast, {
      from: './msw/node',
      imports: { server: 'msw_server' },
    })

    js.common.appendStatement(ast, {
      statement: js.common.parseStatement(`if (dev) {
	msw_server.listen({ onUnhandledRequest: 'bypass' });
}`),
    })
  })
}
