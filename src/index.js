import { defineAddon, defineAddonOptions } from 'sv'
import { color, downloadJson, pnpm, transforms } from './sv-utils.js'

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
        hint: 'Service Worker request interception',
      },
      {
        value: 'node',
        label: 'Node',
        hint: 'Server-side and test request interception',
      },
    ],
  })
  .build()

export default defineAddon({
  id: '@msw/sveltekit',
  alias: 'msw',
  shortDescription: 'add Mock Service Worker to your SvelteKit app',
  homepage: 'https://mswjs.io',
  options,

  setup: ({ isKit, unsupported }) => {
    if (!isKit) unsupported('Requires SvelteKit')
  },

  run: async ({
    directory,
    file,
    language,
    options,
    packageManager: package_manager,
    sv,
  }) => {
    const msw_version = await get_msw_version()
    const extension = language === 'ts' ? 'ts' : 'js'
    const mocks_directory = `${directory.src}/msw`

    sv.devDependency('msw', msw_version)
    if (package_manager === 'pnpm') {
      sv.file(file.findUp('pnpm-workspace.yaml'), pnpm.allowBuilds('msw'))
    }

    sv.file(
      `${mocks_directory}/handlers.${extension}`,
      seed_file(handlers_content()),
    )

    if (options.environments.includes('browser')) {
      sv.file(
        `${mocks_directory}/browser.${extension}`,
        seed_file(browser_content()),
      )
      sv.file(file.package, add_msw_worker_directory())
      sv.file(`${directory.src}/hooks.client.${extension}`, add_client_hook())
    }

    if (options.environments.includes('node')) {
      sv.file(`${mocks_directory}/node.${extension}`, seed_file(node_content()))
      sv.file(`${directory.src}/hooks.server.${extension}`, add_server_hook())
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

async function get_msw_version() {
  const { version } = await downloadJson(
    'https://registry.npmjs.org/msw/latest',
  )
  return `^${version}`
}

/**
 * @param {string} content
 * @returns
 */
function seed_file(content) {
  return transforms.text(({ content: existing_content }) => {
    if (existing_content.trim()) return existing_content
    return content
  })
}

function handlers_content() {
  return `import { http, HttpResponse } from 'msw';

export const handlers = [
	http.get('/api/hello', () => {
		return HttpResponse.json({ message: 'Hello from MSW' });
	})
];
`
}

function browser_content() {
  return `import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);
`
}

function node_content() {
  return `import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
`
}

function add_msw_worker_directory() {
  return transforms.json(({ data }) => {
    data.msw ??= {}
    data.msw.workerDirectory = ['static']
  })
}

function add_client_hook() {
  return transforms.script(({ ast, content, js }) => {
    js.imports.addNamed(ast, {
      from: '$app/environment',
      imports: ['dev'],
    })
    js.imports.addNamed(ast, {
      from: './msw/browser',
      imports: ['worker'],
    })

    if (content.includes('worker.start(')) return

    js.common.appendFromString(ast, {
      code: `export async function init() {
	if (dev) {
		await worker.start();
	}
}`,
    })
  })
}

function add_server_hook() {
  return transforms.script(({ ast, js }) => {
    js.imports.addNamed(ast, {
      from: '$app/environment',
      imports: ['dev'],
    })
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
