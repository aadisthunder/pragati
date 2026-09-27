import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        // The Express API runs separately (npm run dev:server). Without this,
        // every /api call while the backend is down spams a raw ECONNREFUSED
        // AggregateError stack in the terminal — one short line instead.
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            const url = req?.url || '';
            console.warn(`[vite] API not reachable (is the server running? "npm run dev:server") — ${url} (${err.code || 'ECONNREFUSED'})`);
            if (res && !res.headersSent && 'writeHead' in res) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'API server not reachable. Start it with: npm run dev:server' }));
            }
          });
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) {
              return 'vendor-react';
            }
            if (id.includes('@supabase')) {
              return 'vendor-supabase';
            }
            if (id.includes('katex') || id.includes('rehype-katex') || id.includes('remark-math')) {
              return 'vendor-katex';
            }
            if (id.includes('recharts')) {
              return 'vendor-charts';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
          }
        },
      },
    },
  },
});
