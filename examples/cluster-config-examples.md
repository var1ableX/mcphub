# Cluster Configuration Examples

## Coordinator Node Configuration

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "enabled": true
    }
  },
  "users": [
    {
      "username": "admin",
      "password": "$2b$10$Vt7krIvjNgyN67LXqly0uOcTpN0LI55cYRbcKC71pUDAP0nJ7RPa.",
      "isAdmin": true
    }
  ],
  "systemConfig": {
    "cluster": {
      "enabled": true,
      "mode": "coordinator",
      "coordinator": {
        "nodeTimeout": 15000,
        "cleanupInterval": 30000,
        "stickySessionTimeout": 3600000
      },
      "stickySession": {
        "enabled": true,
        "strategy": "consistent-hash",
        "cookieName": "MCPHUB_NODE",
        "headerName": "X-MCPHub-Node"
      }
    },
    "routing": {
      "enableGlobalRoute": true,
      "enableGroupNameRoute": true,
      "enableBearerAuth": false
    }
  }
}
```

## Worker Node 1 Configuration

```json
{
  "mcpServers": {
    "amap": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": {
        "AMAP_MAPS_API_KEY": "${AMAP_MAPS_API_KEY}"
      },
      "enabled": true
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"],
      "enabled": true
    }
  },
  "systemConfig": {
    "cluster": {
      "enabled": true,
      "mode": "node",
      "node": {
        "id": "node-1",
        "name": "Worker Node 1",
        "coordinatorUrl": "http://coordinator:3000",
        "heartbeatInterval": 5000,
        "registerOnStartup": true
      }
    }
  }
}
```

## Worker Node 2 Configuration

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"],
      "enabled": true
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
        "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"
      },
      "enabled": true
    }
  },
  "systemConfig": {
    "cluster": {
      "enabled": true,
      "mode": "node",
      "node": {
        "id": "node-2",
        "name": "Worker Node 2",
        "coordinatorUrl": "http://coordinator:3000",
        "heartbeatInterval": 5000,
        "registerOnStartup": true
      }
    }
  }
}
```

## Docker Compose Example

```yaml
version: '3.8'

services:
  coordinator:
    image: samanhappy/mcphub:latest
    container_name: mcphub-coordinator
    hostname: coordinator
    ports:
      - "3000:3000"
    volumes:
      - ./examples/coordinator-config.json:/app/mcp_settings.json
      - coordinator-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3000
    networks:
      - mcphub-cluster
    restart: unless-stopped

  node1:
    image: samanhappy/mcphub:latest
    container_name: mcphub-node1
    hostname: node1
    volumes:
      - ./examples/node1-config.json:/app/mcp_settings.json
      - node1-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3001
      - AMAP_MAPS_API_KEY=${AMAP_MAPS_API_KEY}
    networks:
      - mcphub-cluster
    depends_on:
      - coordinator
    restart: unless-stopped

  node2:
    image: samanhappy/mcphub:latest
    container_name: mcphub-node2
    hostname: node2
    volumes:
      - ./examples/node2-config.json:/app/mcp_settings.json
      - node2-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3002
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
      - SLACK_TEAM_ID=${SLACK_TEAM_ID}
    networks:
      - mcphub-cluster
    depends_on:
      - coordinator
    restart: unless-stopped

networks:
  mcphub-cluster:
    driver: bridge

volumes:
  coordinator-data:
  node1-data:
  node2-data:
```

## Kubernetes Example

### ConfigMaps

**coordinator-config.yaml:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mcphub-coordinator-config
  namespace: mcphub
data:
  mcp_settings.json: |
    {
      "mcpServers": {
        "fetch": {
          "command": "uvx",
          "args": ["mcp-server-fetch"],
          "enabled": true
        }
      },
      "users": [
        {
          "username": "admin",
          "password": "$2b$10$Vt7krIvjNgyN67LXqly0uOcTpN0LI55cYRbcKC71pUDAP0nJ7RPa.",
          "isAdmin": true
        }
      ],
      "systemConfig": {
        "cluster": {
          "enabled": true,
          "mode": "coordinator",
          "coordinator": {
            "nodeTimeout": 15000,
            "cleanupInterval": 30000,
            "stickySessionTimeout": 3600000
          },
          "stickySession": {
            "enabled": true,
            "strategy": "consistent-hash"
          }
        }
      }
    }
```

**node-config.yaml:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: mcphub-node-config
  namespace: mcphub
data:
  mcp_settings.json: |
    {
      "mcpServers": {
        "playwright": {
          "command": "npx",
          "args": ["@playwright/mcp@latest", "--headless"],
          "enabled": true
        }
      },
      "systemConfig": {
        "cluster": {
          "enabled": true,
          "mode": "node",
          "node": {
            "coordinatorUrl": "http://mcphub-coordinator:3000",
            "heartbeatInterval": 5000,
            "registerOnStartup": true
          }
        }
      }
    }
```

### Deployments

**coordinator.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcphub-coordinator
  namespace: mcphub
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mcphub-coordinator
  template:
    metadata:
      labels:
        app: mcphub-coordinator
    spec:
      containers:
      - name: mcphub
        image: samanhappy/mcphub:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: production
        - name: PORT
          value: "3000"
        volumeMounts:
        - name: config
          mountPath: /app/mcp_settings.json
          subPath: mcp_settings.json
        - name: data
          mountPath: /app/data
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
      volumes:
      - name: config
        configMap:
          name: mcphub-coordinator-config
      - name: data
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: mcphub-coordinator
  namespace: mcphub
spec:
  selector:
    app: mcphub-coordinator
  ports:
  - port: 3000
    targetPort: 3000
    name: http
  type: LoadBalancer
```

**nodes.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcphub-node
  namespace: mcphub
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcphub-node
  template:
    metadata:
      labels:
        app: mcphub-node
    spec:
      containers:
      - name: mcphub
        image: samanhappy/mcphub:latest
        imagePullPolicy: Always
        env:
        - name: NODE_ENV
          value: production
        volumeMounts:
        - name: config
          mountPath: /app/mcp_settings.json
          subPath: mcp_settings.json
        - name: data
          mountPath: /app/data
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
      volumes:
      - name: config
        configMap:
          name: mcphub-node-config
      - name: data
        emptyDir: {}
```

## Environment Variables

Create a `.env` file for sensitive values:

```bash
# API Keys
AMAP_MAPS_API_KEY=your-amap-api-key
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_TEAM_ID=T01234567

# Optional: Custom ports
COORDINATOR_PORT=3000
NODE1_PORT=3001
NODE2_PORT=3002
```

## Testing the Cluster

After starting the cluster, test connectivity:

```bash
# Check coordinator health
curl http://localhost:3000/health

# Get cluster status
curl http://localhost:3000/api/cluster/status

# List all nodes
curl http://localhost:3000/api/cluster/nodes

# Test MCP endpoint
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

## Scaling

### Scale worker nodes (Docker Compose):

```bash
docker-compose up -d --scale node1=3
```

### Scale worker nodes (Kubernetes):

```bash
kubectl scale deployment mcphub-node --replicas=5 -n mcphub
```
