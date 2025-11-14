/**
 * OpenCommerce POS API Client
 * Type-safe TypeScript client for all backend services
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import {
  Product,
  UnifiedOrder,
  OrderChannel,
  OrderStatus,
  TenderType,
  User,
  UserRole,
  InventoryItem,
} from '../shared/types';

// ==========================================
// CLIENT CONFIGURATION
// ==========================================

export interface ApiClientConfig {
  baseURL: string;
  timeout?: number;
  onAuthError?: () => void;
  onNetworkError?: (error: Error) => void;
}

// ==========================================
// REQUEST/RESPONSE TYPES
// ==========================================

export interface LoginRequest {
  username: string;
  password: string;
  terminalId?: string;
}

export interface LoginPINRequest {
  pinCode: string;
  terminalId: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface CreateProductRequest {
  barcode: string;
  description: string;
  basePrice: number;
  merchandiseCode: string;
  category?: string;
  requiresAgeVerification?: boolean;
}

export interface UpdateProductRequest {
  description?: string;
  basePrice?: number;
  active?: boolean;
}

export interface CartItem {
  productId: string;
  barcode: string;
  description: string;
  quantity: number;
  unitPrice: number;
  extendedPrice: number;
  taxAmount: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
}

export interface CheckoutRequest {
  tenders: Array<{
    tenderType: TenderType;
    amount: number;
  }>;
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface CheckoutResponse {
  success: boolean;
  transactionId: string;
  receiptUrl?: string;
  changeDue?: number;
}

export interface LoyaltyMember {
  id: string;
  memberNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  pointsBalance: number;
  lifetimePoints: number;
  joinedAt: Date;
}

export interface CustomerStats {
  totalPurchases: number;
  totalSpent: number;
  averageOrderValue: number;
  lifetimeValue: number;
  lastPurchaseDate?: Date;
  firstPurchaseDate?: Date;
  daysSinceLastPurchase?: number;
}

export interface AnalyticsMetrics {
  current: {
    salesToday: number;
    transactionsToday: number;
    averageTransaction: number;
    customersToday: number;
  };
  hourly: {
    currentHour: number;
    salesThisHour: number;
    transactionsThisHour: number;
  };
  comparison: {
    salesYesterday: number;
    salesLastWeek: number;
    percentChangeVsYesterday: number;
    percentChangeVsLastWeek: number;
  };
}

export interface ReportXZ {
  reportType: 'X' | 'Z';
  storeId: string;
  terminalId: string;
  businessDate: string;
  summary: {
    transactionCount: number;
    totalSales: number;
    totalTax: number;
    netSales: number;
  };
  tenders: Array<{
    tenderType: TenderType;
    count: number;
    amount: number;
  }>;
  discounts: {
    count: number;
    amount: number;
  };
  voids: {
    count: number;
    amount: number;
  };
  refunds: {
    count: number;
    amount: number;
  };
  drawer?: {
    openedAt: Date;
    closedAt?: Date;
    startingCash: number;
    expectedCash: number;
    actualCash?: number;
    variance?: number;
  };
}

// ==========================================
// ERROR TYPES
// ==========================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ==========================================
// API CLIENT
// ==========================================

export class OpenCommerceApiClient {
  private client: AxiosInstance;
  private token: string | null = null;
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor - add auth token
    this.client.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.token = null;
          localStorage.removeItem('auth_token');
          this.config.onAuthError?.();
        } else if (!error.response) {
          this.config.onNetworkError?.(error);
        }
        return Promise.reject(this.handleError(error));
      }
    );

    // Load token from localStorage
    this.loadToken();
  }

  /**
   * Load token from localStorage
   */
  private loadToken(): void {
    const token = localStorage.getItem('auth_token');
    if (token) {
      this.token = token;
    }
  }

  /**
   * Save token to localStorage
   */
  private saveToken(token: string): void {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError): ApiError {
    if (error.response) {
      return new ApiError(
        error.response.data?.message || error.message,
        error.response.status,
        error.response.data
      );
    } else {
      return new ApiError('Network error', 0);
    }
  }

  // ==========================================
  // AUTH API
  // ==========================================

  /**
   * Login with username and password
   */
  async login(request: LoginRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/api/auth/login', request);
    this.saveToken(response.data.token);
    return response.data;
  }

  /**
   * Login with PIN (POS terminal)
   */
  async loginWithPIN(request: LoginPINRequest): Promise<LoginResponse> {
    const response = await this.client.post<LoginResponse>('/api/auth/login-pin', request);
    this.saveToken(response.data.token);
    return response.data;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    await this.client.post('/api/auth/logout');
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<User> {
    const response = await this.client.get<User>('/api/auth/me');
    return response.data;
  }

  /**
   * Change password
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.client.post('/api/auth/change-password', { oldPassword, newPassword });
  }

  // ==========================================
  // PRODUCT API
  // ==========================================

  /**
   * Get product by barcode
   */
  async getProductByBarcode(barcode: string): Promise<Product> {
    const response = await this.client.get<Product>(`/api/products/barcode/${barcode}`);
    return response.data;
  }

  /**
   * Get product by ID
   */
  async getProductById(productId: string): Promise<Product> {
    const response = await this.client.get<Product>(`/api/products/${productId}`);
    return response.data;
  }

  /**
   * Search products
   */
  async searchProducts(query: string): Promise<Product[]> {
    const response = await this.client.get<Product[]>('/api/products/search', {
      params: { q: query },
    });
    return response.data;
  }

  /**
   * Create product
   */
  async createProduct(request: CreateProductRequest): Promise<Product> {
    const response = await this.client.post<Product>('/api/products', request);
    return response.data;
  }

  /**
   * Update product
   */
  async updateProduct(productId: string, request: UpdateProductRequest): Promise<void> {
    await this.client.put(`/api/products/${productId}`, request);
  }

  // ==========================================
  // CART API
  // ==========================================

  /**
   * Create new cart
   */
  async createCart(storeId: string, terminalId: string): Promise<Cart> {
    const response = await this.client.post<Cart>('/api/cart', { storeId, terminalId });
    return response.data;
  }

  /**
   * Add item to cart
   */
  async addItemToCart(cartId: string, barcode: string, quantity: number = 1): Promise<Cart> {
    const response = await this.client.post<Cart>(`/api/cart/${cartId}/items`, {
      barcode,
      quantity,
    });
    return response.data;
  }

  /**
   * Remove item from cart
   */
  async removeItemFromCart(cartId: string, itemId: string): Promise<Cart> {
    const response = await this.client.delete<Cart>(`/api/cart/${cartId}/items/${itemId}`);
    return response.data;
  }

  /**
   * Update item quantity
   */
  async updateCartItemQuantity(
    cartId: string,
    itemId: string,
    quantity: number
  ): Promise<Cart> {
    const response = await this.client.put<Cart>(`/api/cart/${cartId}/items/${itemId}`, {
      quantity,
    });
    return response.data;
  }

  /**
   * Clear cart
   */
  async clearCart(cartId: string): Promise<void> {
    await this.client.delete(`/api/cart/${cartId}`);
  }

  /**
   * Checkout cart
   */
  async checkout(cartId: string, request: CheckoutRequest): Promise<CheckoutResponse> {
    const response = await this.client.post<CheckoutResponse>(
      `/api/cart/${cartId}/checkout`,
      request
    );
    return response.data;
  }

  // ==========================================
  // ORDER API
  // ==========================================

  /**
   * Get all orders (unified queue)
   */
  async getOrders(
    status?: OrderStatus,
    channel?: OrderChannel,
    limit: number = 100
  ): Promise<UnifiedOrder[]> {
    const response = await this.client.get<UnifiedOrder[]>('/api/orders', {
      params: { status, channel, limit },
    });
    return response.data;
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<UnifiedOrder> {
    const response = await this.client.get<UnifiedOrder>(`/api/orders/${orderId}`);
    return response.data;
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: string, status: OrderStatus): Promise<void> {
    await this.client.put(`/api/orders/${orderId}/status`, { status });
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId: string, reason?: string): Promise<void> {
    await this.client.post(`/api/orders/${orderId}/cancel`, { reason });
  }

  // ==========================================
  // INVENTORY API
  // ==========================================

  /**
   * Get inventory for product
   */
  async getInventory(productId: string, storeId: string): Promise<InventoryItem> {
    const response = await this.client.get<InventoryItem>(
      `/api/inventory/${productId}/${storeId}`
    );
    return response.data;
  }

  /**
   * Get low stock alerts
   */
  async getLowStockAlerts(storeId: string): Promise<any[]> {
    const response = await this.client.get<any[]>(`/api/inventory/alerts/${storeId}`);
    return response.data;
  }

  /**
   * Update inventory
   */
  async updateInventory(
    productId: string,
    storeId: string,
    quantity: number,
    reason: string
  ): Promise<void> {
    await this.client.post(`/api/inventory/${productId}/${storeId}`, { quantity, reason });
  }

  // ==========================================
  // LOYALTY API
  // ==========================================

  /**
   * Lookup loyalty member
   */
  async lookupLoyaltyMember(phoneOrMemberNumber: string): Promise<LoyaltyMember | null> {
    try {
      const response = await this.client.get<LoyaltyMember>(
        `/api/loyalty/lookup/${phoneOrMemberNumber}`
      );
      return response.data;
    } catch (error) {
      if ((error as ApiError).statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create loyalty member
   */
  async createLoyaltyMember(
    firstName: string,
    lastName: string,
    phone: string,
    email?: string
  ): Promise<LoyaltyMember> {
    const response = await this.client.post<LoyaltyMember>('/api/loyalty/members', {
      firstName,
      lastName,
      phone,
      email,
    });
    return response.data;
  }

  /**
   * Get available rewards
   */
  async getAvailableRewards(memberId: string): Promise<any[]> {
    const response = await this.client.get<any[]>(`/api/loyalty/members/${memberId}/rewards`);
    return response.data;
  }

  /**
   * Redeem reward
   */
  async redeemReward(memberId: string, rewardId: string): Promise<any> {
    const response = await this.client.post(`/api/loyalty/members/${memberId}/redeem`, {
      rewardId,
    });
    return response.data;
  }

  // ==========================================
  // CUSTOMER API
  // ==========================================

  /**
   * Search customers
   */
  async searchCustomers(query: string): Promise<any[]> {
    const response = await this.client.get<any[]>('/api/customers/search', {
      params: { q: query },
    });
    return response.data;
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: string): Promise<any> {
    const response = await this.client.get(`/api/customers/${customerId}`);
    return response.data;
  }

  /**
   * Get customer stats
   */
  async getCustomerStats(customerId: string): Promise<CustomerStats> {
    const response = await this.client.get<CustomerStats>(
      `/api/customers/${customerId}/stats`
    );
    return response.data;
  }

  /**
   * Get customer purchase history
   */
  async getCustomerPurchaseHistory(customerId: string, limit: number = 50): Promise<any[]> {
    const response = await this.client.get<any[]>(
      `/api/customers/${customerId}/purchases`,
      { params: { limit } }
    );
    return response.data;
  }

  // ==========================================
  // ANALYTICS API
  // ==========================================

  /**
   * Get real-time metrics
   */
  async getRealTimeMetrics(storeId: string): Promise<AnalyticsMetrics> {
    const response = await this.client.get<AnalyticsMetrics>(
      `/api/analytics/realtime/${storeId}`
    );
    return response.data;
  }

  /**
   * Get trending products
   */
  async getTrendingProducts(limit: number = 20, storeId?: string): Promise<any[]> {
    const response = await this.client.get<any[]>('/api/analytics/trending', {
      params: { limit, storeId },
    });
    return response.data;
  }

  /**
   * Get channel performance
   */
  async getChannelPerformance(
    startDate: Date,
    endDate: Date,
    storeId?: string
  ): Promise<any[]> {
    const response = await this.client.get<any[]>('/api/analytics/channels', {
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        storeId,
      },
    });
    return response.data;
  }

  /**
   * Get sales timeseries
   */
  async getSalesTimeseries(
    startDate: Date,
    endDate: Date,
    interval: 'hourly' | 'daily',
    storeId?: string
  ): Promise<any[]> {
    const response = await this.client.get<any[]>('/api/analytics/timeseries', {
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        interval,
        storeId,
      },
    });
    return response.data;
  }

  // ==========================================
  // REPORTING API
  // ==========================================

  /**
   * Generate X Report (mid-day)
   */
  async generateXReport(storeId: string, terminalId: string): Promise<ReportXZ> {
    const response = await this.client.post<ReportXZ>('/api/reports/x-report', {
      storeId,
      terminalId,
    });
    return response.data;
  }

  /**
   * Generate Z Report (end of day)
   */
  async generateZReport(
    storeId: string,
    terminalId: string,
    actualCash: number
  ): Promise<ReportXZ> {
    const response = await this.client.post<ReportXZ>('/api/reports/z-report', {
      storeId,
      terminalId,
      actualCash,
    });
    return response.data;
  }

  /**
   * Open drawer
   */
  async openDrawer(terminalId: string, startingCash: number): Promise<void> {
    await this.client.post('/api/reports/drawer/open', { terminalId, startingCash });
  }

  /**
   * Close drawer
   */
  async closeDrawer(terminalId: string, actualCash: number): Promise<any> {
    const response = await this.client.post('/api/reports/drawer/close', {
      terminalId,
      actualCash,
    });
    return response.data;
  }

  // ==========================================
  // NOTIFICATION API
  // ==========================================

  /**
   * Send receipt email
   */
  async sendReceiptEmail(transactionId: string, email: string): Promise<void> {
    await this.client.post('/api/notifications/receipt/email', { transactionId, email });
  }

  /**
   * Send receipt SMS
   */
  async sendReceiptSMS(transactionId: string, phone: string): Promise<void> {
    await this.client.post('/api/notifications/receipt/sms', { transactionId, phone });
  }
}

// ==========================================
// FACTORY
// ==========================================

/**
 * Create API client instance
 */
export function createApiClient(config?: Partial<ApiClientConfig>): OpenCommerceApiClient {
  const defaultConfig: ApiClientConfig = {
    baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000',
    timeout: 30000,
    ...config,
  };

  return new OpenCommerceApiClient(defaultConfig);
}

// Default export
export default OpenCommerceApiClient;
