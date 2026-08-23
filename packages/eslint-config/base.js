// @snapscale/eslint-config — base preset
//
// Shared by every workspace package/app. Extended by `./react.js` (apps/web) and
// `./node.js` (Fastify services). App-local rules belong in the app's own
// `eslint.config.js` — they must never leak back into this shared package.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'

/** @type {import('eslint').Linter.Config[]} */
export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      'no-console': 'error',
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // Path aliases (`@/*` -> src, `~/*` -> app root) exist precisely so nobody
      // needs to climb out of a folder more than one level.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*'],
              message: 'Deep relative imports are banned — use the `@/*` or `~/*` alias instead.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**', 'coverage/**', '.turbo/**', 'node_modules/**', 'storybook-static/**'],
  },
)

export default base
