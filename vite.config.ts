import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // equivalente a '0.0.0.0' — permite abrir el editor desde otros dispositivos en la misma red LAN durante desarrollo (Etapa 14B.1)
  },
})
