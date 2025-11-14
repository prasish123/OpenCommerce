import React, { useState } from 'react';
import { useOrders, useUpdateOrderStatus, createApiClient } from '../../../src/client';
import { UnifiedOrder, OrderChannel, OrderStatus } from '../../../src/shared/types';

/**
 * Order Queue Component
 * Unified omnichannel view of all orders
 */

const apiClient = createApiClient();

const CHANNEL_COLORS: Record<OrderChannel, string> = {
  IN_STORE: 'bg-blue-100 text-blue-800',
  DOORDASH: 'bg-red-100 text-red-800',
  UBER_EATS: 'bg-green-100 text-green-800',
  WEBSITE: 'bg-purple-100 text-purple-800',
};

const CHANNEL_ICONS: Record<OrderChannel, string> = {
  IN_STORE: '🏪',
  DOORDASH: '🏍️',
  UBER_EATS: '🚗',
  WEBSITE: '🌐',
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  NEW: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  ACCEPTED: 'bg-blue-100 text-blue-800 border-blue-300',
  PREPARING: 'bg-orange-100 text-orange-800 border-orange-300',
  READY: 'bg-green-100 text-green-800 border-green-300',
  PICKED_UP: 'bg-gray-100 text-gray-800 border-gray-300',
  COMPLETED: 'bg-green-200 text-green-900 border-green-400',
  CANCELLED: 'bg-red-100 text-red-800 border-red-300',
};

export function OrderQueue() {
  const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>(undefined);
  const [channelFilter, setChannelFilter] = useState<OrderChannel | undefined>(undefined);

  const { data: orders = [], isLoading, error, refetch } = useOrders(
    apiClient,
    statusFilter,
    channelFilter,
    100
  );

  const updateStatusMutation = useUpdateOrderStatus(apiClient, {
    onSuccess: () => {
      refetch();
    },
  });

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    updateStatusMutation.mutate({ orderId, status: newStatus });
  };

  const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
    const statusFlow: Record<OrderStatus, OrderStatus | null> = {
      NEW: OrderStatus.ACCEPTED,
      ACCEPTED: OrderStatus.PREPARING,
      PREPARING: OrderStatus.READY,
      READY: OrderStatus.PICKED_UP,
      PICKED_UP: OrderStatus.COMPLETED,
      COMPLETED: null,
      CANCELLED: null,
    };
    return statusFlow[currentStatus];
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getTimeElapsed = (date: Date): string => {
    const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  };

  const activeOrders = orders.filter(
    (o) => o.status !== OrderStatus.COMPLETED && o.status !== OrderStatus.CANCELLED
  );

  const newOrders = activeOrders.filter((o) => o.status === OrderStatus.NEW);
  const preparingOrders = activeOrders.filter(
    (o) => o.status === OrderStatus.ACCEPTED || o.status === OrderStatus.PREPARING
  );
  const readyOrders = activeOrders.filter((o) => o.status === OrderStatus.READY);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-red-600 font-semibold">Error loading orders</p>
          <p className="text-gray-600 mt-2">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Order Queue</h1>
              <p className="text-sm text-gray-600 mt-1">
                {activeOrders.length} active orders
              </p>
            </div>

            {/* Filters */}
            <div className="flex gap-3">
              <select
                value={channelFilter || ''}
                onChange={(e) =>
                  setChannelFilter(e.target.value as OrderChannel || undefined)
                }
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All Channels</option>
                <option value="IN_STORE">In-Store</option>
                <option value="DOORDASH">DoorDash</option>
                <option value="UBER_EATS">Uber Eats</option>
                <option value="WEBSITE">Website</option>
              </select>

              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
              <p className="text-yellow-800 font-semibold text-sm">New</p>
              <p className="text-2xl font-bold text-yellow-900">{newOrders.length}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 border border-orange-200">
              <p className="text-orange-800 font-semibold text-sm">Preparing</p>
              <p className="text-2xl font-bold text-orange-900">{preparingOrders.length}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <p className="text-green-800 font-semibold text-sm">Ready</p>
              <p className="text-2xl font-bold text-green-900">{readyOrders.length}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <p className="text-blue-800 font-semibold text-sm">Total Active</p>
              <p className="text-2xl font-bold text-blue-900">{activeOrders.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Order Grid */}
      <div className="flex-1 overflow-auto p-6">
        {activeOrders.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-6xl mb-4">🎉</div>
              <p className="text-xl font-semibold text-gray-700">All caught up!</p>
              <p className="text-gray-500 mt-2">No active orders at the moment</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activeOrders.map((order) => {
              const nextStatus = getNextStatus(order.status);
              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-lg shadow-md border-2 ${
                    STATUS_COLORS[order.status]
                  } overflow-hidden transition-all hover:shadow-lg`}
                >
                  {/* Order Header */}
                  <div className="p-4 border-b">
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          CHANNEL_COLORS[order.channel]
                        }`}
                      >
                        {CHANNEL_ICONS[order.channel]} {order.channel}
                      </span>
                      <span className="text-sm font-mono text-gray-600">
                        #{order.transactionNumber || order.externalOrderId?.substring(0, 6)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {order.customer?.name || 'Guest'}
                        </p>
                        {order.customer?.phone && (
                          <p className="text-sm text-gray-600">{order.customer.phone}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          ${order.totalAmount.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">{formatTime(order.orderedAt)}</p>
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 mt-2">
                      {getTimeElapsed(order.orderedAt)}
                    </p>
                  </div>

                  {/* Order Items */}
                  <div className="p-4 bg-gray-50">
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {order.items.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-gray-700">
                            {item.quantity}x {item.description}
                          </span>
                          <span className="text-gray-600 font-medium">
                            ${item.extendedPrice.toFixed(2)}
                          </span>
                        </div>
                      ))}
                      {order.items.length > 5 && (
                        <p className="text-xs text-gray-500 italic">
                          +{order.items.length - 5} more items
                        </p>
                      )}
                    </div>

                    {order.delivery && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-gray-600">
                          📍 {order.delivery.address}
                        </p>
                        {order.delivery.instructions && (
                          <p className="text-xs text-gray-500 mt-1">
                            💬 {order.delivery.instructions}
                          </p>
                        )}
                      </div>
                    )}

                    {order.containsAlcohol && !order.ageVerified && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="bg-yellow-50 border border-yellow-300 rounded px-2 py-1">
                          <p className="text-xs font-semibold text-yellow-800">
                            ⚠️ Age Verification Required
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="p-4 bg-white border-t flex gap-2">
                    {nextStatus && (
                      <button
                        onClick={() => handleStatusChange(order.id, nextStatus)}
                        disabled={updateStatusMutation.isPending}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {updateStatusMutation.isPending ? '...' : nextStatus}
                      </button>
                    )}
                    {order.status === OrderStatus.NEW && (
                      <button
                        onClick={() => handleStatusChange(order.id, OrderStatus.CANCELLED)}
                        disabled={updateStatusMutation.isPending}
                        className="px-4 bg-red-100 text-red-700 py-2 rounded-lg font-semibold hover:bg-red-200 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default OrderQueue;
