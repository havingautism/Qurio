import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'
import unusedImports from 'eslint-plugin-unused-imports'

export default [
  {
    ignores: ['node_modules', 'dist', 'build'],
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      prettier,
      'unused-imports': unusedImports,
    },
    rules: {
      'no-unused-vars': 'off', // Disable eslint's rule, use plugin's
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // Disable rules that conflict with Prettier
      ...prettierConfig.rules,

      // Error if formatting doesn't match Prettier
      'prettier/prettier': 'error',

      // Common custom settings

      'no-console': 'off',
      'react/prop-types': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['**/*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
]
