import type { Message } from "./protocol";

type Handler = (msg: Message) => void;

// Thin reconnecting WS client. Same-origin /ws (proxied in dev to :8760).
export class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private url: string;
  private retry = 0;

  constructor(path = "/ws") {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.url = `${proto}://${location.host}${path}`;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data) as Message;
      this.handlers.forEach((h) => h(msg));
    };
    this.ws.onclose = () => {
      const delay = Math.min(1000 * 2 ** this.retry++, 5000);
      setTimeout(() => this.connect(), delay);
    };
    this.ws.onopen = () => {
      this.retry = 0;
    };
  }

  send(type: string, payload: Record<string, unknown> = {}): void {
    this.ws?.send(JSON.stringify({ type, payload }));
  }

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
}

// App-wide singleton so the store and components share one connection.
export const ws = new WsClient();
