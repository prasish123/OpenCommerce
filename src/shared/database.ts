import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from './config';
import { log } from './logger';

class Database {
  private pool: Pool;
  private static instance: Database;

  private constructor() {
    this.pool = new Pool({
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Log connection errors
    this.pool.on('error', (err) => {
      log.error('Unexpected database error', err);
    });

    // Log when pool connects
    this.pool.on('connect', () => {
      log.debug('New database connection established');
    });
  }

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  /**
   * Execute a query
   */
  async query(
    text: string,
    params?: any[]
  ): Promise<QueryResult<any>> {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      if (duration > 1000) {
        log.warn('Slow query detected', {
          query: text,
          duration: `${duration}ms`,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      log.error('Database query failed', { query: text, error });
      throw error;
    }
  }

  /**
   * Get a client for transaction
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * Execute within a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      log.error('Transaction rolled back', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      log.error('Database health check failed', error);
      return false;
    }
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.pool.end();
    log.info('Database pool closed');
  }
}

export const db = Database.getInstance();
