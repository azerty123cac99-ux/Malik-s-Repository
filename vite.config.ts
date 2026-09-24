import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Variables with these prefixes are baked into the browser bundle.
  // NEXT_PUBLIC_ is what the Supabase–Vercel integration sets. Only put
  // public values behind these prefixes (never the service role key).
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
