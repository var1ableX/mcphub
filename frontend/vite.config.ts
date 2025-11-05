import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
// Import the package.json to get the version
import { readFileSync } from 'fs';

// Get package.json version
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file from parent directory (project root)
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  
  // Get BASE_PATH from environment, default to empty string
  // Normalize by removing trailing slashes to avoid double slashes
  let basePath = env.BASE_PATH || '';
  basePath = basePath.replace(/\/+$/, '');
  
  // Create proxy configuration dynamically based on BASE_PATH
  const proxyConfig: Record<string, any> = {};
  
  // List of paths that need to be proxied
  const pathsToProxy = ['/api', '/config', '/public-config', '/health', '/oauth'];
  
  pathsToProxy.forEach((path) => {
    const proxyPath = basePath + path;
    proxyConfig[proxyPath] = {
      target: 'http://localhost:3000',
      changeOrigin: true,
    };
  });
  
  return {
    base: './', // Always use relative paths for runtime configuration
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      // Make package version available as global variable
      // BASE_PATH will be loaded at runtime
      'import.meta.env.PACKAGE_VERSION': JSON.stringify(packageJson.version),
    },
    build: {
      sourcemap: true, // Enable source maps for production build
    },
    server: {
      proxy: proxyConfig,
    },
  };
});
