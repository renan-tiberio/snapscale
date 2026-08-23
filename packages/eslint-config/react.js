// @snapscale/eslint-config — react preset (apps/web)
import queryPlugin from '@tanstack/eslint-plugin-query'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import storybook from 'eslint-plugin-storybook'

import { base } from './base.js'

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
    },
  },
]

export default reactConfig
