import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Publicado em https://davimelo.com/proliferate/
export default defineConfig({
  plugins: [react()],
  base: '/proliferate/',
  server: {
    port: 5173,
    proxy: {
      // Em desenvolvimento, o MPCFill é acessado por este proxy local (sem CORS).
      '/api-mpcfill': {
        target: 'https://mpcfill.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api-mpcfill/, ''),
        headers: { Referer: 'https://mpcfill.com/editor', Origin: 'https://mpcfill.com' },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
});
