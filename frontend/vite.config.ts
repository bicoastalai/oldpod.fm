import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bind to the explicit loopback IP (127.0.0.1) rather than `localhost`.
// Spotify's redirect-URI policy allows http on loopback IPs but rejects
// `http://localhost`, and browsers treat 127.0.0.1 as a secure context so the
// Web Playback SDK works without a self-signed TLS cert. strictPort ensures the
// port never silently drifts, which would break the registered redirect URI.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
