import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ShoppingCart, CreditCard, DollarSign, Trash2, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../lib/api';
import type { Cart, CartItem, PaymentResult } from '../types';

export default function POSTerminal() {
  const [cartId, setCartId] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cashTendered, setCashTendered] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Create cart on mount
  useEffect(() => {
    createCartMutation.mutate();
  }, []);

  // Auto-focus barcode input
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, [cart]);

  // Get cart data
  const { data: cart, refetch: refetchCart } = useQuery<Cart>({
    queryKey: ['cart', cartId],
    queryFn: () => api.getCart(cartId!),
    enabled: !!cartId,
    refetchInterval: 1000, // Refresh every second
  });

  // Create cart mutation
  const createCartMutation = useMutation({
    mutationFn: api.createCart,
    onSuccess: (data) => {
      setCartId(data.cartId);
      toast.success('New transaction started');
    },
  });

  // Add item to cart
  const addItemMutation = useMutation({
    mutationFn: ({ barcode, quantity }: { barcode: string; quantity: number }) =>
      api.addItemToCart(cartId!, barcode, quantity),
    onSuccess: () => {
      refetchCart();
      setBarcodeInput('');
      toast.success('Item added');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to add item');
    },
  });

  // Update quantity
  const updateQuantityMutation = useMutation({
    mutationFn: ({ barcode, quantity }: { barcode: string; quantity: number }) =>
      api.updateCartItemQuantity(cartId!, barcode, quantity),
    onSuccess: () => {
      refetchCart();
    },
  });

  // Remove item
  const removeItemMutation = useMutation({
    mutationFn: (barcode: string) => api.removeCartItem(cartId!, barcode),
    onSuccess: () => {
      refetchCart();
      toast.success('Item removed');
    },
  });

  // Payment mutations
  const processCardPaymentMutation = useMutation({
    mutationFn: (amount: number) => api.processCardPayment(cartId!, amount),
    onSuccess: (result: PaymentResult) => {
      if (result.success) {
        toast.success('Payment successful');
        // Print receipt and start new transaction
        setTimeout(() => {
          createCartMutation.mutate();
        }, 1000);
      } else {
        toast.error(result.error || 'Payment failed');
      }
    },
  });

  const processCashPaymentMutation = useMutation({
    mutationFn: ({ total, tendered }: { total: number; tendered: number }) =>
      api.processCashPayment(cartId!, total, tendered),
    onSuccess: (result: PaymentResult) => {
      if (result.success) {
        toast.success(`Payment successful. Change: $${result.changeAmount?.toFixed(2)}`);
        // Print receipt and start new transaction
        setTimeout(() => {
          createCartMutation.mutate();
          setCashTendered('');
        }, 1000);
      } else {
        toast.error(result.error || 'Payment failed');
      }
    },
  });

  // Handle barcode scan
  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim() || !cartId) return;

    addItemMutation.mutate({
      barcode: barcodeInput.trim(),
      quantity: 1,
    });
  };

  // Handle payment
  const handleCardPayment = () => {
    if (!cart) return;
    processCardPaymentMutation.mutate(cart.totalAmount);
  };

  const handleCashPayment = () => {
    if (!cart || !cashTendered) return;
    const tendered = parseFloat(cashTendered);

    if (tendered < cart.totalAmount) {
      toast.error('Insufficient cash');
      return;
    }

    processCashPaymentMutation.mutate({
      total: cart.totalAmount,
      tendered,
    });
  };

  const renderCartItem = (item: CartItem) => (
    <div key={item.barcode} className="flex items-center justify-between py-3 border-b">
      <div className="flex-1">
        <p className="font-medium">{item.description}</p>
        <p className="text-sm text-gray-500">${item.unitPrice.toFixed(2)} each</p>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              updateQuantityMutation.mutate({
                barcode: item.barcode,
                quantity: item.quantity - 1,
              })
            }
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="w-8 text-center font-medium">{item.quantity}</span>
          <button
            onClick={() =>
              updateQuantityMutation.mutate({
                barcode: item.barcode,
                quantity: item.quantity + 1,
              })
            }
            className="p-1 hover:bg-gray-100 rounded"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <p className="w-20 text-right font-bold">${item.extendedPrice.toFixed(2)}</p>
        <button
          onClick={() => removeItemMutation.mutate(item.barcode)}
          className="p-2 text-red-600 hover:bg-red-50 rounded"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">POS Terminal</h1>
            <p className="text-sm text-gray-500">Store: Liquor River Ocala</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Cashier: John Doe</p>
            <p className="text-xs text-gray-400">{new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 p-6 h-[calc(100vh-5rem)]">
        {/* Cart Items */}
        <div className="col-span-2 card p-6 flex flex-col">
          <div className="flex items-center gap-3 mb-6">
            <ShoppingCart className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-bold">Cart</h2>
            <span className="text-sm text-gray-500">
              ({cart?.items.length || 0} items)
            </span>
          </div>

          {/* Barcode Scanner Input */}
          <form onSubmit={handleBarcodeScan} className="mb-6">
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Scan barcode or enter item code..."
              className="input text-lg"
              autoFocus
            />
          </form>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto">
            {cart?.items.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <ShoppingCart className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>Cart is empty</p>
                <p className="text-sm">Scan an item to get started</p>
              </div>
            ) : (
              cart?.items.map(renderCartItem)
            )}
          </div>

          {/* Promotions */}
          {cart?.promoResult && cart.promoResult.appliedPromotions.length > 0 && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <p className="font-medium text-green-800 mb-2">Applied Promotions:</p>
              {cart.promoResult.appliedPromotions.map((promo: any, idx: number) => (
                <p key={idx} className="text-sm text-green-700">
                  {promo.description} - ${promo.discountAmount.toFixed(2)}
                </p>
              ))}
            </div>
          )}

          {/* Age Verification Warning */}
          {cart?.requiresAgeVerification && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="font-medium text-yellow-800">⚠️ Age Verification Required</p>
              <p className="text-sm text-yellow-700">Customer must be 21+ to purchase alcohol</p>
            </div>
          )}
        </div>

        {/* Totals & Payment */}
        <div className="card p-6 flex flex-col">
          <h2 className="text-xl font-bold mb-6">Totals</h2>

          <div className="space-y-3 mb-6">
            <div className="flex justify-between text-lg">
              <span>Subtotal:</span>
              <span>${cart?.subtotal.toFixed(2) || '0.00'}</span>
            </div>
            {cart?.promoResult && cart.promoResult.discountTotal > 0 && (
              <div className="flex justify-between text-lg text-green-600">
                <span>Discount:</span>
                <span>-${cart.promoResult.discountTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg">
              <span>Tax (7%):</span>
              <span>${cart?.taxAmount.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between text-3xl font-bold border-t pt-4">
              <span>Total:</span>
              <span className="text-primary-600">
                ${cart?.totalAmount.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>

          <div className="space-y-4 mt-auto">
            {/* Card Payment */}
            <button
              onClick={handleCardPayment}
              disabled={!cart || cart.items.length === 0}
              className="w-full btn btn-primary py-4 text-lg flex items-center justify-center gap-2"
            >
              <CreditCard className="w-5 h-5" />
              Pay with Card
            </button>

            {/* Cash Payment */}
            <div className="space-y-2">
              <input
                type="number"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                placeholder="Cash amount tendered"
                className="input"
                step="0.01"
              />
              <button
                onClick={handleCashPayment}
                disabled={!cart || cart.items.length === 0 || !cashTendered}
                className="w-full btn btn-secondary py-4 text-lg flex items-center justify-center gap-2"
              >
                <DollarSign className="w-5 h-5" />
                Pay with Cash
              </button>
              {cashTendered && cart && parseFloat(cashTendered) >= cart.totalAmount && (
                <p className="text-center text-green-600 font-medium">
                  Change: $
                  {(parseFloat(cashTendered) - cart.totalAmount).toFixed(2)}
                </p>
              )}
            </div>

            {/* Void Transaction */}
            <button
              onClick={() => createCartMutation.mutate()}
              disabled={!cart || cart.items.length === 0}
              className="w-full btn btn-danger py-3"
            >
              Void Transaction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
