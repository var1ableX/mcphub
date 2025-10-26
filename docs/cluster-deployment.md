# Cluster Deployment Guide

MCPHub supports cluster deployment, allowing you to run multiple nodes that work together as a unified system. This enables:

- **High Availability**: Distribute MCP servers across multiple nodes for redundancy
- **Load Distribution**: Balance requests across multiple replicas of the same MCP server
- **Sticky Sessions**: Ensure client sessions are routed to the same node consistently
- **Centralized Management**: One coordinator manages the entire cluster

## Architecture

MCPHub cluster has three operating modes:

1. **Standalone Mode** (Default): Single node operation, no cluster features
2. **Coordinator Mode**: Central node that manages the cluster, routes requests, and maintains session affinity
3. **Node Mode**: Worker nodes that register with the coordinator and run MCP servers

```
┌─────────────────────────────────────────┐
│         Coordinator Node                │
│  - Manages cluster state                │
│  - Routes client requests                │
│  - Maintains session affinity           │
│  - Health monitoring                    │
└───────────┬─────────────────────────────┘
            │
    ┌───────┴───────────────────┐
    │                           │
┌───▼────────┐         ┌────────▼────┐
│  Node 1    │         │   Node 2    │
│  - MCP A   │         │   - MCP A   │
│  - MCP B   │         │   - MCP C   │
└────────────┘         └─────────────┘
```

## Configuration

### Coordinator Configuration

Create or update `mcp_settings.json` on the coordinator node:

```json
{
  "mcpServers": {
    // Optional: coordinator can also run MCP servers
    "example": {
      "command": "npx",
      "args": ["-y", "example-mcp-server"]
    }
  },
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
    }
  }
}
```

**Configuration Options:**

- `nodeTimeout`: Time (ms) before marking a node as unhealthy (default: 15000)
- `cleanupInterval`: Interval (ms) for cleaning up inactive nodes (default: 30000)
- `stickySessionTimeout`: Session affinity timeout (ms) (default: 3600000 - 1 hour)
- `stickySession.enabled`: Enable sticky session routing (default: true)
- `stickySession.strategy`: Session affinity strategy:
  - `consistent-hash`: Hash-based routing (default)
  - `cookie`: Cookie-based routing
  - `header`: Header-based routing

### Node Configuration

Create or update `mcp_settings.json` on each worker node:

```json
{
  "mcpServers": {
    "amap": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"]
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

**Configuration Options:**

- `node.id`: Unique node identifier (auto-generated if not provided)
- `node.name`: Human-readable node name (defaults to hostname)
- `node.coordinatorUrl`: URL of the coordinator node (required)
- `node.heartbeatInterval`: Heartbeat interval (ms) (default: 5000)
- `node.registerOnStartup`: Auto-register on startup (default: true)

## Deployment Scenarios

### Scenario 1: Docker Compose

Create a `docker-compose.yml`:

```yaml
version: '3.8'

services:
  coordinator:
    image: samanhappy/mcphub:latest
    ports:
      - "3000:3000"
    volumes:
      - ./coordinator-config.json:/app/mcp_settings.json
      - coordinator-data:/app/data
    environment:
      - NODE_ENV=production

  node1:
    image: samanhappy/mcphub:latest
    volumes:
      - ./node1-config.json:/app/mcp_settings.json
      - node1-data:/app/data
    environment:
      - NODE_ENV=production
    depends_on:
      - coordinator

  node2:
    image: samanhappy/mcphub:latest
    volumes:
      - ./node2-config.json:/app/mcp_settings.json
      - node2-data:/app/data
    environment:
      - NODE_ENV=production
    depends_on:
      - coordinator

volumes:
  coordinator-data:
  node1-data:
  node2-data:
```

Start the cluster:

```bash
docker-compose up -d
```

### Scenario 2: Kubernetes

Create Kubernetes manifests:

**Coordinator Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcphub-coordinator
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
        ports:
        - containerPort: 3000
        volumeMounts:
        - name: config
          mountPath: /app/mcp_settings.json
          subPath: mcp_settings.json
      volumes:
      - name: config
        configMap:
          name: mcphub-coordinator-config
---
apiVersion: v1
kind: Service
metadata:
  name: mcphub-coordinator
spec:
  selector:
    app: mcphub-coordinator
  ports:
  - port: 3000
    targetPort: 3000
  type: LoadBalancer
```

**Worker Node Deployment:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcphub-node
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
        volumeMounts:
        - name: config
          mountPath: /app/mcp_settings.json
          subPath: mcp_settings.json
      volumes:
      - name: config
        configMap:
          name: mcphub-node-config
```

Apply the manifests:

```bash
kubectl apply -f coordinator.yaml
kubectl apply -f nodes.yaml
```

### Scenario 3: Manual Deployment

**On Coordinator (192.168.1.100):**

```bash
# Install MCPHub
npm install -g @samanhappy/mcphub

# Configure as coordinator
cat > mcp_settings.json <<EOF
{
  "systemConfig": {
    "cluster": {
      "enabled": true,
      "mode": "coordinator"
    }
  }
}
EOF

# Start coordinator
PORT=3000 mcphub
```

**On Node 1 (192.168.1.101):**

```bash
# Install MCPHub
npm install -g @samanhappy/mcphub

# Configure as node
cat > mcp_settings.json <<EOF
{
  "mcpServers": {
    "server1": { "command": "..." }
  },
  "systemConfig": {
    "cluster": {
      "enabled": true,
      "mode": "node",
      "node": {
        "coordinatorUrl": "http://192.168.1.100:3000"
      }
    }
  }
}
EOF

# Start node
PORT=3001 mcphub
```

**On Node 2 (192.168.1.102):**

```bash
# Similar to Node 1, but with PORT=3002
```

## Usage

### Accessing the Cluster

Once the cluster is running, connect AI clients to the coordinator's endpoint:

```
http://coordinator:3000/mcp
http://coordinator:3000/sse
```

The coordinator will:
1. Route requests to appropriate nodes based on session affinity
2. Load balance across multiple replicas of the same server
3. Automatically failover to healthy nodes

### Sticky Sessions

Sticky sessions ensure that a client's requests are routed to the same node throughout their session. This is important for:

- Maintaining conversation context
- Preserving temporary state
- Consistent tool execution

The default strategy is **consistent-hash**, which uses the session ID to determine the target node. Alternative strategies:

- **Cookie-based**: Uses `MCPHUB_NODE` cookie
- **Header-based**: Uses `X-MCPHub-Node` header

### Multiple Replicas

You can deploy the same MCP server on multiple nodes for:

- **Load balancing**: Distribute requests across replicas
- **High availability**: Failover if one node goes down

Example configuration:

**Node 1:**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

**Node 2:**
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    }
  }
}
```

The coordinator will automatically load balance requests to `playwright` across both nodes.

## Management API

The coordinator exposes cluster management endpoints:

### Get Cluster Status

```bash
curl http://coordinator:3000/api/cluster/status
```

Response:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "mode": "coordinator",
    "nodeId": "coordinator",
    "stats": {
      "nodes": 3,
      "activeNodes": 3,
      "servers": 5,
      "sessions": 10
    }
  }
}
```

### Get All Nodes

```bash
curl http://coordinator:3000/api/cluster/nodes
```

### Get Server Replicas

```bash
curl http://coordinator:3000/api/cluster/servers/playwright/replicas
```

### Get Session Affinity

```bash
curl http://coordinator:3000/api/cluster/sessions/{sessionId}
```

## Monitoring and Troubleshooting

### Check Node Health

Monitor coordinator logs for heartbeat messages:

```
Node registered: Worker Node 1 (node-1) with 2 servers
```

If a node becomes unhealthy:

```
Marking node node-1 as unhealthy (last heartbeat: 2024-01-01T10:00:00.000Z)
```

### Verify Registration

Check if nodes are registered:

```bash
curl http://coordinator:3000/api/cluster/nodes?active=true
```

### Session Affinity Issues

If sessions aren't sticking to the same node:

1. Verify sticky sessions are enabled in coordinator config
2. Check that session IDs are being passed correctly
3. Review coordinator logs for session affinity errors

### Network Connectivity

Ensure worker nodes can reach the coordinator:

```bash
# From worker node
curl http://coordinator:3000/health
```

## Performance Considerations

### Coordinator Load

The coordinator handles:
- Request routing
- Node heartbeats
- Session tracking

For very large clusters (>50 nodes), consider:
- Increasing coordinator resources
- Tuning heartbeat intervals
- Using header-based sticky sessions (lower overhead)

### Network Latency

Minimize latency between coordinator and nodes:
- Deploy in the same datacenter/region
- Use low-latency networking
- Consider coordinator placement near clients

### Session Timeout

Balance session timeout with resource usage:
- Shorter timeout: Less memory, more re-routing
- Longer timeout: Better stickiness, more memory

Default is 1 hour, adjust based on your use case.

## Limitations

1. **Stateful Sessions**: Node-local state is lost if a node fails. Use external storage for persistent state.
2. **Single Coordinator**: Currently supports one coordinator. Consider load balancing at the infrastructure level.
3. **Network Partitions**: Nodes that lose connection to coordinator will be marked unhealthy.

## Best Practices

1. **Use Groups**: Organize MCP servers into groups for easier management
2. **Monitor Health**: Set up alerts for unhealthy nodes
3. **Version Consistency**: Run the same MCPHub version across all nodes
4. **Resource Planning**: Allocate appropriate resources based on MCP server requirements
5. **Backup Configuration**: Keep coordinator config backed up
6. **Gradual Rollout**: Test cluster configuration with a small number of nodes first

## See Also

- [Docker Deployment](../deployment/docker.md)
- [Kubernetes Deployment](../deployment/kubernetes.md)
- [High Availability Setup](../deployment/high-availability.md)
