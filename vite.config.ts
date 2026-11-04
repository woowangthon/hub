import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const generated = fileURLToPath(new URL('./.archive/generated/projects.json', import.meta.url));

export default defineConfig({
  plugins: [react(), {
    name: 'archive-projects',
    resolveId(id) { if (id === 'virtual:archive-projects') return '\0archive-projects'; },
    load(id) {
      if (id !== '\0archive-projects') return;
      if (process.env.ARCHIVE_DATA !== 'collected') return 'export const projects = [];';
      const data: unknown = JSON.parse(readFileSync(generated, 'utf8'));
      if (!Array.isArray(data) || data.length === 0) throw new Error('수집한 작품 데이터가 없습니다. archive 수집을 먼저 실행하세요.');
      return `export const projects = ${JSON.stringify(data)};`;
    },
  }],
  // Relative assets also work under /hub/. Publishing is intentionally separate.
  base: './',
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
