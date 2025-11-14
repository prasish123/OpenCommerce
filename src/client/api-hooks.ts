/**
 * React Hooks for OpenCommerce API Client
 * TanStack Query (React Query) hooks for data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import {
  OpenCommerceApiClient,
  LoginRequest,
  LoginPINRequest,
  LoginResponse,
  CheckoutRequest,
  CheckoutResponse,
  ApiError,
} from './api-client';
import {
  Product,
  UnifiedOrder,
  OrderChannel,
  OrderStatus,
  User,
  InventoryItem,
} from '../shared/types';

// ==========================================
// HOOK HELPERS
// ==========================================

export interface UseApiClientOptions {
  client: OpenCommerceApiClient;
}

// ==========================================
// AUTH HOOKS
// ==========================================

export function useLogin(client: OpenCommerceApiClient, options?: UseMutationOptions<LoginResponse, ApiError, LoginRequest>) {
  return useMutation({
    mutationFn: (request: LoginRequest) => client.login(request),
    ...options,
  });
}

export function useLoginPIN(client: OpenCommerceApiClient, options?: UseMutationOptions<LoginResponse, ApiError, LoginRequest>) {
  return useMutation({
    mutationFn: (request: any) => client.loginWithPIN(request),
    ...options,
  });
}

export function useLogout(client: OpenCommerceApiClient, options?: UseMutationOptions<void, ApiError, void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => client.logout(),
    onSuccess: () => {
      queryClient.clear();
    },
    ...options,
  });
}

export function useCurrentUser(client: OpenCommerceApiClient, options?: UseQueryOptions<User, ApiError>) {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => client.getCurrentUser(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

// ==========================================
// PRODUCT HOOKS
// ==========================================

export function useProductByBarcode(
  client: OpenCommerceApiClient,
  barcode: string,
  options?: UseQueryOptions<Product, ApiError>
) {
  return useQuery({
    queryKey: ['product', 'barcode', barcode],
    queryFn: () => client.getProductByBarcode(barcode),
    enabled: !!barcode,
    staleTime: 30 * 60 * 1000, // 30 minutes
    ...options,
  });
}

export function useProductById(
  client: OpenCommerceApiClient,
  productId: string,
  options?: UseQueryOptions<Product, ApiError>
) {
  return useQuery({
    queryKey: ['product', productId],
    queryFn: () => client.getProductById(productId),
    enabled: !!productId,
    staleTime: 30 * 60 * 1000,
    ...options,
  });
}

export function useSearchProducts(
  client: OpenCommerceApiClient,
  query: string,
  options?: UseQueryOptions<Product[], ApiError>
) {
  return useQuery({
    queryKey: ['products', 'search', query],
    queryFn: () => client.searchProducts(query),
    enabled: query.length >= 2,
    staleTime: 1 * 60 * 1000, // 1 minute
    ...options,
  });
}

// ==========================================
// CART HOOKS
// ==========================================

export function useAddToCart(client: OpenCommerceApiClient, options?: UseMutationOptions<any, ApiError, { cartId: string; barcode: string; quantity?: number }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cartId, barcode, quantity }) => client.addItemToCart(cartId, barcode, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    ...options,
  });
}

export function useRemoveFromCart(client: OpenCommerceApiClient, options?: UseMutationOptions<any, ApiError, { cartId: string; itemId: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cartId, itemId }) => client.removeItemFromCart(cartId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
    ...options,
  });
}

export function useCheckout(client: OpenCommerceApiClient, options?: UseMutationOptions<CheckoutResponse, ApiError, { cartId: string; request: CheckoutRequest }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cartId, request }) => client.checkout(cartId, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    ...options,
  });
}

// ==========================================
// ORDER HOOKS
// ==========================================

export function useOrders(
  client: OpenCommerceApiClient,
  status?: OrderStatus,
  channel?: OrderChannel,
  limit: number = 100,
  options?: UseQueryOptions<UnifiedOrder[], ApiError>
) {
  return useQuery({
    queryKey: ['orders', status, channel, limit],
    queryFn: () => client.getOrders(status, channel, limit),
    staleTime: 10 * 1000, // 10 seconds
    refetchInterval: 30 * 1000, // Auto-refresh every 30 seconds
    ...options,
  });
}

export function useOrderById(
  client: OpenCommerceApiClient,
  orderId: string,
  options?: UseQueryOptions<UnifiedOrder, ApiError>
) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: () => client.getOrderById(orderId),
    enabled: !!orderId,
    staleTime: 10 * 1000,
    ...options,
  });
}

export function useUpdateOrderStatus(client: OpenCommerceApiClient, options?: UseMutationOptions<void, ApiError, { orderId: string; status: OrderStatus }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status }) => client.updateOrderStatus(orderId, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', variables.orderId] });
    },
    ...options,
  });
}

export function useCancelOrder(client: OpenCommerceApiClient, options?: UseMutationOptions<void, ApiError, { orderId: string; reason?: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }) => client.cancelOrder(orderId, reason),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order', variables.orderId] });
    },
    ...options,
  });
}

// ==========================================
// INVENTORY HOOKS
// ==========================================

export function useInventory(
  client: OpenCommerceApiClient,
  productId: string,
  storeId: string,
  options?: UseQueryOptions<InventoryItem, ApiError>
) {
  return useQuery({
    queryKey: ['inventory', productId, storeId],
    queryFn: () => client.getInventory(productId, storeId),
    enabled: !!productId && !!storeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

export function useLowStockAlerts(
  client: OpenCommerceApiClient,
  storeId: string,
  options?: UseQueryOptions<any[], ApiError>
) {
  return useQuery({
    queryKey: ['lowStockAlerts', storeId],
    queryFn: () => client.getLowStockAlerts(storeId),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ==========================================
// LOYALTY HOOKS
// ==========================================

export function useLoyaltyMember(
  client: OpenCommerceApiClient,
  phoneOrMemberNumber: string,
  options?: UseQueryOptions<any, ApiError>
) {
  return useQuery({
    queryKey: ['loyaltyMember', phoneOrMemberNumber],
    queryFn: () => client.lookupLoyaltyMember(phoneOrMemberNumber),
    enabled: !!phoneOrMemberNumber && phoneOrMemberNumber.length >= 4,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useCreateLoyaltyMember(client: OpenCommerceApiClient, options?: UseMutationOptions<any, ApiError, { firstName: string; lastName: string; phone: string; email?: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ firstName, lastName, phone, email }) =>
      client.createLoyaltyMember(firstName, lastName, phone, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyaltyMember'] });
    },
    ...options,
  });
}

export function useAvailableRewards(
  client: OpenCommerceApiClient,
  memberId: string,
  options?: UseQueryOptions<any[], ApiError>
) {
  return useQuery({
    queryKey: ['rewards', memberId],
    queryFn: () => client.getAvailableRewards(memberId),
    enabled: !!memberId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useRedeemReward(client: OpenCommerceApiClient, options?: UseMutationOptions<any, ApiError, { memberId: string; rewardId: string }>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, rewardId }) => client.redeemReward(memberId, rewardId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rewards', variables.memberId] });
      queryClient.invalidateQueries({ queryKey: ['loyaltyMember'] });
    },
    ...options,
  });
}

// ==========================================
// CUSTOMER HOOKS
// ==========================================

export function useSearchCustomers(
  client: OpenCommerceApiClient,
  query: string,
  options?: UseQueryOptions<any[], ApiError>
) {
  return useQuery({
    queryKey: ['customers', 'search', query],
    queryFn: () => client.searchCustomers(query),
    enabled: query.length >= 2,
    staleTime: 1 * 60 * 1000,
    ...options,
  });
}

export function useCustomerById(
  client: OpenCommerceApiClient,
  customerId: string,
  options?: UseQueryOptions<any, ApiError>
) {
  return useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => client.getCustomerById(customerId),
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useCustomerStats(
  client: OpenCommerceApiClient,
  customerId: string,
  options?: UseQueryOptions<any, ApiError>
) {
  return useQuery({
    queryKey: ['customerStats', customerId],
    queryFn: () => client.getCustomerStats(customerId),
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useCustomerPurchaseHistory(
  client: OpenCommerceApiClient,
  customerId: string,
  limit: number = 50,
  options?: UseQueryOptions<any[], ApiError>
) {
  return useQuery({
    queryKey: ['customerPurchases', customerId, limit],
    queryFn: () => client.getCustomerPurchaseHistory(customerId, limit),
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ==========================================
// ANALYTICS HOOKS
// ==========================================

export function useRealTimeMetrics(
  client: OpenCommerceApiClient,
  storeId: string,
  options?: UseQueryOptions<any, ApiError>
) {
  return useQuery({
    queryKey: ['analytics', 'realtime', storeId],
    queryFn: () => client.getRealTimeMetrics(storeId),
    enabled: !!storeId,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refresh every minute
    ...options,
  });
}

export function useTrendingProducts(
  client: OpenCommerceApiClient,
  limit: number = 20,
  storeId?: string,
  options?: UseQueryOptions<any[], ApiError>
) {
  return useQuery({
    queryKey: ['analytics', 'trending', limit, storeId],
    queryFn: () => client.getTrendingProducts(limit, storeId),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useChannelPerformance(
  client: OpenCommerceApiClient,
  startDate: Date,
  endDate: Date,
  storeId?: string,
  options?: UseQueryOptions<any[], ApiError>
) {
  return useQuery({
    queryKey: ['analytics', 'channels', startDate, endDate, storeId],
    queryFn: () => client.getChannelPerformance(startDate, endDate, storeId),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useSalesTimeseries(
  client: OpenCommerceApiClient,
  startDate: Date,
  endDate: Date,
  interval: 'hourly' | 'daily',
  storeId?: string,
  options?: UseQueryOptions<any[], ApiError>
) {
  return useQuery({
    queryKey: ['analytics', 'timeseries', startDate, endDate, interval, storeId],
    queryFn: () => client.getSalesTimeseries(startDate, endDate, interval, storeId),
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

// ==========================================
// REPORTING HOOKS
// ==========================================

export function useGenerateXReport(client: OpenCommerceApiClient, options?: UseMutationOptions<any, ApiError, { storeId: string; terminalId: string }>) {
  return useMutation({
    mutationFn: ({ storeId, terminalId }) => client.generateXReport(storeId, terminalId),
    ...options,
  });
}

export function useGenerateZReport(client: OpenCommerceApiClient, options?: UseMutationOptions<any, ApiError, { storeId: string; terminalId: string; actualCash: number }>) {
  return useMutation({
    mutationFn: ({ storeId, terminalId, actualCash }) =>
      client.generateZReport(storeId, terminalId, actualCash),
    ...options,
  });
}

export function useOpenDrawer(client: OpenCommerceApiClient, options?: UseMutationOptions<void, ApiError, { terminalId: string; startingCash: number }>) {
  return useMutation({
    mutationFn: ({ terminalId, startingCash }) => client.openDrawer(terminalId, startingCash),
    ...options,
  });
}

export function useCloseDrawer(client: OpenCommerceApiClient, options?: UseMutationOptions<any, ApiError, { terminalId: string; actualCash: number }>) {
  return useMutation({
    mutationFn: ({ terminalId, actualCash }) => client.closeDrawer(terminalId, actualCash),
    ...options,
  });
}
