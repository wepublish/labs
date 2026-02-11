import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    }
  },
  {
    rules: {
      // Allow unused vars starting with underscore
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      // Enforce explicit return types on exported functions
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Allow any for rapid prototyping (tighten in production)
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    files: ['**/*.svelte'],
    rules: {
      // Capturing initial prop values for form state is intentional
      'svelte/valid-compile': ['error', { ignoreWarnings: true }]
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.svelte-kit/**', 'src/*/supabase/functions/**']
  }
);
