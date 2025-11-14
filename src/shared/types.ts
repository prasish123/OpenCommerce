// Shared types for the entire OpenCommerce POS system
// These types are used across all services

// ==========================================
// ENUMS
// ==========================================

export enum OrderChannel {
  IN_STORE = 'IN_STORE',
  DOORDASH = 'DOORDASH',
  UBER_EATS = 'UBER_EATS',
  WEBSITE = 'WEBSITE',
}

export enum OrderStatus {
  NEW = 'NEW',
  ACCEPTED = 'ACCEPTED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  PICKED_UP = 'PICKED_UP',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum TenderType {
  CASH = 'CASH',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  GIFT_CARD = 'GIFT_CARD',
  DIGITAL_WALLET = 'DIGITAL_WALLET',
  SPLIT = 'SPLIT',
}

export enum UserRole {
  CASHIER = 'CASHIER',
  MANAGER = 'MANAGER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum PromotionType {
  MIX_MATCH = 'MIX_MATCH',
  COMBO = 'COMBO',
  PRICE_EACH = 'PRICE_EACH',
  PERCENT_OFF = 'PERCENT_OFF',
  DOLLAR_OFF = 'DOLLAR_OFF',
  BOGO = 'BOGO',
}

export enum EventType {
  // Product events
  PRODUCT_CREATED = 'product.created',
  PRODUCT_UPDATED = 'product.updated',
  PRODUCT_PRICE_CHANGED = 'product.price_changed',
  PRODUCT_DELETED = 'product.deleted',

  // Order events
  ORDER_RECEIVED = 'order.received',
  ORDER_ACCEPTED = 'order.accepted',
  ORDER_PREPARING = 'order.preparing',
  ORDER_READY = 'order.ready',
  ORDER_COMPLETED = 'order.completed',
  ORDER_CANCELLED = 'order.cancelled',

  // Inventory events
  INVENTORY_UPDATED = 'inventory.updated',
  INVENTORY_LOW_STOCK = 'inventory.low_stock',
  INVENTORY_OUT_OF_STOCK = 'inventory.out_of_stock',

  // Item scanned
  ITEM_SCANNED = 'item.scanned',

  // Payment events
  PAYMENT_PROCESSED = 'payment.processed',
  PAYMENT_FAILED = 'payment.failed',

  // Sync events
  ELISTAR_IMPORT_STARTED = 'elistar.import.started',
  ELISTAR_IMPORT_COMPLETED = 'elistar.import.completed',
  ELISTAR_EXPORT_COMPLETED = 'elistar.export.completed',
}

// ==========================================
// PRODUCT DOMAIN
// ==========================================

export interface Product {
  id: string;
  barcode: string;
  barcodeType: 'UPC-A' | 'PLU' | 'EAN-13';
  description: string;
  basePrice: number;
  inventoryValuePrice?: number;
  merchandiseCode: string;
  taxStrategyId: number;
  active: boolean;

  // Channel-specific pricing
  priceInStore: number;
  priceDoordash: number;
  priceUberEats: number;
  priceWebsite: number;

  // Compliance
  requiresAgeVerification: boolean;
  minimumAge?: number;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  elistar_externalId?: string;
}

export interface MerchandiseCode {
  code: string;
  description: string;
  active: boolean;
  taxStrategyId: number;
  minimumCustomerAge?: number;
}

export interface Promotion {
  id: string;
  promotionType: PromotionType;
  description: string;
  startDate: Date;
  endDate: Date;
  rules: PromotionRules;
  active: boolean;
}

export interface PromotionRules {
  // Mix & Match
  itemListId?: string;
  requiredQuantity?: number;
  mixMatchPrice?: number;
  mixMatchDiscountAmount?: number;

  // Combo
  combos?: {
    itemListId: string;
    quantity: number;
    discountAmount?: number;
    unitPrice?: number;
  }[];
  comboPrice?: number;

  // Percent/Dollar off
  discountPercent?: number;
  discountAmount?: number;
}

// ==========================================
// ORDER DOMAIN
// ==========================================

export interface UnifiedOrder {
  id: string;
  transactionNumber?: number;
  externalOrderId?: string;

  // Channel
  channel: OrderChannel;
  status: OrderStatus;

  // Store & Terminal
  storeId: string;
  terminalId?: string;
  businessDate: Date;

  // Staff
  cashierId?: string;

  // Customer
  customer?: {
    name?: string;
    phone?: string;
    email?: string;
  };

  // Delivery (if applicable)
  delivery?: {
    address: string;
    instructions?: string;
    scheduledTime?: Date;
    driver?: {
      name: string;
      phone: string;
    };
  };

  // Items
  items: OrderItem[];

  // Money
  subtotal: number;
  taxTotal: number;
  deliveryFee?: number;
  serviceFee?: number;
  tipAmount?: number;
  totalAmount: number;

  // Compliance
  containsAlcohol: boolean;
  ageVerified?: boolean;
  verifiedBy?: string;
  verifiedAt?: Date;

  // Timestamps
  orderedAt: Date;
  acceptedAt?: Date;
  preparingAt?: Date;
  readyAt?: Date;
  pickedUpAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export interface OrderItem {
  id?: string;
  sequenceNumber: number;
  productId?: string;
  barcode?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
  taxAmount: number;

  // Modifiers (for food items)
  modifiers?: {
    name: string;
    price: number;
  }[];

  notes?: string;
  requiresAgeVerification: boolean;
}

export interface Tender {
  id?: string;
  tenderType: TenderType;
  tenderAmount: number;

  // Card details
  cardType?: string;
  lastFour?: string;
  approvalCode?: string;
  stripePaymentIntentId?: string;

  // Cash
  amountTendered?: number;
  changeDue?: number;
}

// ==========================================
// INVENTORY DOMAIN
// ==========================================

export interface InventoryItem {
  productId: string;
  storeId: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderPoint: number;
  reorderQuantity: number;
}

export interface InventoryMovement {
  productId: string;
  storeId: string;
  movementType: 'SALE' | 'RECEIVE' | 'ADJUST' | 'RETURN';
  quantity: number;
  referenceId?: string;
  notes?: string;
  createdBy?: string;
}

// ==========================================
// AUTH DOMAIN
// ==========================================

export interface User {
  id: string;
  username: string;
  fullName: string;
  email?: string;
  role: UserRole;
  storeId?: string;
  terminalId?: string;
  active: boolean;
  lastLoginAt?: Date;
}

export interface Session {
  id: string;
  userId: string;
  storeId: string;
  terminalId: string;
  expiresAt: Date;
}

// ==========================================
// COMPLIANCE DOMAIN
// ==========================================

export interface AgeVerificationLog {
  transactionId: string;
  orderChannel: OrderChannel;
  customerName?: string;
  driverName?: string;
  driverLicenseNumber?: string;
  driverLicenseState?: string;
  driverDob?: Date;
  verificationMethod: 'MANUAL_ID_CHECK' | 'ID_SCANNER' | 'PHOTO_UPLOAD';
  verifiedBy: string;
  verifiedAt: Date;
  restrictedItems: string[];
  storeId: string;
}

// ==========================================
// EVENTS
// ==========================================

export interface DomainEvent<T = any> {
  id: string;
  type: EventType;
  aggregateId: string;
  data: T;
  metadata: {
    userId?: string;
    storeId?: string;
    terminalId?: string;
    correlationId?: string;
  };
  timestamp: Date;
}

// ==========================================
// ELISTAR SYNC
// ==========================================

export interface NAXMLImportResult {
  success: boolean;
  itemsImported: number;
  merchandiseCodesImported: number;
  promotionsImported: number;
  itemListsImported: number;
  errors: string[];
  timestamp: Date;
}

export interface ElislarExportTransaction {
  storeId: string;
  transactionId: string;
  transactionNumber: number;
  businessDate: string;
  items: {
    barcode: string;
    quantity: number;
    price: number;
    extendedPrice: number;
  }[];
  subtotal: number;
  tax: number;
  total: number;
  timestamp: string;
}
