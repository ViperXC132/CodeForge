import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const monacoEsm = (path: string) =>
  fileURLToPath(new URL(`./node_modules/monaco-editor/esm/vs/${path}`, import.meta.url))

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      'monaco-editor/esm/vs/editor/editor.worker.js': monacoEsm('editor/editor.worker.js'),
      'monaco-editor/esm/vs/language/json/json.worker.js': monacoEsm('language/json/json.worker.js'),
      'monaco-editor/esm/vs/language/css/css.worker.js': monacoEsm('language/css/css.worker.js'),
      'monaco-editor/esm/vs/language/html/html.worker.js': monacoEsm('language/html/html.worker.js'),
      'monaco-editor/esm/vs/language/typescript/ts.worker.js': monacoEsm('language/typescript/ts.worker.js'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
