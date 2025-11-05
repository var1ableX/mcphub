# BASE_PATH Configuration Guide

## Overview

MCPHub supports running under a custom base path (e.g., `/mcphub/`) for scenarios where you need to deploy the application under a subdirectory or behind a reverse proxy.

## Configuration

### Setting BASE_PATH

Add the `BASE_PATH` environment variable to your `.env` file:

```bash
PORT=3000
NODE_ENV=development
BASE_PATH=/mcphub/
```

**Note:** Trailing slashes in BASE_PATH are automatically normalized (removed). Both `/mcphub/` and `/mcphub` will work and be normalized to `/mcphub`.

### In Production (Docker)

Set the environment variable when running the container:

```bash
docker run -e BASE_PATH=/mcphub/ -p 3000:3000 mcphub
```

### Behind a Reverse Proxy (nginx)

Example nginx configuration:

```nginx
location /mcphub/ {
    proxy_pass http://localhost:3000/mcphub/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## How It Works

### Backend Routes

All backend routes are automatically prefixed with BASE_PATH:

- **Without BASE_PATH:**
  - Config: `http://localhost:3000/config`
  - Auth: `http://localhost:3000/api/auth/login`
  - Health: `http://localhost:3000/health`

- **With BASE_PATH="/mcphub":**
  - Config: `http://localhost:3000/mcphub/config`
  - Auth: `http://localhost:3000/mcphub/api/auth/login`
  - Health: `http://localhost:3000/health` (global, no prefix)

### Frontend

The frontend automatically detects the BASE_PATH at runtime by calling the `/config` endpoint. All API calls are automatically prefixed.

### Development Mode

The Vite dev server proxy is automatically configured to support BASE_PATH:

1. Set `BASE_PATH` in your `.env` file
2. Start the dev server: `pnpm dev`
3. Access the application through Vite: `http://localhost:5173`
4. All API calls are proxied correctly with the BASE_PATH prefix

## Testing

You can test the BASE_PATH configuration with curl:

```bash
# Set BASE_PATH=/mcphub/ in .env file

# Test config endpoint
curl http://localhost:3000/mcphub/config

# Test login
curl -X POST http://localhost:3000/mcphub/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

## Troubleshooting

### Issue: Login fails with BASE_PATH set

**Solution:** Make sure you're using version 0.10.4 or later, which includes the fix for BASE_PATH in development mode.

### Issue: 404 errors on API endpoints

**Symptoms:**
- Login returns 404
- Config endpoint returns 404
- API calls fail with 404

**Solution:**
1. Verify BASE_PATH is set correctly in `.env` file
2. Restart the backend server to pick up the new configuration
3. Check that you're accessing the correct URL with the BASE_PATH prefix

### Issue: Vite proxy not working

**Solution:**
1. Ensure you have the latest version of `frontend/vite.config.ts`
2. Restart the frontend dev server
3. Verify the BASE_PATH is being loaded from the `.env` file in the project root

## Implementation Details

### Backend (src/config/index.ts)

```typescript
const normalizeBasePath = (path: string): string => {
  if (!path) return '';
  return path.replace(/\/+$/, '');
};

const defaultConfig = {
  basePath: normalizeBasePath(process.env.BASE_PATH || ''),
  // ...
};
```

### Frontend (frontend/vite.config.ts)

```typescript
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  let basePath = env.BASE_PATH || '';
  basePath = basePath.replace(/\/+$/, '');
  
  const proxyConfig: Record<string, any> = {};
  const pathsToProxy = ['/api', '/config', '/public-config', '/health', '/oauth'];
  
  pathsToProxy.forEach((path) => {
    const proxyPath = basePath + path;
    proxyConfig[proxyPath] = {
      target: 'http://localhost:3000',
      changeOrigin: true,
    };
  });
  
  return {
    server: {
      proxy: proxyConfig,
    },
  };
});
```

### Frontend Runtime (frontend/src/utils/runtime.ts)

The frontend loads the BASE_PATH at runtime from the `/config` endpoint:

```typescript
export const loadRuntimeConfig = async (): Promise<RuntimeConfig> => {
  // Tries different possible config paths
  const response = await fetch('/config');
  const data = await response.json();
  return data.data; // Contains basePath, version, name
};
```

## Related Files

- `src/config/index.ts` - Backend BASE_PATH normalization
- `frontend/vite.config.ts` - Vite proxy configuration
- `frontend/src/utils/runtime.ts` - Frontend runtime config loading
- `tests/integration/base-path-routes.test.ts` - Integration tests
