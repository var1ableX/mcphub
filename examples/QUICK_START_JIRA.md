# Quick Start: Jira Cloud Integration

This is a quick 5-minute setup guide for connecting MCPHub to Jira Cloud.

## ⚡ Quick Setup (5 minutes)

### Step 1: Get Your Jira API Token (2 minutes)

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Click **"Create API token"**
3. Label it "MCPHub Integration"
4. **Copy the token** (you can't see it again!)

### Step 2: Find Your Jira URL (30 seconds)

Your Jira URL is what you see in your browser:
- Example: `https://mycompany.atlassian.net`
- ✅ Include: `https://` protocol
- ❌ Don't include: trailing `/` or `/jira`

### Step 3: Create .env File (1 minute)

Create a `.env` file in your MCPHub root directory:

```bash
JIRA_URL=https://mycompany.atlassian.net
JIRA_USERNAME=myemail@company.com
JIRA_TOKEN=paste_your_token_here
```

Replace with your actual values!

### Step 4: Update mcp_settings.json (1 minute)

Add this to your `mcp_settings.json`:

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

### Step 5: Install UV & Start MCPHub (1 minute)

#### Install UV (if not already installed):

**macOS/Linux:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows:**
```powershell
irm https://astral.sh/uv/install.ps1 | iex
```

#### Start MCPHub:

**With Docker:**
```bash
docker run -p 3000:3000 \
  --env-file .env \
  -v ./mcp_settings.json:/app/mcp_settings.json \
  samanhappy/mcphub
```

**Without Docker:**
```bash
pnpm install
pnpm dev
```

### Step 6: Verify Connection (30 seconds)

1. Open http://localhost:3000
2. Login with default credentials (see [README_ATLASSIAN_JIRA.md](./README_ATLASSIAN_JIRA.md#verification) for credentials)
   
   **⚠️ CRITICAL:** Immediately change the admin password through dashboard Settings → Users
   
3. Check dashboard - you should see "jira" server as "Connected" ✅

## 🎉 That's It!

You can now use Jira through MCPHub at:
- All servers: `http://localhost:3000/mcp`
- Jira only: `http://localhost:3000/mcp/jira`

## 🐛 Common Issues

### "uvx command not found"
```bash
# Install UV first (see Step 5)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### "401 Unauthorized"
- Double-check your API token
- Make sure username is your email
- Try regenerating the API token

### Server shows "Disconnected"
- Check logs for specific errors
- Verify .env file is in the correct location
- Ensure no trailing slashes in JIRA_URL

### "Downloading cryptography" errors
- This is usually temporary
- Wait and restart MCPHub
- Check internet connection

## 📚 Need More Help?

See [README_ATLASSIAN_JIRA.md](./README_ATLASSIAN_JIRA.md) for the complete guide with:
- Both Jira + Confluence setup
- Detailed troubleshooting
- Security best practices
- Example use cases

## 🔒 Security Reminder

- ✅ Never commit `.env` to git
- ✅ Keep API tokens secret
- ✅ Rotate tokens regularly
- ✅ Use different tokens for dev/prod
