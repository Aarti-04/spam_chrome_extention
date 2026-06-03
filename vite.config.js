import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      {
        name: 'replace-manifest-placeholder',
        closeBundle() {
          const manifestPath = path.resolve(__dirname, 'dist/manifest.json')
          if (fs.existsSync(manifestPath)) {
            let manifest = fs.readFileSync(manifestPath, 'utf8')
            const clientId = env.VITE_GOOGLE_CLIENT_ID || ''
            manifest = manifest.replace('__GOOGLE_CLIENT_ID__', clientId)
            fs.writeFileSync(manifestPath, manifest, 'utf8')
            console.log('Successfully injected OAuth client_id into dist/manifest.json')
          }
        }
      }
    ]
  }
})