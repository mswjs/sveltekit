# [sv](https://svelte.dev/docs/cli/overview) community add-on: [@msw/sveltekit](https://github.com/mswjs/sveltekit)

> [!IMPORTANT]
> Svelte maintainers have not reviewed community add-ons for malicious code. Use at your discretion.

## Usage

You can create a new SvelteKit project with this add-on using the following command:

```sh
npx sv create --add @msw/sveltekit
```

Or integrate MSW add-in into an existing project with this one:

```shell
npx sv add @msw/sveltekit
```

## CLI compatibility

Supports `sv` versions `>=0.13.1 <2.0.0`. The published add-on is tested against
`0.13.1`, `0.17.1`, `1.0.0`, and `1.0.1`. Its `sv-utils` dependency is bundled.

Older `sv` versions may show a major-version compatibility warning even though
they are supported: the CLI checks a single major version rather than the full
peer dependency range. Use `npx sv@latest add @msw/sveltekit` to avoid that warning.

## What you get

- `msw` added as a dev dependency.
- `src/mocks/handlers.ts` or `src/mocks/handlers.js` with shared request handlers.
- The `msw()` plugin from `msw/vite` added to your Vite config.
- Optional browser and server setup in the corresponding `src/hooks.client` and `src/hooks.server` `init` hooks.
- Types for `virtual:msw` referenced in `src/app.d.ts`.

The hooks load your handlers and enable the `virtual:msw` network during development only. The Vite plugin selects the browser or Node implementation automatically and serves the browser worker, so there is no need to run `msw init` or copy a worker into `static`.

The add-on installs the latest stable MSW release. The Vite integration requires MSW 3.0.0 or later. You can override the dependency with the `MSW_VERSION` environment variable.

## Options

### `environments`

Choose where MSW should run during development: `browser`, `node` (the SvelteKit server), or both. This is a multiselect option.

Default: `browser,node`

```shell
npx sv add @msw/sveltekit="environments:browser,node"
```
