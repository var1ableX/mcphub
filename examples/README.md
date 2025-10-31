# MCPHub Configuration Examples

This directory contains example configurations for various MCP servers and use cases.

## 📁 Directory Contents

### Atlassian/Jira Configuration

| File | Description | Best For |
|------|-------------|----------|
| [QUICK_START_JIRA.md](./QUICK_START_JIRA.md) | 5-minute quick start guide | Getting started fast with Jira Cloud |
| [README_ATLASSIAN_JIRA.md](./README_ATLASSIAN_JIRA.md) | Complete setup guide | Comprehensive setup with troubleshooting |
| [CONFIGURATION_SCREENSHOT_GUIDE.md](./CONFIGURATION_SCREENSHOT_GUIDE.md) | Visual configuration guide | Understanding the dashboard and logs |
| [mcp_settings_atlassian_jira.json](./mcp_settings_atlassian_jira.json) | Basic Jira configuration | Copy-paste configuration template |
| [.env.atlassian.example](./.env.atlassian.example) | Environment variables template | Setting up credentials securely |

### General Configuration Examples

| File | Description |
|------|-------------|
| [mcp_settings_with_env_vars.json](./mcp_settings_with_env_vars.json) | Environment variable examples for various server types (SSE, HTTP, stdio, OpenAPI) |
| [openapi-schema-config.json](./openapi-schema-config.json) | OpenAPI-based MCP server configuration examples |

## 🚀 Quick Start Guides

### For Jira Cloud Users

**New to MCPHub?** Start here: [QUICK_START_JIRA.md](./QUICK_START_JIRA.md)

This 5-minute guide covers:
- ✅ Getting your API token
- ✅ Basic configuration
- ✅ Starting MCPHub
- ✅ Verifying connection

### For Experienced Users

**Need detailed setup?** See: [README_ATLASSIAN_JIRA.md](./README_ATLASSIAN_JIRA.md)

This comprehensive guide includes:
- 📋 Both Jira and Confluence configuration
- 🔧 Multiple installation methods (uvx, python, docker)
- 🐛 Extensive troubleshooting section
- 🔒 Security best practices
- 💡 Example use cases

### Need Visual Guidance?

**Want to see what to expect?** Check: [CONFIGURATION_SCREENSHOT_GUIDE.md](./CONFIGURATION_SCREENSHOT_GUIDE.md)

This visual guide shows:
- 📊 Expected dashboard views
- ✅ Success indicators
- ❌ Common error messages
- 🧪 Test commands and expected outputs

## 📝 Configuration Templates

### Jira Cloud Only

Minimal configuration for Jira Cloud:

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
  }
}
```

### Jira + Confluence

Combined configuration:

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": [
        "mcp-atlassian",
        "--jira-url=${JIRA_URL}",
        "--jira-username=${JIRA_USERNAME}",
        "--jira-token=${JIRA_TOKEN}",
        "--confluence-url=${CONFLUENCE_URL}",
        "--confluence-username=${CONFLUENCE_USERNAME}",
        "--confluence-token=${CONFLUENCE_TOKEN}"
      ]
    }
  }
}
```

### Environment Variables

Create a `.env` file based on [.env.atlassian.example](./.env.atlassian.example):

```env
JIRA_URL=https://your-company.atlassian.net
JIRA_USERNAME=your.email@company.com
JIRA_TOKEN=your_api_token_here
```

## 🔐 Security Best Practices

1. **Never commit sensitive data**
   - ✅ Use `.env` files for credentials
   - ✅ Add `.env` to `.gitignore`
   - ✅ Use environment variable substitution: `${VAR_NAME}`

2. **Protect your API tokens**
   - ✅ Rotate tokens regularly
   - ✅ Use different tokens for dev/staging/prod
   - ✅ Revoke unused tokens immediately

3. **Secure your configuration**
   - ✅ Restrict file permissions on `.env` files
   - ✅ Use secrets management in production
   - ✅ Audit token usage regularly

## 🛠️ Common Use Cases

### Case 1: Development Environment

**Scenario**: Testing Jira integration locally

**Files needed**:
- `mcp_settings_atlassian_jira.json` → Copy to `mcp_settings.json`
- `.env.atlassian.example` → Copy to `.env` and fill in values

**Steps**:
1. Copy template files
2. Fill in your credentials
3. Run `pnpm dev`

### Case 2: Production Deployment

**Scenario**: Deploying MCPHub with Jira to production

**Approach**:
- Use environment variables in configuration
- Store secrets in your deployment platform's secrets manager
- Use Docker with environment file: `docker run --env-file .env ...`

### Case 3: Multiple Environments

**Scenario**: Separate dev, staging, prod configurations

**Structure**:
```
.env.development
.env.staging
.env.production
```

**Usage**:
```bash
# Development
docker run --env-file .env.development ...

# Staging
docker run --env-file .env.staging ...

# Production
docker run --env-file .env.production ...
```

## 🐛 Troubleshooting

### Quick Diagnostics

| Symptom | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| "uvx command not found" | UV not installed | Install UV: `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| "401 Unauthorized" | Wrong API token | Regenerate token at Atlassian settings |
| Server "Disconnected" | Missing env vars | Check `.env` file exists and has values |
| "Downloading cryptography" errors | Network/Python issue | Wait and retry, check internet connection |

### Detailed Troubleshooting

For comprehensive troubleshooting steps, see:
- [README_ATLASSIAN_JIRA.md - Troubleshooting Section](./README_ATLASSIAN_JIRA.md#troubleshooting)
- [CONFIGURATION_SCREENSHOT_GUIDE.md - Error Indicators](./CONFIGURATION_SCREENSHOT_GUIDE.md#-common-error-indicators)

## 📚 Additional Resources

### Official Documentation

- [MCPHub Documentation](https://docs.mcphubx.com/)
- [MCPHub GitHub Repository](https://github.com/samanhappy/mcphub)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)

### Atlassian Resources

- [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
- [Jira Cloud REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Confluence Cloud REST API](https://developer.atlassian.com/cloud/confluence/rest/v2/)
- [MCP Atlassian Server](https://github.com/sooperset/mcp-atlassian)

### Community Support

- [MCPHub Discord Community](https://discord.gg/qMKNsn5Q)
- [GitHub Issues](https://github.com/samanhappy/mcphub/issues)
- [GitHub Discussions](https://github.com/samanhappy/mcphub/discussions)

## 🤝 Contributing

Have a useful configuration example? We'd love to include it!

1. Create your example configuration
2. Add documentation explaining the setup
3. Submit a pull request to the repository

Example contributions:
- Configuration for other MCP servers
- Multi-server setup examples
- Docker Compose configurations
- Kubernetes deployment examples
- CI/CD integration examples

## 📄 License

All examples in this directory are provided under the same license as MCPHub (Apache 2.0).

Feel free to use, modify, and distribute these examples as needed for your projects.
