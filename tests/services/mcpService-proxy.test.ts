import { replaceEnvVars } from '../../src/config/index.js';
import { ServerConfig } from '../../src/types/index.js';

describe('MCP Service - Proxy Support', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Proxy environment variables in server configuration', () => {
    it('should expand HTTP_PROXY in env configuration', () => {
      process.env.HTTP_PROXY = 'http://proxy.example.com:8080';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-example'],
        env: {
          HTTP_PROXY: '${HTTP_PROXY}',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://proxy.example.com:8080');
    });

    it('should expand HTTPS_PROXY in env configuration', () => {
      process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'uvx',
        args: ['mcp-server-fetch'],
        env: {
          HTTPS_PROXY: '${HTTPS_PROXY}',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTPS_PROXY).toBe('http://proxy.example.com:8080');
    });

    it('should expand NO_PROXY in env configuration', () => {
      process.env.NO_PROXY = 'localhost,127.0.0.1,.local';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: {
          NO_PROXY: '${NO_PROXY}',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.NO_PROXY).toBe('localhost,127.0.0.1,.local');
    });

    it('should expand all proxy environment variables together', () => {
      process.env.HTTP_PROXY = 'http://proxy.example.com:8080';
      process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';
      process.env.NO_PROXY = 'localhost,127.0.0.1';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['my-server'],
        env: {
          HTTP_PROXY: '${HTTP_PROXY}',
          HTTPS_PROXY: '${HTTPS_PROXY}',
          NO_PROXY: '${NO_PROXY}',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://proxy.example.com:8080');
      expect(result.env?.HTTPS_PROXY).toBe('http://proxy.example.com:8080');
      expect(result.env?.NO_PROXY).toBe('localhost,127.0.0.1');
    });
  });

  describe('Static proxy configuration in server config', () => {
    it('should preserve static proxy values from server config', () => {
      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: 'http://custom-proxy.example.com:3128',
          HTTPS_PROXY: 'http://custom-proxy.example.com:3128',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://custom-proxy.example.com:3128');
      expect(result.env?.HTTPS_PROXY).toBe('http://custom-proxy.example.com:3128');
    });

    it('should expand environment variable references in proxy configuration', () => {
      process.env.PROXY_HOST = 'proxy.example.com';
      process.env.PROXY_PORT = '8080';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: 'http://${PROXY_HOST}:${PROXY_PORT}',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://proxy.example.com:8080');
    });

    it('should expand proxy URL from single environment variable', () => {
      process.env.COMPANY_PROXY = 'http://proxy.company.com:3128';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: '${COMPANY_PROXY}',
          HTTPS_PROXY: '${COMPANY_PROXY}',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://proxy.company.com:3128');
      expect(result.env?.HTTPS_PROXY).toBe('http://proxy.company.com:3128');
    });
  });

  describe('Proxy authentication', () => {
    it('should preserve proxy authentication in URL', () => {
      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: 'http://user:pass@proxy.example.com:8080',
          HTTPS_PROXY: 'http://user:pass@proxy.example.com:8080',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://user:pass@proxy.example.com:8080');
      expect(result.env?.HTTPS_PROXY).toBe('http://user:pass@proxy.example.com:8080');
    });

    it('should expand proxy credentials from environment variables', () => {
      process.env.PROXY_USERNAME = 'user';
      process.env.PROXY_PASSWORD = 'secret';
      process.env.PROXY_HOST = 'proxy.example.com';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: 'http://${PROXY_USERNAME}:${PROXY_PASSWORD}@${PROXY_HOST}:8080',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://user:secret@proxy.example.com:8080');
    });

    it('should expand complete proxy URL with credentials from environment variable', () => {
      process.env.AUTHENTICATED_PROXY = 'http://admin:password123@secure-proxy.local:3128';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: '${AUTHENTICATED_PROXY}',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://admin:password123@secure-proxy.local:3128');
    });
  });

  describe('NO_PROXY configuration', () => {
    it('should preserve NO_PROXY for excluding hosts', () => {
      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: 'http://proxy.example.com:8080',
          NO_PROXY: 'localhost,127.0.0.1,*.internal,.local',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.NO_PROXY).toBe('localhost,127.0.0.1,*.internal,.local');
    });

    it('should preserve NO_PROXY=* to disable proxy for all hosts', () => {
      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: 'http://proxy.example.com:8080',
          NO_PROXY: '*',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.NO_PROXY).toBe('*');
    });

    it('should expand NO_PROXY from environment variable', () => {
      process.env.COMPANY_NO_PROXY = 'localhost,127.0.0.1,*.company.com,.internal';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: 'http://proxy.company.com:8080',
          NO_PROXY: '${COMPANY_NO_PROXY}',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.NO_PROXY).toBe('localhost,127.0.0.1,*.company.com,.internal');
    });
  });

  describe('Mixed proxy configurations', () => {
    it('should support different proxies for different servers', () => {
      const config1: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'server1'],
        env: {
          HTTP_PROXY: 'http://proxy1.example.com:8080',
        },
      };

      const config2: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'server2'],
        env: {
          HTTP_PROXY: 'http://proxy2.example.com:3128',
        },
      };

      const result1 = replaceEnvVars(config1) as ServerConfig;
      const result2 = replaceEnvVars(config2) as ServerConfig;

      expect(result1.env?.HTTP_PROXY).toBe('http://proxy1.example.com:8080');
      expect(result2.env?.HTTP_PROXY).toBe('http://proxy2.example.com:3128');
    });

    it('should support proxy for some servers and not others', () => {
      const configWithProxy: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'external-server'],
        env: {
          HTTP_PROXY: 'http://proxy.example.com:8080',
        },
      };

      const configWithoutProxy: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'internal-server'],
        env: {
          NO_PROXY: '*',
        },
      };

      const result1 = replaceEnvVars(configWithProxy) as ServerConfig;
      const result2 = replaceEnvVars(configWithoutProxy) as ServerConfig;

      expect(result1.env?.HTTP_PROXY).toBe('http://proxy.example.com:8080');
      expect(result2.env?.NO_PROXY).toBe('*');
    });

    it('should support mixing environment variable references and static values', () => {
      process.env.PRIMARY_PROXY = 'http://proxy1.company.com:8080';

      const config1: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'server1'],
        env: {
          HTTP_PROXY: '${PRIMARY_PROXY}',
        },
      };

      const config2: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'server2'],
        env: {
          HTTP_PROXY: 'http://proxy2.company.com:3128',
        },
      };

      const result1 = replaceEnvVars(config1) as ServerConfig;
      const result2 = replaceEnvVars(config2) as ServerConfig;

      expect(result1.env?.HTTP_PROXY).toBe('http://proxy1.company.com:8080');
      expect(result2.env?.HTTP_PROXY).toBe('http://proxy2.company.com:3128');
    });
  });

  describe('Proxy with other environment variables', () => {
    it('should support proxy alongside API keys and other env vars', () => {
      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'my-server'],
        env: {
          HTTP_PROXY: 'http://proxy.example.com:8080',
          HTTPS_PROXY: 'http://proxy.example.com:8080',
          API_KEY: 'secret-key-123',
          DEBUG: 'true',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://proxy.example.com:8080');
      expect(result.env?.HTTPS_PROXY).toBe('http://proxy.example.com:8080');
      expect(result.env?.API_KEY).toBe('secret-key-123');
      expect(result.env?.DEBUG).toBe('true');
    });

    it('should expand mix of proxy and other environment variables', () => {
      process.env.PROXY_URL = 'http://proxy.company.com:8080';
      process.env.MY_API_KEY = 'api-key-xyz';
      process.env.DATABASE_URL = 'postgresql://localhost/mydb';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'uvx',
        args: ['mcp-server-example'],
        env: {
          HTTP_PROXY: '${PROXY_URL}',
          HTTPS_PROXY: '${PROXY_URL}',
          API_KEY: '${MY_API_KEY}',
          DATABASE_URL: '${DATABASE_URL}',
          DEBUG: 'true',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://proxy.company.com:8080');
      expect(result.env?.HTTPS_PROXY).toBe('http://proxy.company.com:8080');
      expect(result.env?.API_KEY).toBe('api-key-xyz');
      expect(result.env?.DATABASE_URL).toBe('postgresql://localhost/mydb');
      expect(result.env?.DEBUG).toBe('true');
    });
  });

  describe('Real-world proxy scenarios', () => {
    it('should handle corporate proxy configuration', () => {
      process.env.CORPORATE_PROXY = 'http://proxy.corp.com:8080';
      process.env.CORPORATE_NO_PROXY = 'localhost,127.0.0.1,*.corp.com,.internal';

      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-example'],
        env: {
          HTTP_PROXY: '${CORPORATE_PROXY}',
          HTTPS_PROXY: '${CORPORATE_PROXY}',
          NO_PROXY: '${CORPORATE_NO_PROXY}',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://proxy.corp.com:8080');
      expect(result.env?.HTTPS_PROXY).toBe('http://proxy.corp.com:8080');
      expect(result.env?.NO_PROXY).toBe('localhost,127.0.0.1,*.corp.com,.internal');
    });

    it('should handle Python package installation with proxy', () => {
      const config: ServerConfig = {
        type: 'stdio',
        command: 'uvx',
        args: ['mcp-server-fetch'],
        env: {
          HTTP_PROXY: 'http://proxy.example.com:8080',
          HTTPS_PROXY: 'http://proxy.example.com:8080',
          NO_PROXY: 'localhost,127.0.0.1',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://proxy.example.com:8080');
      expect(result.env?.HTTPS_PROXY).toBe('http://proxy.example.com:8080');
    });

    it('should handle NPM package installation with proxy', () => {
      const config: ServerConfig = {
        type: 'stdio',
        command: 'npx',
        args: ['@playwright/mcp@latest', '--headless'],
        env: {
          HTTP_PROXY: 'http://proxy.company.com:8080',
          HTTPS_PROXY: 'http://proxy.company.com:8080',
          NO_PROXY: 'localhost,127.0.0.1,.company.com',
        },
      };

      const result = replaceEnvVars(config) as ServerConfig;

      expect(result.env?.HTTP_PROXY).toBe('http://proxy.company.com:8080');
      expect(result.env?.HTTPS_PROXY).toBe('http://proxy.company.com:8080');
      expect(result.env?.NO_PROXY).toBe('localhost,127.0.0.1,.company.com');
    });
  });
});
