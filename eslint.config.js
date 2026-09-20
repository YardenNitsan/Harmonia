import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['packages/domain/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                '@tauri-apps/*',
                'node:*',
                '../application/*',
                '../audio/*',
                '../persistence/*',
                '../providers/*',
              ],
              message:
                'Domain must remain independent of application, infrastructure and platform frameworks.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/application/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                '@tauri-apps/*',
                '../audio/*',
                '../persistence/*',
                '../providers/*',
              ],
              message:
                'Application workflows depend on inward contracts, not concrete infrastructure.',
            },
          ],
        },
      ],
    },
  },
);
