import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/musiclearning/',
  plugins: [react()],
  server: { port: 5173 },
})
