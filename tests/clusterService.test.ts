import { ClusterNodeConfig } from '../src/types/index.js';
import config from '../src/config/index.js';
import { __clusterInternals } from '../src/services/clusterService.js';

const { buildTargetUrl, normalizeBasePath, matchesNodeGroup, joinUrlPaths } = __clusterInternals;

describe('clusterService internals', () => {
  const originalBasePath = config.basePath;

  afterEach(() => {
    config.basePath = originalBasePath;
  });

  test('normalizeBasePath trims trailing slashes and enforces leading slash', () => {
    expect(normalizeBasePath('')).toBe('');
    expect(normalizeBasePath('/')).toBe('');
    expect(normalizeBasePath('/api/')).toBe('/api');
    expect(normalizeBasePath('api')).toBe('/api');
  });

  test('matchesNodeGroup recognises global shortcuts', () => {
    expect(matchesNodeGroup('', '')).toBe(true);
    expect(matchesNodeGroup('global', '')).toBe(true);
    expect(matchesNodeGroup('default', '')).toBe(true);
    expect(matchesNodeGroup('*', '')).toBe(true);
    expect(matchesNodeGroup('*', 'group-a')).toBe(true);
    expect(matchesNodeGroup('group-a', 'group-a')).toBe(true);
    expect(matchesNodeGroup('group-a', 'group-b')).toBe(false);
  });

  test('joinUrlPaths combines segments without duplicating slashes', () => {
    expect(joinUrlPaths('/', '/api', '/messages')).toBe('/api/messages');
    expect(joinUrlPaths('/root', '', '/')).toBe('/root');
    expect(joinUrlPaths('', '', '/tools')).toBe('/tools');
  });

  test('buildTargetUrl respects hub base path and node prefix', () => {
    config.basePath = '/hub';
    const node: ClusterNodeConfig = {
      id: 'node-1',
      url: 'http://backend:3000',
    };
    const target = buildTargetUrl(node, '/hub/mcp/alpha?foo=bar');
    expect(target.toString()).toBe('http://backend:3000/hub/mcp/alpha?foo=bar');
  });

  test('buildTargetUrl can override base path using node prefix', () => {
    config.basePath = '/hub';
    const node: ClusterNodeConfig = {
      id: 'node-1',
      url: 'http://backend:3000',
      pathPrefix: '/',
    };
    const target = buildTargetUrl(node, '/hub/mcp/alpha?foo=bar');
    expect(target.toString()).toBe('http://backend:3000/mcp/alpha?foo=bar');
  });

  test('buildTargetUrl appends to node URL path when provided', () => {
    config.basePath = '';
    const node: ClusterNodeConfig = {
      id: 'node-1',
      url: 'http://backend:3000/root',
    };
    const target = buildTargetUrl(node, '/messages?sessionId=123');
    expect(target.toString()).toBe('http://backend:3000/root/messages?sessionId=123');
  });
});
