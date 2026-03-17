export type CliChannel = 'event' | 'output' | 'error' | 'state' | 'status';

export interface CliMessage {
  channel: CliChannel;
  text: string;
}

export type CliMessageHandler = (message: CliMessage) => void;

export class CliChannelBus {
  private subscribers: Map<CliChannel | '*', Set<CliMessageHandler>> = new Map();

  subscribe(channel: CliChannel | '*', handler: CliMessageHandler): () => void {
    const existing = this.subscribers.get(channel);
    if (existing) {
      existing.add(handler);
    } else {
      this.subscribers.set(channel, new Set([handler]));
    }

    return () => {
      const bucket = this.subscribers.get(channel);
      if (!bucket) {
        return;
      }
      bucket.delete(handler);
      if (bucket.size === 0) {
        this.subscribers.delete(channel);
      }
    };
  }

  emit(message: CliMessage): void {
    const direct = this.subscribers.get(message.channel);
    if (direct) {
      direct.forEach((handler) => {
        handler(message);
      });
    }

    const wildcard = this.subscribers.get('*');
    if (wildcard) {
      wildcard.forEach((handler) => {
        handler(message);
      });
    }
  }
}
