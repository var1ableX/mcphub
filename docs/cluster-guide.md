# MCPHub Cluster Mode

This document explains how to run multiple `mcphub` nodes as a cohesive cluster so that clients see a single stable MCP/SSE endpoint.

## High-Level Behaviour

- Every node loads the same `systemConfig.cluster` block from `mcp_settings.json`.
- When cluster mode is enabled each node:
  - Registers itself (node id, base URL and local MCP servers) with the chosen coordinator backend.
  - Publishes every upstream MCP server it has connected so the rest of the cluster can discover it.
  - Stores session → node affinity for SSE and streamable HTTP sessions to guarantee sticky routing.
- Incoming traffic can hit any node. If the active session lives on another node, the request is transparently proxied (`fetch`-style) to the owning node. The external endpoint path never changes.
- Local transports are cleaned up on disconnect which also releases the cluster session mapping.

## Configuration

Add a `cluster` block under `systemConfig` inside `mcp_settings.json`. The example below enables two nodes that share a Redis coordinator.

```jsonc
{
  "systemConfig": {
    "cluster": {
      "enabled": true,
      "nodeId": "node-a",
      "baseUrl": "http://node-a:3000",
      "nodes": [
        { "nodeId": "node-a", "baseUrl": "http://node-a:3000" },
        { "nodeId": "node-b", "baseUrl": "http://node-b:3000" }
      ],
      "coordinator": {
        "type": "redis",
        "redisUrl": "redis://redis.service.local:6379",
        "keyPrefix": "mcphub",
        "heartbeatIntervalMs": 10000,
        "offlineAfterMs": 45000
      },
      "session": {
        "stickyKey": "sessionId",
        "ttlSeconds": 600
      }
    }
  },
  "mcpServers": {
    "...": {}
  }
}
```

Key fields:

- `enabled`: master switch for cluster logic.
- `nodeId`: unique identifier for the running node.
- `baseUrl`: the internal URL other nodes (or the coordinator) can reach this node at. Used for proxying requests.
- `nodes`: optional static membership list; useful when you cannot rely on the coordinator to provide base URLs.
- `coordinator`: back-end used to share state. Supported values:
  - `memory` (default) – in-process store, suitable for single-node development.
  - `redis` – shared Redis instance. Requires `ioredis` to be installed.
- `session`: overrides sticky-session behaviour (affinity key and TTL).

### Using Redis

1. Install the dependency in your deployment environment if it is not already bundled:
   ```bash
   pnpm add ioredis
   ```
2. Provide a Redis connection string in `coordinator.redisUrl`.
3. Optionally tune `keyPrefix`, `heartbeatIntervalMs`, and `offlineAfterMs`.

If `ioredis` is missing while `coordinator.type` is `redis`, MCPHub will reject startup with a descriptive error.

## Sticky Session Flow

1. **SSE connections**: when the transport is created the node records the session id + metadata in the coordinator. On disconnect the mapping is cleared.
2. **Streamable HTTP sessions**: session ids are recorded as soon as the stream initializes and are removed when the transport closes.
3. **Request handling**: for every `/messages` or `/mcp` request we look up the session owner. If this node does not own the session we proxy the request to the owning node and stream the response back to the caller.

Because the mapping lives in the coordinator, load balancers do not need to enforce sticky cookies—the cluster does it for you.

## Observability

- `GET /servers` now aggregates cluster metadata. Remote servers include a `cluster` summary with the participating node ids and replica count.
- Heartbeats update the coordinator on a configurable interval. Nodes that miss `offlineAfterMs` are ignored by aggregations until they reappear.

## Development Tips

- For local multi-node testing run each instance with a different `MCPHUB_SETTING_PATH` pointing at a tailored `mcp_settings.json`.
- The new Jest test (`src/services/__tests__/clusterService.test.ts`) exercises the memory coordinator path. Extend it to cover Redis by injecting a test Redis instance if desired.
- Run `pnpm backend:build` after editing cluster related files to ensure TypeScript stays happy.
