import { IUser, McpSettings, UserConfig } from '../types/index.js';
import { DataService } from './dataService.js';
import { UserContextService } from './userContextService.js';

export class DataServicex implements DataService {
  foo() {
    console.log('default implementation');
  }

  filterData(data: any[], user?: IUser): any[] {
    // Use passed user parameter if available, otherwise fall back to context
    const currentUser = user || UserContextService.getInstance().getCurrentUser();
    if (!currentUser || currentUser.isAdmin) {
      return data;
    } else {
      return data.filter((item) => item.owner === currentUser?.username);
    }
  }

  filterSettings(settings: McpSettings, user?: IUser): McpSettings {
    // Use passed user parameter if available, otherwise fall back to context
    const currentUser = user || UserContextService.getInstance().getCurrentUser();
    if (!currentUser || currentUser.isAdmin) {
      const result = { ...settings };
      delete result.userConfigs;
      return result;
    } else {
      const result = { ...settings };
      result.systemConfig = settings.userConfigs?.[currentUser?.username || ''] || {};
      delete result.userConfigs;
      return result;
    }
  }

  mergeSettings(all: McpSettings, newSettings: McpSettings, user?: IUser): McpSettings {
    // Use passed user parameter if available, otherwise fall back to context
    const currentUser = user || UserContextService.getInstance().getCurrentUser();
    if (!currentUser || currentUser.isAdmin) {
      // Admin users can modify all settings
      const result = { ...all };
      // Merge all fields, using newSettings values when present
      if (newSettings.users !== undefined) result.users = newSettings.users;
      if (newSettings.mcpServers !== undefined) result.mcpServers = newSettings.mcpServers;
      if (newSettings.groups !== undefined) result.groups = newSettings.groups;
      if (newSettings.systemConfig !== undefined) result.systemConfig = newSettings.systemConfig;
      if (newSettings.userConfigs !== undefined) result.userConfigs = newSettings.userConfigs;
      return result;
    } else {
      // Non-admin users can only modify their own userConfig
      const result = JSON.parse(JSON.stringify(all));
      if (!result.userConfigs) {
        result.userConfigs = {};
      }
      const systemConfig = newSettings.systemConfig || {};
      const userConfig: UserConfig = {
        routing: systemConfig.routing
          ? {
              enableGlobalRoute: systemConfig.routing.enableGlobalRoute,
              enableGroupNameRoute: systemConfig.routing.enableGroupNameRoute,
              enableBearerAuth: systemConfig.routing.enableBearerAuth,
              bearerAuthKey: systemConfig.routing.bearerAuthKey,
            }
          : undefined,
      };
      result.userConfigs[currentUser?.username || ''] = userConfig;
      return result;
    }
  }

  getPermissions(user: IUser): string[] {
    if (user && user.isAdmin) {
      return ['*', 'x'];
    } else {
      return [''];
    }
  }
}
