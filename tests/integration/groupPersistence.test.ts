/**
 * Integration test for group persistence
 * This test verifies that groups can be created and persisted through the full stack
 */
import fs from 'fs';
import path from 'path';
import { getAllGroups, createGroup, deleteGroup } from '../../src/services/groupService.js';
import * as config from '../../src/config/index.js';

describe('Group Persistence Integration Tests', () => {
  const testSettingsPath = path.join(__dirname, '..', 'fixtures', 'test_mcp_settings.json');
  let originalGetConfigFilePath: any;

  beforeAll(async () => {
    // Mock getConfigFilePath to use our test settings file
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pathModule = require('../../src/utils/path.js');
    originalGetConfigFilePath = pathModule.getConfigFilePath;
    pathModule.getConfigFilePath = (filename: string) => {
      if (filename === 'mcp_settings.json') {
        return testSettingsPath;
      }
      return originalGetConfigFilePath(filename);
    };

    // Create test settings file
    const testSettings = {
      mcpServers: {
        'test-server-1': {
          command: 'echo',
          args: ['test1'],
        },
        'test-server-2': {
          command: 'echo',
          args: ['test2'],
        },
      },
      groups: [],
      users: [{ username: 'admin', password: 'hash', isAdmin: true }],
    };

    // Ensure fixtures directory exists
    const fixturesDir = path.dirname(testSettingsPath);
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    fs.writeFileSync(testSettingsPath, JSON.stringify(testSettings, null, 2));
  });

  afterAll(() => {
    // Restore original function
    if (originalGetConfigFilePath) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pathModule = require('../../src/utils/path.js');
      pathModule.getConfigFilePath = originalGetConfigFilePath;
    }

    // Clean up test file
    if (fs.existsSync(testSettingsPath)) {
      fs.unlinkSync(testSettingsPath);
    }
  });

  beforeEach(() => {
    // Clear the settings cache before each test
    config.clearSettingsCache();

    // Reset test settings file to clean state
    const testSettings = {
      mcpServers: {
        'test-server-1': {
          command: 'echo',
          args: ['test1'],
        },
        'test-server-2': {
          command: 'echo',
          args: ['test2'],
        },
      },
      groups: [],
      users: [{ username: 'admin', password: 'hash', isAdmin: true }],
    };

    fs.writeFileSync(testSettingsPath, JSON.stringify(testSettings, null, 2));
  });

  it('should persist a newly created group to file', () => {
    // Create a group
    const groupName = 'integration-test-group';
    const description = 'Test group for integration testing';
    const servers = ['test-server-1'];

    const newGroup = createGroup(groupName, description, servers);

    expect(newGroup).not.toBeNull();
    expect(newGroup?.name).toBe(groupName);

    // Clear cache and reload settings from file
    config.clearSettingsCache();

    // Verify group was persisted to file
    const savedSettings = JSON.parse(fs.readFileSync(testSettingsPath, 'utf8'));
    expect(savedSettings.groups).toHaveLength(1);
    expect(savedSettings.groups[0].name).toBe(groupName);
    expect(savedSettings.groups[0].description).toBe(description);
    expect(savedSettings.groups[0].servers).toHaveLength(1);
    expect(savedSettings.groups[0].servers[0]).toEqual({ name: 'test-server-1', tools: 'all' });
  });

  it('should persist multiple groups sequentially', () => {
    // Create first group
    const group1 = createGroup('group-1', 'First group', ['test-server-1']);
    expect(group1).not.toBeNull();

    // Clear cache
    config.clearSettingsCache();

    // Create second group
    const group2 = createGroup('group-2', 'Second group', ['test-server-2']);
    expect(group2).not.toBeNull();

    // Clear cache and verify both groups are persisted
    config.clearSettingsCache();
    const savedSettings = JSON.parse(fs.readFileSync(testSettingsPath, 'utf8'));
    expect(savedSettings.groups).toHaveLength(2);
    expect(savedSettings.groups[0].name).toBe('group-1');
    expect(savedSettings.groups[1].name).toBe('group-2');
  });

  it('should preserve mcpServers when creating groups', () => {
    // Get initial mcpServers
    const initialSettings = JSON.parse(fs.readFileSync(testSettingsPath, 'utf8'));
    const initialServers = initialSettings.mcpServers;

    // Create a group
    const newGroup = createGroup('test-group', 'Test', ['test-server-1']);
    expect(newGroup).not.toBeNull();

    // Verify mcpServers are preserved
    config.clearSettingsCache();
    const savedSettings = JSON.parse(fs.readFileSync(testSettingsPath, 'utf8'));
    expect(savedSettings.mcpServers).toEqual(initialServers);
    expect(savedSettings.groups).toHaveLength(1);
  });

  it('should allow deleting a persisted group', () => {
    // Create a group
    const newGroup = createGroup('temp-group', 'Temporary', ['test-server-1']);
    expect(newGroup).not.toBeNull();

    const groupId = newGroup!.id;

    // Verify it's saved
    config.clearSettingsCache();
    let savedSettings = JSON.parse(fs.readFileSync(testSettingsPath, 'utf8'));
    expect(savedSettings.groups).toHaveLength(1);

    // Delete the group
    const deleted = deleteGroup(groupId);
    expect(deleted).toBe(true);

    // Verify it's deleted from file
    config.clearSettingsCache();
    savedSettings = JSON.parse(fs.readFileSync(testSettingsPath, 'utf8'));
    expect(savedSettings.groups).toHaveLength(0);
  });

  it('should handle empty groups array correctly', () => {
    // Get all groups when none exist
    const groups = getAllGroups();
    expect(groups).toEqual([]);

    // Create a group
    createGroup('first-group', 'First', ['test-server-1']);

    // Clear cache and get groups again
    config.clearSettingsCache();
    const groupsAfterCreate = getAllGroups();
    expect(groupsAfterCreate).toHaveLength(1);
  });
});
