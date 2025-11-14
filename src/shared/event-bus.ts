import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { DomainEvent, EventType } from './types';
import { log } from './logger';

/**
 * EventBus - In-process event handling (for now)
 *
 * This will be replaced with Kafka later, but the interface stays the same.
 * Services should never know if they're using EventEmitter or Kafka.
 */
class EventBus {
  private emitter: EventEmitter;
  private subscribers: Map<EventType, Set<(event: DomainEvent) => Promise<void>>>;

  constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100); // Increase for multiple services
    this.subscribers = new Map();

    // Log all events in development
    if (process.env.NODE_ENV === 'development') {
      this.emitter.on('*', (event: DomainEvent) => {
        log.debug(`Event published: ${event.type}`, {
          eventId: event.id,
          aggregateId: event.aggregateId
        });
      });
    }
  }

  /**
   * Publish an event to all subscribers
   */
  async publish<T = any>(event: Omit<DomainEvent<T>, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: DomainEvent<T> = {
      ...event,
      id: uuidv4(),
      timestamp: new Date(),
    };

    try {
      // Emit to EventEmitter
      this.emitter.emit(event.type, fullEvent);

      // Call registered async handlers
      const handlers = this.subscribers.get(event.type);
      if (handlers && handlers.size > 0) {
        await Promise.all(
          Array.from(handlers).map(handler =>
            handler(fullEvent).catch(err => {
              log.error(`Error in event handler for ${event.type}`, err);
            })
          )
        );
      }

      log.info(`Event published: ${event.type}`, {
        eventId: fullEvent.id,
        aggregateId: event.aggregateId,
      });

      // TODO: When adding Kafka, publish here:
      // await this.kafkaProducer.send({
      //   topic: event.type,
      //   messages: [{ value: JSON.stringify(fullEvent) }]
      // });
    } catch (error) {
      log.error(`Failed to publish event: ${event.type}`, error);
      throw error;
    }
  }

  /**
   * Subscribe to an event type
   */
  subscribe(
    eventType: EventType,
    handler: (event: DomainEvent) => Promise<void>
  ): () => void {
    // Store async handler
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler);

    // Also subscribe via EventEmitter for sync notification
    this.emitter.on(eventType, handler);

    log.info(`Subscribed to event: ${eventType}`);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(eventType)?.delete(handler);
      this.emitter.off(eventType, handler);
      log.info(`Unsubscribed from event: ${eventType}`);
    };
  }

  /**
   * Subscribe to multiple event types
   */
  subscribeMany(
    eventTypes: EventType[],
    handler: (event: DomainEvent) => Promise<void>
  ): () => void {
    const unsubscribeFns = eventTypes.map(type => this.subscribe(type, handler));

    // Return function that unsubscribes from all
    return () => {
      unsubscribeFns.forEach(fn => fn());
    };
  }

  /**
   * Wait for a specific event (useful for testing)
   */
  async waitFor(eventType: EventType, timeout: number = 5000): Promise<DomainEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeout);

      const handler = (event: DomainEvent) => {
        clearTimeout(timer);
        resolve(event);
      };

      this.emitter.once(eventType, handler);
    });
  }

  /**
   * Clear all subscribers (useful for testing)
   */
  reset(): void {
    this.emitter.removeAllListeners();
    this.subscribers.clear();
    log.warn('EventBus reset - all subscribers cleared');
  }
}

// Singleton instance
export const eventBus = new EventBus();
