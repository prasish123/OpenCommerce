import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Validate environment variables using Zod
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  UI_PORT: z.string().default('8080'),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Ollama
  OLLAMA_URL: z.string().url(),
  OLLAMA_MODEL: z.string().default('deepseek-r1:1.5b'),

  // Stripe
  STRIPE_SECRET_KEY: z.string(),
  STRIPE_PUBLISHABLE_KEY: z.string(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // DoorDash
  DOORDASH_DEVELOPER_ID: z.string().optional(),
  DOORDASH_KEY_ID: z.string().optional(),
  DOORDASH_SIGNING_SECRET: z.string().optional(),

  // Uber Eats
  UBER_CLIENT_ID: z.string().optional(),
  UBER_CLIENT_SECRET: z.string().optional(),
  UBER_STORE_ID: z.string().optional(),

  // Website
  WEBSITE_API_KEY: z.string().optional(),

  // Elistar
  ELISTAR_IMPORT_SECRET: z.string(),
  ELISTAR_EXPORT_ENDPOINT: z.string().url().optional(),

  // Store
  STORE_ID: z.string().default('STORE_001'),
  STORE_NAME: z.string().default('Liquor River Ocala'),
  STORE_ADDRESS: z.string().default('123 Main St, Ocala, FL 34470'),
  STORE_TAX_RATE: z.string().default('0.07'),
  STORE_TIMEZONE: z.string().default('America/New_York'),

  // Channel Markup
  MARKUP_DOORDASH: z.string().default('0.30'),
  MARKUP_UBER_EATS: z.string().default('0.25'),
  MARKUP_WEBSITE: z.string().default('0.10'),
  MARKUP_IN_STORE: z.string().default('0.00'),

  // Security
  JWT_SECRET: z.string(),
  SESSION_SECRET: z.string(),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().default('logs/opencommerce.log'),

  // Hardware
  PRINTER_VENDOR_ID: z.string().optional(),
  PRINTER_PRODUCT_ID: z.string().optional(),
  SCANNER_VENDOR_ID: z.string().optional(),
  SCANNER_PRODUCT_ID: z.string().optional(),

  // Feature Flags
  ENABLE_DOORDASH: z.string().default('false'),
  ENABLE_UBER_EATS: z.string().default('false'),
  ENABLE_WEBSITE: z.string().default('false'),
  ENABLE_OLLAMA_SEARCH: z.string().default('true'),
  ENABLE_AGE_VERIFICATION: z.string().default('true'),
});

const env = envSchema.parse(process.env);

export const config = {
  env: env.NODE_ENV,
  port: parseInt(env.PORT),
  uiPort: parseInt(env.UI_PORT),
  host: env.HOST,

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  ollama: {
    url: env.OLLAMA_URL,
    model: env.OLLAMA_MODEL,
  },

  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  },

  doordash: {
    developerId: env.DOORDASH_DEVELOPER_ID,
    keyId: env.DOORDASH_KEY_ID,
    signingSecret: env.DOORDASH_SIGNING_SECRET,
    enabled: env.ENABLE_DOORDASH === 'true',
  },

  uberEats: {
    clientId: env.UBER_CLIENT_ID,
    clientSecret: env.UBER_CLIENT_SECRET,
    storeId: env.UBER_STORE_ID,
    enabled: env.ENABLE_UBER_EATS === 'true',
  },

  website: {
    apiKey: env.WEBSITE_API_KEY,
    enabled: env.ENABLE_WEBSITE === 'true',
  },

  elistar: {
    importSecret: env.ELISTAR_IMPORT_SECRET,
    exportEndpoint: env.ELISTAR_EXPORT_ENDPOINT,
  },

  store: {
    id: env.STORE_ID,
    name: env.STORE_NAME,
    address: env.STORE_ADDRESS,
    taxRate: parseFloat(env.STORE_TAX_RATE),
    timezone: env.STORE_TIMEZONE,
  },

  channelMarkup: {
    doordash: parseFloat(env.MARKUP_DOORDASH),
    uberEats: parseFloat(env.MARKUP_UBER_EATS),
    website: parseFloat(env.MARKUP_WEBSITE),
    inStore: parseFloat(env.MARKUP_IN_STORE),
  },

  security: {
    jwtSecret: env.JWT_SECRET,
    sessionSecret: env.SESSION_SECRET,
  },

  logging: {
    level: env.LOG_LEVEL,
    file: env.LOG_FILE,
  },

  hardware: {
    printer: {
      vendorId: env.PRINTER_VENDOR_ID,
      productId: env.PRINTER_PRODUCT_ID,
    },
    scanner: {
      vendorId: env.SCANNER_VENDOR_ID,
      productId: env.SCANNER_PRODUCT_ID,
    },
  },

  features: {
    ollama: env.ENABLE_OLLAMA_SEARCH === 'true',
    ageVerification: env.ENABLE_AGE_VERIFICATION === 'true',
  },
} as const;

export type Config = typeof config;
