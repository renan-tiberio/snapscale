// @snapscale/eslint-config — react preset (apps/web)
import queryPlugin from '@tanstack/eslint-plugin-query'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import storybook from 'eslint-plugin-storybook'

import { base, houseStyle } from './base.js'

// A constant holding a class list is a variant system reimplemented by hand, and it
// loses to Tailwind's own precedence rules the moment two utilities of the same
// property meet. `tv()` from tailwind-variants owns variants; tailwind-merge owns
// merging a caller's className. See docs/06-code-standards.md §11.
const TAILWIND_CONSTANT_SELECTOR =
  'VariableDeclarator[id.name=/^([A-Z][A-Z0-9_]*|.*(Classes|ClassName|ClassNames|Styles))$/]' +
  "[init.type='Literal']" +
  '[init.value=/(^|\\s)(bg-|text-|border|rounded|flex|grid|hidden|inline-|absolute|relative|p[xytblr]?-|m[xytblr]?-|w-|h-|gap-|items-|justify-|shadow|ring|space-[xy]-|hover:|focus:|sm:|md:|lg:|xl:)/]'

/** @type {import('eslint').Linter.Config[]} */
export const reactConfig = [
  ...base,
  react.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  // react-hooks v7 ships its "recommended-latest" ruleset in the legacy
  // (eslintrc-style) `plugins: [string]` shape only — rebuild it as a proper
  // flat-config entry. It is compiler-aware: it understands React Compiler's
  // memoization and flags hook-rule violations accordingly.
  {
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
  ...queryPlugin.configs['flat/recommended'],
  ...storybook.configs['flat/recommended'],
  {
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // Styling is Tailwind classes only — inline styles are banned outright.
      'react/forbid-dom-props': ['error', { forbid: ['style'] }],
      'react/forbid-component-props': ['error', { forbid: ['style'] }],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // A rule key is replaced wholesale, never merged — the base entries have to
      // be carried across or §4/§12/§13 stop being enforced in apps/web.
      'no-restricted-syntax': [
        'error',
        ...houseStyle['no-restricted-syntax'].slice(1),
        {
          selector: TAILWIND_CONSTANT_SELECTOR,
          message:
            'Tailwind classes do not live in constants — use tv() from tailwind-variants, or tailwind-merge for a caller className (docs/06-code-standards.md §11).',
        },
      ],
    },
  },
]

export default reactConfig
