import { IUser, McpSettings } from '../types/index.js';

export interface DataService {
  foo(): void;
  filterData(data: any[], user?: IUser): any[];
  filterSettings(settings: McpSettings, user?: IUser): McpSettings;
  mergeSettings(all: McpSettings, newSettings: McpSettings, user?: IUser): McpSettings;
  getPermissions(user: IUser): string[];
}

export class DataServiceImpl implements DataService {
  foo() {
    console.log('default implementation');
  }

  filterData(data: any[], _user?: IUser): any[] {
    return data;
  }

  filterSettings(settings: McpSettings, _user?: IUser): McpSettings {
    return settings;
  }

  mergeSettings(all: McpSettings, newSettings: McpSettings, _user?: IUser): McpSettings {
    // Merge all fields from newSettings into all, preserving fields not present in newSettings
    return {
      ...all,
      ...newSettings,
      // Ensure arrays and objects are properly handled
      users: newSettings.users !== undefined ? newSettings.users : all.users,
      mcpServers: newSettings.mcpServers !== undefined ? newSettings.mcpServers : all.mcpServers,
      groups: newSettings.groups !== undefined ? newSettings.groups : all.groups,
      systemConfig:
        newSettings.systemConfig !== undefined ? newSettings.systemConfig : all.systemConfig,
      userConfigs:
        newSettings.userConfigs !== undefined ? newSettings.userConfigs : all.userConfigs,
    };
  }

  getPermissions(_user: IUser): string[] {
    return ['*'];
  }
}
