# Atlassian Jira Cloud MCP Server Configuration

This guide provides detailed instructions for configuring the MCP Atlassian server to connect to Jira Cloud in MCPHub.

## Prerequisites

1. **Jira Cloud Account**: You need access to a Jira Cloud instance
2. **API Token**: Generate an API token from your Atlassian account
3. **Python/UV**: The mcp-atlassian server requires Python and `uvx` (UV package manager)

## Step 1: Generate Jira API Token

1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **"Create API token"**
3. Give it a label (e.g., "MCPHub Integration")
4. Copy the generated token (you won't be able to see it again!)
5. Save it securely

## Step 2: Get Your Jira Information

You'll need the following information:

- **JIRA_URL**: Your Jira Cloud URL (e.g., `https://your-company.atlassian.net`)
- **JIRA_USERNAME**: Your Atlassian account email (e.g., `your.email@company.com`)
- **JIRA_TOKEN**: The API token you generated in Step 1

## Step 3: Set Environment Variables

Create or update your `.env` file in the MCPHub root directory:

```bash
# Jira Configuration
JIRA_URL=https://your-company.atlassian.net
JIRA_USERNAME=your.email@company.com
JIRA_TOKEN=your_api_token_here
```

**Important Security Note**: Never commit your `.env` file to version control. It should be listed in `.gitignore`.

## Step 4: Configure MCPHub

### Option 1: Using Environment Variables (Recommended)

Update your `mcp_settings.json`:

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": [
        "mcp-atlassian",
        "--jira-url=${JIRA_URL}",
        "--jira-username=${JIRA_USERNAME}",
        "--jira-token=${JIRA_TOKEN}"
      ],
      "env": {}
    }
  }
}
```

### Option 2: Direct Configuration (Not Recommended)

If you prefer not to use environment variables (less secure):

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": [
        "mcp-atlassian",
        "--jira-url=https://your-company.atlassian.net",
        "--jira-username=your.email@company.com",
        "--jira-token=your_api_token_here"
      ],
      "env": {}
    }
  }
}
```

### Option 3: Jira Only (Without Confluence)

If you only want to use Jira and not Confluence:

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
      ],
      "env": {}
    }
  }
}
```

### Option 4: Both Jira and Confluence

To use both Jira and Confluence, you'll need API tokens for both:

```bash
# .env file
JIRA_URL=https://your-company.atlassian.net
JIRA_USERNAME=your.email@company.com
JIRA_TOKEN=your_jira_api_token

CONFLUENCE_URL=https://your-company.atlassian.net/wiki
CONFLUENCE_USERNAME=your.email@company.com
CONFLUENCE_TOKEN=your_confluence_api_token
```

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "uvx",
      "args": [
        "mcp-atlassian",
        "--confluence-url=${CONFLUENCE_URL}",
        "--confluence-username=${CONFLUENCE_USERNAME}",
        "--confluence-token=${CONFLUENCE_TOKEN}",
        "--jira-url=${JIRA_URL}",
        "--jira-username=${JIRA_USERNAME}",
        "--jira-token=${JIRA_TOKEN}"
      ],
      "env": {}
    }
  }
}
```

**Note**: For Atlassian Cloud, you can often use the same API token for both Jira and Confluence.

## Step 5: Install UV (if not already installed)

The mcp-atlassian server uses `uvx` to run. Install UV if you haven't already:

### On macOS/Linux:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### On Windows:
```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### Using pip:
```bash
pip install uv
```

## Step 6: Start MCPHub

### Using Docker:
```bash
docker run -p 3000:3000 \
  -v ./mcp_settings.json:/app/mcp_settings.json \
  -v ./data:/app/data \
  -e JIRA_URL="${JIRA_URL}" \
  -e JIRA_USERNAME="${JIRA_USERNAME}" \
  -e JIRA_TOKEN="${JIRA_TOKEN}" \
  samanhappy/mcphub
```

### Using Development Mode:
```bash
pnpm install
pnpm dev
```

### Using Production Mode:
```bash
pnpm install
pnpm build
pnpm start
```

## Verification

After starting MCPHub:

1. Open `http://localhost:3000` in your browser
2. Log in with default credentials: `admin` / `admin123`
   
   **⚠️ SECURITY WARNING:** Change the default admin password immediately in production! The default password is only for initial setup and testing.
   
3. Check the dashboard to see if the Atlassian server is connected
4. Look for the server status - it should show as "Connected" or "Running"
5. Check the logs for any connection errors

## Troubleshooting

### Error: "uvx command not found"

**Solution**: Install UV as described in Step 5 above.

### Error: "Traceback (most recent call last): File ... mcp-atlassian"

This error usually indicates:
1. Missing or incorrect API credentials
2. Network connectivity issues
3. Python dependency issues

**Solutions**:
- Verify your API token is correct
- Ensure your Jira URL doesn't have trailing slashes
- Check that your username is the email address you use for Atlassian
- Verify network connectivity to your Jira instance
- Try regenerating your API token

### Error: "401 Unauthorized"

**Solution**: 
- Double-check your API token is correct
- Ensure you're using the email address associated with your Atlassian account
- Regenerate your API token if needed

### Error: "403 Forbidden"

**Solution**: 
- Check that your account has appropriate permissions in Jira
- Verify your Jira administrator hasn't restricted API access

### Error: Downloading cryptography errors

**Solution**:
- This is usually a transient network or Python package installation issue
- Wait a moment and try restarting MCPHub
- Ensure you have a stable internet connection
- If the issue persists, try installing mcp-atlassian manually:
  ```bash
  uvx mcp-atlassian --help
  ```

### Server shows as "Disconnected"

**Solution**:
1. Check MCPHub logs for specific error messages
2. Verify all environment variables are set correctly
3. Test the connection manually:
   ```bash
   uvx mcp-atlassian \
     --jira-url=https://your-company.atlassian.net \
     --jira-username=your.email@company.com \
     --jira-token=your_token
   ```

## Using the Jira MCP Server

Once connected, you can use the Jira MCP server to:

- **Search Issues**: Query Jira issues using JQL
- **Read Issues**: Get detailed information about specific issues
- **Access Projects**: List and retrieve project metadata
- **View Comments**: Read issue comments and discussions
- **Get Transitions**: Check available status transitions for issues

Access the server through:
- **All servers**: `http://localhost:3000/mcp`
- **Specific server**: `http://localhost:3000/mcp/atlassian`
- **Server groups**: `http://localhost:3000/mcp/{group}` (if configured)

## Additional Resources

- [MCP Atlassian GitHub Repository](https://github.com/sooperset/mcp-atlassian)
- [Atlassian API Token Documentation](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/)
- [Jira Cloud REST API](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [MCPHub Documentation](https://docs.mcphubx.com/)

## Security Best Practices

1. ✅ **Always use environment variables** for sensitive credentials
2. ✅ **Never commit `.env` files** to version control
3. ✅ **Rotate API tokens** regularly
4. ✅ **Use separate tokens** for different environments (dev, staging, prod)
5. ✅ **Restrict API token permissions** to only what's needed
6. ✅ **Monitor token usage** in Atlassian account settings
7. ✅ **Revoke unused tokens** immediately

## Example Use Cases

### Example 1: Search for Issues
Query: "List all open bugs assigned to me"
- Tool: `jira_search_issues`
- JQL: `project = MYPROJECT AND status = Open AND assignee = currentUser() AND type = Bug`

### Example 2: Get Issue Details
Query: "Show me details of issue PROJ-123"
- Tool: `jira_get_issue`
- Issue Key: `PROJ-123`

### Example 3: List Projects
Query: "What Jira projects do I have access to?"
- Tool: `jira_list_projects`

## Need Help?

If you're still experiencing issues:

1. Check the [MCPHub Discord community](https://discord.gg/qMKNsn5Q)
2. Review [MCPHub GitHub Issues](https://github.com/samanhappy/mcphub/issues)
3. Check [mcp-atlassian Issues](https://github.com/sooperset/mcp-atlassian/issues)
4. Contact your Jira administrator for API access questions
