import { createGroup, getAllGroups, deleteGroup } from '../../src/services/groupService.js';
import * as config from '../../src/config/index.js';
import { McpSettings } from '../../src/types/index.js';

// Mock the config module
jest.mock('../../src/config/index.js', () => {
  let mockSettings: McpSettings = {
    mcpServers: {
      'test-server': {
        command: 'test',
        args: [],
      },
    },
    groups: [],
    users: [],
  };

  return {
    loadSettings: jest.fn(() => mockSettings),
    saveSettings: jest.fn((settings: McpSettings) => {
      mockSettings = settings;
      return true;
    }),
    clearSettingsCache: jest.fn(),
  };
});

// Mock the mcpService
jest.mock('../../src/services/mcpService.js', () => ({
  notifyToolChanged: jest.fn(),
}));

// Mock the dataService
jest.mock('../../src/services/services.js', () => ({
  getDataService: jest.fn(() => ({
    filterData: (data: any[]) => data,
    filterSettings: (settings: any) => settings,
    mergeSettings: (all: any, newSettings: any) => newSettings,
    getPermissions: () => ['*'],
  })),
}));

describe('Group Service', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Reset the mock settings to initial state
    const mockSettings: McpSettings = {
      mcpServers: {
        'test-server': {
          command: 'test',
          args: [],
        },
        'test-server-2': {
          command: 'test2',
          args: [],
        },
      },
      groups: [],
      users: [],
    };

    (config.loadSettings as jest.Mock).mockReturnValue(mockSettings);
    (config.saveSettings as jest.Mock).mockImplementation((settings: McpSettings) => {
      mockSettings.groups = settings.groups;
      return true;
    });
  });

  describe('createGroup', () => {
    it('should create a new group and persist it', () => {
      const groupName = 'test-group';
      const description = 'Test group description';
      const servers = ['test-server'];

      const newGroup = createGroup(groupName, description, servers);

      expect(newGroup).not.toBeNull();
      expect(newGroup?.name).toBe(groupName);
      expect(newGroup?.description).toBe(description);
      expect(newGroup?.servers).toHaveLength(1);
      expect(newGroup?.servers[0]).toEqual({ name: 'test-server', tools: 'all' });

      // Verify saveSettings was called
      expect(config.saveSettings).toHaveBeenCalled();

      // Verify the settings passed to saveSettings include the new group
      const savedSettings = (config.saveSettings as jest.Mock).mock.calls[0][0];
      expect(savedSettings.groups).toHaveLength(1);
      expect(savedSettings.groups[0].name).toBe(groupName);
    });

    it('should create a group with multiple servers', () => {
      const groupName = 'multi-server-group';
      const servers = ['test-server', 'test-server-2'];

      const newGroup = createGroup(groupName, undefined, servers);

      expect(newGroup).not.toBeNull();
      expect(newGroup?.servers).toHaveLength(2);
      expect(newGroup?.servers[0]).toEqual({ name: 'test-server', tools: 'all' });
      expect(newGroup?.servers[1]).toEqual({ name: 'test-server-2', tools: 'all' });
    });

    it('should create a group with server configuration objects', () => {
      const groupName = 'config-group';
      const servers = [
        { name: 'test-server', tools: 'all' },
        { name: 'test-server-2', tools: ['tool1', 'tool2'] },
      ];

      const newGroup = createGroup(groupName, undefined, servers);

      expect(newGroup).not.toBeNull();
      expect(newGroup?.servers).toHaveLength(2);
      expect(newGroup?.servers[0]).toEqual({ name: 'test-server', tools: 'all' });
      expect(newGroup?.servers[1]).toEqual({ name: 'test-server-2', tools: ['tool1', 'tool2'] });
    });

    it('should filter out non-existent servers', () => {
      const groupName = 'filtered-group';
      const servers = ['test-server', 'non-existent-server'];

      const newGroup = createGroup(groupName, undefined, servers);

      expect(newGroup).not.toBeNull();
      expect(newGroup?.servers).toHaveLength(1);
      expect(newGroup?.servers[0]).toEqual({ name: 'test-server', tools: 'all' });
    });

    it('should not create a group with duplicate name', () => {
      const groupName = 'duplicate-group';

      // Create first group
      const firstGroup = createGroup(groupName, 'First group');
      expect(firstGroup).not.toBeNull();

      // Update the mock to include the first group
      const mockSettings: McpSettings = {
        mcpServers: {
          'test-server': {
            command: 'test',
            args: [],
          },
        },
        groups: [firstGroup!],
        users: [],
      };
      (config.loadSettings as jest.Mock).mockReturnValue(mockSettings);

      // Try to create second group with same name
      const secondGroup = createGroup(groupName, 'Second group');
      expect(secondGroup).toBeNull();
    });

    it('should set owner to admin by default', () => {
      const groupName = 'owned-group';

      const newGroup = createGroup(groupName);

      expect(newGroup).not.toBeNull();
      expect(newGroup?.owner).toBe('admin');
    });

    it('should set custom owner when provided', () => {
      const groupName = 'custom-owned-group';
      const owner = 'testuser';

      const newGroup = createGroup(groupName, undefined, [], owner);

      expect(newGroup).not.toBeNull();
      expect(newGroup?.owner).toBe(owner);
    });
  });

  describe('getAllGroups', () => {
    it('should return all groups', () => {
      const mockSettings: McpSettings = {
        mcpServers: {},
        groups: [
          {
            id: '1',
            name: 'group1',
            servers: [],
            owner: 'admin',
          },
          {
            id: '2',
            name: 'group2',
            servers: [],
            owner: 'admin',
          },
        ],
        users: [],
      };
      (config.loadSettings as jest.Mock).mockReturnValue(mockSettings);

      const groups = getAllGroups();

      expect(groups).toHaveLength(2);
      expect(groups[0].name).toBe('group1');
      expect(groups[1].name).toBe('group2');
    });

    it('should return empty array when no groups exist', () => {
      const mockSettings: McpSettings = {
        mcpServers: {},
        users: [],
      };
      (config.loadSettings as jest.Mock).mockReturnValue(mockSettings);

      const groups = getAllGroups();

      expect(groups).toEqual([]);
    });
  });

  describe('deleteGroup', () => {
    it('should delete a group by id', () => {
      const mockSettings: McpSettings = {
        mcpServers: {},
        groups: [
          {
            id: 'group-to-delete',
            name: 'Delete Me',
            servers: [],
            owner: 'admin',
          },
        ],
        users: [],
      };
      (config.loadSettings as jest.Mock).mockReturnValue(mockSettings);
      (config.saveSettings as jest.Mock).mockImplementation((settings: McpSettings) => {
        mockSettings.groups = settings.groups;
        return true;
      });

      const result = deleteGroup('group-to-delete');

      expect(result).toBe(true);
      expect(config.saveSettings).toHaveBeenCalled();

      // Verify the settings passed to saveSettings have the group removed
      const savedSettings = (config.saveSettings as jest.Mock).mock.calls[0][0];
      expect(savedSettings.groups).toHaveLength(0);
    });

    it('should return false when group does not exist', () => {
      const mockSettings: McpSettings = {
        mcpServers: {},
        groups: [],
        users: [],
      };
      (config.loadSettings as jest.Mock).mockReturnValue(mockSettings);

      const result = deleteGroup('non-existent-id');

      expect(result).toBe(false);
    });
  });
});
