# Atlassian/Jira Configuration Screenshot Guide

This guide shows what your configuration should look like at each step.

## 📋 Configuration File Structure

Your `mcp_settings.json` should look like this:

```json
{
  "mcpServers": {
    "jira": {
      "command": "uvx",
      "args": [
        "mcp-atlassian",
        "--jira-url=${JIRA_URL}",
        "--jira-username=${JIRA_USERNAME}",
        "--jira-token=${JIRA_TOKEN}"
      ]
    }
  },
  "users": [
    {
      "username": "admin",
      "password": "$2b$10$Vt7krIvjNgyN67LXqly0uOcTpN0LI55cYRbcKC71pUDAP0nJ7RPa.",
      "isAdmin": true
    }
  ]
}
```

## 📁 File Structure

Your project should have these files:

```
mcphub/
├── mcp_settings.json          ← Your configuration file
├── .env                        ← Your environment variables (DO NOT COMMIT!)
├── data/                       ← Database directory (auto-created)
└── ...
```

## 🔐 Environment Variables (.env file)

```env
# .env file content
JIRA_URL=https://mycompany.atlassian.net
JIRA_USERNAME=myemail@company.com
JIRA_TOKEN=ATBBxxxxxxxxxxxxxxxxxxx
```

## 🎯 Expected Dashboard View

After starting MCPHub, you should see:

### 1. Server List View
```
┌─────────────────────────────────────────────────┐
│ MCP Servers                                     │
├─────────────────────────────────────────────────┤
│                                                 │
│ ✅ jira                                         │
│    Status: Connected                            │
│    Type: stdio                                  │
│    Command: uvx mcp-atlassian                   │
│    Tools: 15 available                          │
│                                                 │
│    [View Details] [Restart] [Stop]              │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 2. Server Details View
```
┌─────────────────────────────────────────────────┐
│ Server: jira                                    │
├─────────────────────────────────────────────────┤
│                                                 │
│ Status: ✅ Connected                            │
│ Type: stdio                                     │
│ Command: uvx                                    │
│                                                 │
│ Available Tools:                                │
│  • jira_search_issues                          │
│  • jira_get_issue                              │
│  • jira_list_projects                          │
│  • jira_get_project                            │
│  • ... and 11 more                             │
│                                                 │
│ Logs:                                           │
│  [INFO] Successfully connected to Jira         │
│  [INFO] Loaded 15 tools                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3. Connection Endpoints

Once connected, your Jira server is available at:

| Endpoint | URL | Description |
|----------|-----|-------------|
| All Servers | `http://localhost:3000/mcp` | Access all configured MCP servers |
| Jira Only | `http://localhost:3000/mcp/jira` | Direct access to Jira server |
| SSE (Legacy) | `http://localhost:3000/sse/jira` | SSE endpoint for Jira |

## ✅ Success Indicators

You'll know the configuration is working when you see:

1. **✅ Green status indicator** next to the server name
2. **"Connected" status** in the server details
3. **Tool count showing** (e.g., "15 tools available")
4. **No error messages** in the logs
5. **Server responds** to health check requests

## ❌ Common Error Indicators

### Connection Failed
```
┌─────────────────────────────────────────────────┐
│ ❌ jira                                          │
│    Status: Disconnected                         │
│    Error: Failed to start server                │
│    Last error: 401 Unauthorized                 │
│                                                 │
│    Possible causes:                             │
│    • Invalid API token                          │
│    • Wrong username/email                       │
│    • Incorrect Jira URL                         │
└─────────────────────────────────────────────────┘
```

### UVX Not Found
```
┌─────────────────────────────────────────────────┐
│ ❌ jira                                          │
│    Status: Error                                │
│    Error: Command not found: uvx                │
│                                                 │
│    Solution: Install UV                         │
│    curl -LsSf https://astral.sh/uv/install.sh | sh │
└─────────────────────────────────────────────────┘
```

### Environment Variable Not Set
```
┌─────────────────────────────────────────────────┐
│ ⚠️  jira                                         │
│    Status: Configuration Error                  │
│    Error: Environment variable JIRA_TOKEN not found │
│                                                 │
│    Solution: Check your .env file               │
└─────────────────────────────────────────────────┘
```

## 🧪 Testing Your Configuration

### Test 1: Health Check
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "servers": {
    "jira": "connected"
  }
}
```

### Test 2: List Servers
```bash
curl http://localhost:3000/api/servers
```

Expected response:
```json
{
  "servers": [
    {
      "name": "jira",
      "status": "connected",
      "type": "stdio",
      "toolCount": 15
    }
  ]
}
```

### Test 3: MCP Endpoint
```bash
curl http://localhost:3000/mcp/jira \
  -H "Content-Type: application/json" \
  -d '{
    "method": "tools/list",
    "params": {}
  }'
```

Expected response: List of available Jira tools

## 📊 Log Messages Explained

### Successful Startup
```
[INFO] Loading configuration from mcp_settings.json
[INFO] Found 1 MCP server(s) to initialize
[INFO] Starting server: jira
[INFO] Executing: uvx mcp-atlassian --jira-url=https://...
[INFO] Successfully connected client for server: jira
[INFO] Successfully listed 15 tools for server: jira
[INFO] ✅ Server jira is ready
```

### Connection Issues
```
[ERROR] Failed to start server: jira
[ERROR] Error: spawn uvx ENOENT
[WARN] Server jira will retry in 5 seconds
```

### Authentication Issues
```
[ERROR] Failed to connect to Jira
[ERROR] HTTP 401: Unauthorized
[ERROR] Please check your API token and credentials
```

## 🔍 Debugging Steps

If your server shows as disconnected:

1. **Check logs** in the dashboard or console
2. **Verify environment variables** are set correctly
3. **Test manually** with uvx:
   ```bash
   uvx mcp-atlassian --jira-url=https://your-company.atlassian.net --jira-username=your@email.com --jira-token=your_token
   ```
4. **Check network connectivity** to Jira
5. **Verify API token** is still valid
6. **Restart MCPHub** after making changes

## 📚 Additional Resources

- [Quick Start Guide](./QUICK_START_JIRA.md)
- [Complete Setup Guide](./README_ATLASSIAN_JIRA.md)
- [MCPHub Documentation](https://docs.mcphubx.com/)
- [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
