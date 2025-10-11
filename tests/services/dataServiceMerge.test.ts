import { DataServiceImpl } from '../../src/services/dataService.js';
import { DataServicex } from '../../src/services/dataServicex.js';
import { McpSettings, IUser } from '../../src/types/index.js';

describe('DataService mergeSettings', () => {
  describe('DataServiceImpl', () => {
    let service: DataServiceImpl;

    beforeEach(() => {
      service = new DataServiceImpl();
    });

    it('should merge all fields from newSettings into existing settings', () => {
      const all: McpSettings = {
        users: [
          { username: 'admin', password: 'hash1', isAdmin: true },
          { username: 'user1', password: 'hash2', isAdmin: false },
        ],
        mcpServers: {
          'server1': { command: 'cmd1', args: [] },
          'server2': { command: 'cmd2', args: [] },
        },
        groups: [
          { id: '1', name: 'group1', servers: [], owner: 'admin' },
        ],
        systemConfig: {
          routing: { enableGlobalRoute: true, enableGroupNameRoute: true },
        },
        userConfigs: {
          user1: { routing: { enableGlobalRoute: false, enableGroupNameRoute: false } },
        },
      };

      const newSettings: McpSettings = {
        mcpServers: {},
        groups: [
          { id: '1', name: 'group1', servers: [], owner: 'admin' },
          { id: '2', name: 'group2', servers: [], owner: 'admin' },
        ],
      };

      const result = service.mergeSettings(all, newSettings);

      // New groups should be present
      expect(result.groups).toHaveLength(2);
      expect(result.groups).toEqual(newSettings.groups);

      // Other fields from 'all' should be preserved when not in newSettings
      expect(result.users).toEqual(all.users);
      expect(result.systemConfig).toEqual(all.systemConfig);
      expect(result.userConfigs).toEqual(all.userConfigs);
    });

    it('should preserve fields not present in newSettings', () => {
      const all: McpSettings = {
        users: [{ username: 'admin', password: 'hash', isAdmin: true }],
        mcpServers: {
          'server1': { command: 'cmd1', args: [] },
        },
        groups: [{ id: '1', name: 'group1', servers: [], owner: 'admin' }],
        systemConfig: { routing: { enableGlobalRoute: true, enableGroupNameRoute: true } },
      };

      const newSettings: McpSettings = {
        mcpServers: {},
        groups: [
          { id: '1', name: 'group1', servers: [], owner: 'admin' },
          { id: '2', name: 'group2', servers: [], owner: 'admin' },
        ],
      };

      const result = service.mergeSettings(all, newSettings);

      // Groups from newSettings should be present
      expect(result.groups).toEqual(newSettings.groups);

      // Other fields should be preserved from 'all'
      expect(result.users).toEqual(all.users);
      expect(result.systemConfig).toEqual(all.systemConfig);
    });

    it('should handle undefined fields in newSettings', () => {
      const all: McpSettings = {
        users: [{ username: 'admin', password: 'hash', isAdmin: true }],
        mcpServers: { 'server1': { command: 'cmd1', args: [] } },
        groups: [{ id: '1', name: 'group1', servers: [], owner: 'admin' }],
      };

      const newSettings: McpSettings = {
        mcpServers: {},
        // groups is undefined
      };

      const result = service.mergeSettings(all, newSettings);

      // Groups from 'all' should be preserved since newSettings.groups is undefined
      expect(result.groups).toEqual(all.groups);
      expect(result.users).toEqual(all.users);
    });
  });

  describe('DataServicex', () => {
    let service: DataServicex;

    beforeEach(() => {
      service = new DataServicex();
    });

    it('should merge all fields for admin users', () => {
      const adminUser: IUser = { username: 'admin', password: 'hash', isAdmin: true };

      const all: McpSettings = {
        users: [adminUser],
        mcpServers: {
          'server1': { command: 'cmd1', args: [] },
        },
        groups: [{ id: '1', name: 'group1', servers: [], owner: 'admin' }],
        systemConfig: { routing: { enableGlobalRoute: true, enableGroupNameRoute: true } },
      };

      const newSettings: McpSettings = {
        mcpServers: {},
        groups: [
          { id: '1', name: 'group1', servers: [], owner: 'admin' },
          { id: '2', name: 'group2', servers: [], owner: 'admin' },
        ],
        systemConfig: { routing: { enableGlobalRoute: false, enableGroupNameRoute: false } },
      };

      const result = service.mergeSettings(all, newSettings, adminUser);

      // All fields from newSettings should be merged
      expect(result.groups).toEqual(newSettings.groups);
      expect(result.systemConfig).toEqual(newSettings.systemConfig);

      // Users should be preserved from 'all' since not in newSettings
      expect(result.users).toEqual(all.users);
    });

    it('should preserve groups for admin users when adding new groups', () => {
      const adminUser: IUser = { username: 'admin', password: 'hash', isAdmin: true };

      const all: McpSettings = {
        users: [adminUser],
        mcpServers: { 'server1': { command: 'cmd1', args: [] } },
        groups: [{ id: '1', name: 'group1', servers: [], owner: 'admin' }],
      };

      const newSettings: McpSettings = {
        mcpServers: {},
        groups: [
          { id: '1', name: 'group1', servers: [], owner: 'admin' },
          { id: '2', name: 'group2', servers: [], owner: 'admin' },
        ],
      };

      const result = service.mergeSettings(all, newSettings, adminUser);

      // New groups should be present
      expect(result.groups).toHaveLength(2);
      expect(result.groups).toEqual(newSettings.groups);
    });

    it('should handle non-admin users correctly', () => {
      const regularUser: IUser = { username: 'user1', password: 'hash', isAdmin: false };

      const all: McpSettings = {
        users: [regularUser],
        mcpServers: { 'server1': { command: 'cmd1', args: [] } },
        groups: [{ id: '1', name: 'group1', servers: [], owner: 'admin' }],
        userConfigs: {},
      };

      const newSettings: McpSettings = {
        mcpServers: {},
        systemConfig: {
          routing: {
            enableGlobalRoute: false,
            enableGroupNameRoute: false,
            enableBearerAuth: true,
            bearerAuthKey: 'test-key',
          },
        },
      };

      const result = service.mergeSettings(all, newSettings, regularUser);

      // For non-admin users, groups should not change
      expect(result.groups).toEqual(all.groups);

      // User config should be updated
      expect(result.userConfigs).toBeDefined();
      expect(result.userConfigs?.['user1']).toBeDefined();
      expect(result.userConfigs?.['user1'].routing).toEqual(newSettings.systemConfig?.routing);
    });

    it('should preserve all fields from original when only updating systemConfig', () => {
      const adminUser: IUser = { username: 'admin', password: 'hash', isAdmin: true };

      const all: McpSettings = {
        users: [adminUser],
        mcpServers: { 'server1': { command: 'cmd1', args: [] } },
        groups: [{ id: '1', name: 'group1', servers: [], owner: 'admin' }],
        systemConfig: { routing: { enableGlobalRoute: true, enableGroupNameRoute: true } },
      };

      const newSettings: McpSettings = {
        mcpServers: {},
        systemConfig: { routing: { enableGlobalRoute: false, enableGroupNameRoute: false } },
      };

      const result = service.mergeSettings(all, newSettings, adminUser);

      // Groups should be preserved from 'all' since not in newSettings
      expect(result.groups).toEqual(all.groups);
      // SystemConfig should be updated from newSettings
      expect(result.systemConfig).toEqual(newSettings.systemConfig);
      // Users should be preserved from 'all' since not in newSettings
      expect(result.users).toEqual(all.users);
      // mcpServers should be updated from newSettings (empty in this case)
      // This is expected behavior - when mcpServers is explicitly provided, it replaces the old value
      expect(result.mcpServers).toEqual(newSettings.mcpServers);
    });
  });
});
