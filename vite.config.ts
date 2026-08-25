import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from '@dvaji/vite-plugin-monaco-editor'

export default defineConfig({
  plugins: [
    react(),
    monacoEditorPlugin({}),
  ],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
