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

## What you get

- `msw` added as a dev dependency.
- `src/msw/handlers.ts` or `src/msw/handlers.js` with shared request handlers.
- Optional browser setup in `src/msw/browser` and `src/hooks.client`.
- Optional Node setup in `src/msw/node` and `src/hooks.server`.
- Browser worker configuration in `package.json`.

## Options

### `environments`

Choose where MSW should run. This is a multiselect option.

Default: `browser,node`

```shell
npx sv add @msw/sveltekit="environments:browser,node"
```

## Browser worker

If you enable browser mocking, generate the service worker after installing dependencies:

```shell
npx msw init static --save
```
