# 集群部署指南

MCPHub 支持集群部署，允许多个节点协同工作组成一个统一的系统。这提供了：

- **高可用性**：将 MCP 服务器分布在多个节点上实现冗余
- **负载分配**：在同一 MCP 服务器的多个副本之间平衡请求
- **会话粘性**：确保客户端会话一致性地路由到同一节点
- **集中管理**：一个协调器管理整个集群

## 架构

MCPHub 集群有三种运行模式：

1. **独立模式**（默认）：单节点运行，无集群功能
2. **协调器模式**：管理集群、路由请求、维护会话亲和性的中心节点
3. **节点模式**：向协调器注册并运行 MCP 服务器的工作节点

```
┌─────────────────────────────────────────┐
│         协调器节点                       │
│  - 管理集群状态                          │
│  - 路由客户端请求                        │
│  - 维护会话亲和性                        │
│  - 健康监控                             │
└───────────┬─────────────────────────────┘
            │
    ┌───────┴───────────────────┐
    │                           │
┌───▼────────┐         ┌────────▼────┐
│  节点 1    │         │   节点 2    │
│  - MCP A   │         │   - MCP A   │
│  - MCP B   │         │   - MCP C   │
└────────────┘         └─────────────┘
```

## 配置

### 协调器配置

在协调器节点上创建或更新 `mcp_settings.json`：

```json
{
  "mcpServers": {
    // 可选：协调器也可以运行 MCP 服务器
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

**配置选项：**

- `nodeTimeout`: 将节点标记为不健康之前的时间（毫秒）（默认：15000）
- `cleanupInterval`: 清理不活跃节点的间隔（毫秒）（默认：30000）
- `stickySessionTimeout`: 会话亲和性超时（毫秒）（默认：3600000 - 1小时）
- `stickySession.enabled`: 启用会话粘性路由（默认：true）
- `stickySession.strategy`: 会话亲和性策略：
  - `consistent-hash`: 基于哈希的路由（默认）
  - `cookie`: 基于 Cookie 的路由
  - `header`: 基于请求头的路由

### 节点配置

在每个工作节点上创建或更新 `mcp_settings.json`：

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
        "name": "工作节点 1",
        "coordinatorUrl": "http://coordinator:3000",
        "heartbeatInterval": 5000,
        "registerOnStartup": true
      }
    }
  }
}
```

**配置选项：**

- `node.id`: 唯一节点标识符（如未提供则自动生成）
- `node.name`: 人类可读的节点名称（默认为主机名）
- `node.coordinatorUrl`: 协调器节点的 URL（必需）
- `node.heartbeatInterval`: 心跳间隔（毫秒）（默认：5000）
- `node.registerOnStartup`: 启动时自动注册（默认：true）

## 部署场景

### 场景 1：Docker Compose

创建 `docker-compose.yml`：

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

启动集群：

```bash
docker-compose up -d
```

### 场景 2：Kubernetes

创建 Kubernetes 清单：

**协调器部署：**

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

**工作节点部署：**

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

应用清单：

```bash
kubectl apply -f coordinator.yaml
kubectl apply -f nodes.yaml
```

### 场景 3：手动部署

**在协调器上（192.168.1.100）：**

```bash
# 安装 MCPHub
npm install -g @samanhappy/mcphub

# 配置为协调器
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

# 启动协调器
PORT=3000 mcphub
```

**在节点 1 上（192.168.1.101）：**

```bash
# 安装 MCPHub
npm install -g @samanhappy/mcphub

# 配置为节点
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

# 启动节点
PORT=3001 mcphub
```

## 使用方法

### 访问集群

集群运行后，将 AI 客户端连接到协调器的端点：

```
http://coordinator:3000/mcp
http://coordinator:3000/sse
```

协调器将：
1. 根据会话亲和性将请求路由到适当的节点
2. 在同一服务器的多个副本之间进行负载均衡
3. 自动故障转移到健康的节点

### 会话粘性

会话粘性确保客户端的请求在整个会话期间路由到同一节点。这对于以下场景很重要：

- 维护对话上下文
- 保持临时状态
- 一致的工具执行

默认策略是 **consistent-hash**，使用会话 ID 来确定目标节点。替代策略：

- **Cookie-based**: 使用 `MCPHUB_NODE` cookie
- **Header-based**: 使用 `X-MCPHub-Node` 请求头

### 多副本

您可以在多个节点上部署相同的 MCP 服务器以实现：

- **负载均衡**：在副本之间分配请求
- **高可用性**：如果一个节点宕机则故障转移

配置示例：

**节点 1：**
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

**节点 2：**
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

协调器将自动在两个节点之间对 `playwright` 的请求进行负载均衡。

## 管理 API

协调器公开集群管理端点：

### 获取集群状态

```bash
curl http://coordinator:3000/api/cluster/status
```

响应：
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

### 获取所有节点

```bash
curl http://coordinator:3000/api/cluster/nodes
```

### 获取服务器副本

```bash
curl http://coordinator:3000/api/cluster/servers/playwright/replicas
```

### 获取会话亲和性

```bash
curl http://coordinator:3000/api/cluster/sessions/{sessionId}
```

## 监控和故障排除

### 检查节点健康

监控协调器日志以查看心跳消息：

```
Node registered: Worker Node 1 (node-1) with 2 servers
```

如果节点变得不健康：

```
Marking node node-1 as unhealthy (last heartbeat: 2024-01-01T10:00:00.000Z)
```

### 验证注册

检查节点是否已注册：

```bash
curl http://coordinator:3000/api/cluster/nodes?active=true
```

### 会话亲和性问题

如果会话没有粘性到同一节点：

1. 验证协调器配置中是否启用了会话粘性
2. 检查会话 ID 是否正确传递
3. 查看协调器日志以查找会话亲和性错误

### 网络连接

确保工作节点可以访问协调器：

```bash
# 从工作节点
curl http://coordinator:3000/health
```

## 性能考虑

### 协调器负载

协调器处理：
- 请求路由
- 节点心跳
- 会话跟踪

对于非常大的集群（>50个节点），考虑：
- 增加协调器资源
- 调整心跳间隔
- 使用基于请求头的会话粘性（开销更低）

### 网络延迟

最小化协调器和节点之间的延迟：
- 在同一数据中心/地区部署
- 使用低延迟网络
- 考虑协调器放置在接近客户端的位置

### 会话超时

平衡会话超时与资源使用：
- 较短超时：更少内存，更多重新路由
- 较长超时：更好的粘性，更多内存

默认为 1 小时，根据您的用例进行调整。

## 限制

1. **有状态会话**：如果节点失败，节点本地状态会丢失。使用外部存储实现持久状态。
2. **单协调器**：当前支持一个协调器。考虑在基础设施级别进行负载均衡。
3. **网络分区**：失去与协调器连接的节点将被标记为不健康。

## 最佳实践

1. **使用分组**：将 MCP 服务器组织到分组中以便更容易管理
2. **监控健康**：为不健康的节点设置告警
3. **版本一致性**：在所有节点上运行相同的 MCPHub 版本
4. **资源规划**：根据 MCP 服务器要求分配适当的资源
5. **备份配置**：保持协调器配置的备份
6. **逐步推出**：首先使用少量节点测试集群配置

## 相关文档

- [Docker 部署](../deployment/docker.md)
- [Kubernetes 部署](../deployment/kubernetes.md)
- [高可用性设置](../deployment/high-availability.md)
