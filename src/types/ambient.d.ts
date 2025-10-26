declare module 'ioredis' {
  export default class Redis {
    constructor(url: string);
    quit(): Promise<void>;
    hset(key: string, field: string, value: string): Promise<void>;
    hget(key: string, field: string): Promise<string | null>;
    hgetall(key: string): Promise<Record<string, string>>;
    hdel(key: string, field: string): Promise<void>;
    set(key: string, value: string, mode?: string, ttl?: number): Promise<void>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<void>;
  }
}

declare module 'undici' {
  import { Readable } from 'node:stream';

  interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
    bodyTimeout?: number;
    headersTimeout?: number;
  }

  interface RequestResult {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: Readable | null;
  }

  export function request(url: string | URL, options?: RequestOptions): Promise<RequestResult>;
}
