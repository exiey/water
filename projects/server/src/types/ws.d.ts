declare module 'ws' {
  import type { Server as HTTPServer } from 'http';

  export class WebSocket {
    static readonly OPEN: number;
    readyState: number;
    send(data: string): void;
    close(): void;
  }

  export class WebSocketServer {
    constructor(options: { server: HTTPServer; path: string });
    clients: Set<WebSocket>;
    on(event: 'connection', listener: (socket: WebSocket) => void): this;
  }
}
