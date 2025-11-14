/**
 * OpenCommerce API Client Library
 * Export all client functionality
 */

// API Client
export {
  OpenCommerceApiClient,
  createApiClient,
  ApiError,
  type ApiClientConfig,
  type LoginRequest,
  type LoginPINRequest,
  type LoginResponse,
  type CreateProductRequest,
  type UpdateProductRequest,
  type CartItem,
  type Cart,
  type CheckoutRequest,
  type CheckoutResponse,
  type LoyaltyMember,
  type CustomerStats,
  type AnalyticsMetrics,
  type ReportXZ,
} from './api-client';

// React Hooks
export {
  useLogin,
  useLoginPIN,
  useLogout,
  useCurrentUser,
  useProductByBarcode,
  useProductById,
  useSearchProducts,
  useAddToCart,
  useRemoveFromCart,
  useCheckout,
  useOrders,
  useOrderById,
  useUpdateOrderStatus,
  useCancelOrder,
  useInventory,
  useLowStockAlerts,
  useLoyaltyMember,
  useCreateLoyaltyMember,
  useAvailableRewards,
  useRedeemReward,
  useSearchCustomers,
  useCustomerById,
  useCustomerStats,
  useCustomerPurchaseHistory,
  useRealTimeMetrics,
  useTrendingProducts,
  useChannelPerformance,
  useSalesTimeseries,
  useGenerateXReport,
  useGenerateZReport,
  useOpenDrawer,
  useCloseDrawer,
} from './api-hooks';

// Re-export shared types
export type {
  Product,
  UnifiedOrder,
  OrderChannel,
  OrderStatus,
  TenderType,
  User,
  UserRole,
  InventoryItem,
  OrderItem,
  Tender,
} from '../shared/types';
