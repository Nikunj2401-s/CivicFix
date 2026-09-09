import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// the API and the uploaded photos are proxied, so the app can use plain /api paths
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000'
    }
  }
});
