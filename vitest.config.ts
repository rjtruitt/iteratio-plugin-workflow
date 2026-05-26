import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'iteratio/src/__test__': path.resolve(__dirname, '../iteratio/src/__test__'),
      'iteratio': path.resolve(__dirname, '../iteratio/src'),
    },
  },
});
