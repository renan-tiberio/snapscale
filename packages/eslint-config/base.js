// @snapscale/eslint-config — base preset
//
// Shared by every workspace package/app. Extended by `./react.js` (apps/web) and
// `./node.js` (Fastify services). App-local rules belong in the app's own
// `eslint.config.js` — they must never leak back into this shared package.
//
// The house-style block below is the machine-enforced half of
// `docs/06-code-standards.md`; the rest of that document is enforced in review.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importPlugin from 'eslint-plugin-import'

// Non-mutating replacements exist for every one of these on Node 22 and in every
// browser this project targets — see the table in docs/06-code-standards.md §4.
const MUTATING_ARRAY_METHODS = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
].join('|')

/** Rules that a source file may break only with an inline, justified disable. */
const houseStyle = {
  // §1 — functions are arrow functions.
  'func-style': ['error', 'expression', { allowArrowFunctions: true }],
  'prefer-arrow-callback': 'error',

  // §2 — `type`, not `interface`. Overrides tseslint's stylistic default, which
  // picks `interface`. Declaration merging (module augmentation) is the sole
  // legitimate `interface` and is exempted per-file.
  '@typescript-eslint/consistent-type-definitions': ['error', 'type'],

  // §3 — named parameters: one object in, always.
  'max-params': 'off',
  '@typescript-eslint/max-params': ['error', { max: 1 }],

  // §4 — immutability.
  'prefer-const': 'error',
  'no-param-reassign': ['error', { props: true }],

  // §12 — early return. §13 — object literal over switch. §4 — mutating natives.
  'no-else-return': ['error', { allowElseIf: false }],
  'no-restricted-syntax': [
    'error',
    {
      selector: 'SwitchStatement',
      message:
        'Use an object literal with `satisfies Record<Union, T>` — it is exhaustively checked at compile time (docs/06-code-standards.md §13).',
    },
    {
      selector: 'IfStatement[alternate]',
      message: 'Use an early return instead of `else` (docs/06-code-standards.md §12).',
    },
    {
      selector: `CallExpression[callee.property.name=/^(${MUTATING_ARRAY_METHODS})$/]`,
      message:
        'This mutates in place. Use the non-mutating form — toSorted/toReversed/toSpliced/with/spread (docs/06-code-standards.md §4).',
    },
    {
      selector: "CallExpression[callee.object.name='Object'][callee.property.name='assign']",
      message:
        'Object.assign mutates its target. Use object spread (docs/06-code-standards.md §4).',
    },
  ],

  // §16 — no magic numbers. A literal without a name has no unit, and a `staleTime`
  // of 30_000 could be seconds, minutes or years.
  'no-magic-numbers': 'off',
  '@typescript-eslint/no-magic-numbers': [
    'error',
    {
      ignore: [-1, 0, 1],
      ignoreArrayIndexes: true,
      ignoreDefaultValues: true,
      ignoreEnums: true,
      ignoreReadonlyClassProperties: true,
      ignoreTypeIndexes: true,
      enforceConst: true,
      detectObjects: false,
    },
  ],
}

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
      ...houseStyle,
    },
  },
  {
    // A literal in an assertion IS the specification — naming it would move the
    // expected value away from the expectation. Everything else still applies.
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/test/**',
      '**/*.stories.tsx',
      '**/*.config.ts',
      '**/*.config.js',
    ],
    rules: {
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'coverage/**',
      '.turbo/**',
      'node_modules/**',
      'storybook-static/**',
      // Playwright's generated report and traces: minified vendor bundles whose contents
      // change on every e2e run, so linting them makes the result state-dependent.
      'playwright-report/**',
      'test-results/**',
    ],
  },
)

export { houseStyle }
export default base
