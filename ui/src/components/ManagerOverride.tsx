import React, { useState } from 'react';
import { useLogin, createApiClient } from '../../../src/client';

/**
 * Manager Override Component
 * Handle price overrides, discounts, void approvals, and other manager functions
 */

const apiClient = createApiClient();

type OverrideType = 'price' | 'discount_percent' | 'discount_amount' | 'void' | 'return' | 'age_override';

interface ManagerOverrideProps {
  type: OverrideType;
  context: {
    itemDescription?: string;
    currentPrice?: number;
    quantity?: number;
    transactionId?: string;
    customerId?: string;
  };
  onApprove: (data: any) => void;
  onCancel: () => void;
}

export function ManagerOverride({ type, context, onApprove, onCancel }: ManagerOverrideProps) {
  const [pin, setPin] = useState('');
  const [overrideValue, setOverrideValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [manager, setManager] = useState<any>(null);

  const loginMutation = useLogin(apiClient, {
    onSuccess: (data) => {
      if (data.user.role === 'MANAGER' || data.user.role === 'ADMIN' || data.user.role === 'SUPER_ADMIN') {
        setIsAuthenticated(true);
        setManager(data.user);
        setError('');
        setIsAuthenticating(false);
      } else {
        setError('Only managers and admins can perform overrides');
        setPin('');
        setIsAuthenticating(false);
      }
    },
    onError: (error) => {
      setError('Invalid PIN or credentials');
      setPin('');
      setIsAuthenticating(false);
    },
  });

  const handlePINInput = (digit: string) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);

      // Auto-submit when 4-6 digits entered
      if (newPin.length >= 4) {
        setIsAuthenticating(true);
        // Assuming we have a PIN-based login for managers
        // In production, you'd call the actual PIN login endpoint
        setTimeout(() => {
          // Mock manager authentication
          setIsAuthenticated(true);
          setManager({ fullName: 'Manager', role: 'MANAGER' });
          setError('');
          setIsAuthenticating(false);
        }, 500);
      }
    }
  };

  const handlePINBackspace = () => {
    setPin(pin.slice(0, -1));
    setError('');
  };

  const handleApprove = () => {
    let data: any = {
      managerId: manager.id,
      managerName: manager.fullName,
      reason,
      timestamp: new Date(),
    };

    switch (type) {
      case 'price':
        const newPrice = parseFloat(overrideValue);
        if (isNaN(newPrice) || newPrice <= 0) {
          setError('Please enter a valid price');
          return;
        }
        data.newPrice = newPrice;
        data.originalPrice = context.currentPrice;
        break;

      case 'discount_percent':
        const percentDiscount = parseFloat(overrideValue);
        if (isNaN(percentDiscount) || percentDiscount <= 0 || percentDiscount > 100) {
          setError('Please enter a valid discount percentage (1-100)');
          return;
        }
        data.discountPercent = percentDiscount;
        data.discountAmount = (context.currentPrice || 0) * (percentDiscount / 100);
        break;

      case 'discount_amount':
        const dollarDiscount = parseFloat(overrideValue);
        if (isNaN(dollarDiscount) || dollarDiscount <= 0) {
          setError('Please enter a valid discount amount');
          return;
        }
        if (dollarDiscount > (context.currentPrice || 0)) {
          setError('Discount cannot exceed item price');
          return;
        }
        data.discountAmount = dollarDiscount;
        break;

      case 'void':
      case 'return':
      case 'age_override':
        // No additional value needed for these types
        break;
    }

    if (!reason.trim()) {
      setError('Please provide a reason for this override');
      return;
    }

    onApprove(data);
  };

  const getTitle = (): string => {
    switch (type) {
      case 'price':
        return 'Price Override';
      case 'discount_percent':
        return 'Percentage Discount';
      case 'discount_amount':
        return 'Dollar Discount';
      case 'void':
        return 'Void Transaction';
      case 'return':
        return 'Return Approval';
      case 'age_override':
        return 'Age Verification Override';
      default:
        return 'Manager Override';
    }
  };

  const getDescription = (): string => {
    switch (type) {
      case 'price':
        return `Override price for: ${context.itemDescription}`;
      case 'discount_percent':
        return `Apply percentage discount to: ${context.itemDescription}`;
      case 'discount_amount':
        return `Apply dollar discount to: ${context.itemDescription}`;
      case 'void':
        return 'Void the current transaction';
      case 'return':
        return `Approve return for transaction #${context.transactionId?.substring(0, 8)}`;
      case 'age_override':
        return 'Override age verification requirement';
      default:
        return 'Requires manager approval';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{getTitle()}</h2>
              <p className="text-orange-100 mt-1 text-sm">Manager Approval Required</p>
            </div>
            <div className="bg-white bg-opacity-20 rounded-full p-3">
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Context Info */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 font-medium">{getDescription()}</p>
            {context.currentPrice !== undefined && (
              <p className="text-lg font-bold text-gray-900 mt-2">
                Current Price: ${context.currentPrice.toFixed(2)}
                {context.quantity && context.quantity > 1 && (
                  <span className="text-sm text-gray-600 ml-2">
                    (x{context.quantity} = ${(context.currentPrice * context.quantity).toFixed(2)})
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          {!isAuthenticated ? (
            /* Manager PIN Entry */
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Manager PIN
              </label>
              <div className="flex justify-center items-center gap-2 mb-6">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div
                    key={index}
                    className="w-12 h-12 border-2 border-gray-300 rounded-lg flex items-center justify-center bg-gray-50"
                  >
                    {pin[index] ? (
                      <div className="w-3 h-3 bg-orange-600 rounded-full"></div>
                    ) : (
                      <div className="w-3 h-3 border-2 border-gray-300 rounded-full"></div>
                    )}
                  </div>
                ))}
              </div>

              {/* PIN Keypad */}
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                  <button
                    key={digit}
                    onClick={() => handlePINInput(digit.toString())}
                    disabled={isAuthenticating}
                    className="h-14 bg-gray-100 hover:bg-gray-200 rounded-lg text-xl font-semibold transition-colors disabled:opacity-50"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  onClick={handlePINBackspace}
                  disabled={isAuthenticating || pin.length === 0}
                  className="h-14 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  ⌫
                </button>
                <button
                  onClick={() => handlePINInput('0')}
                  disabled={isAuthenticating}
                  className="h-14 bg-gray-100 hover:bg-gray-200 rounded-lg text-xl font-semibold transition-colors disabled:opacity-50"
                >
                  0
                </button>
                <button
                  onClick={() => {
                    setPin('');
                    setError('');
                  }}
                  disabled={isAuthenticating || pin.length === 0}
                  className="h-14 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  Clear
                </button>
              </div>

              {isAuthenticating && (
                <div className="mt-4 text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
                  <p className="text-sm text-gray-600 mt-2">Verifying...</p>
                </div>
              )}
            </div>
          ) : (
            /* Override Form */
            <div>
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800">
                  ✓ Authenticated as: {manager.fullName}
                </p>
              </div>

              {/* Value Input (for price/discount overrides) */}
              {(type === 'price' || type === 'discount_percent' || type === 'discount_amount') && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {type === 'price'
                      ? 'New Price'
                      : type === 'discount_percent'
                      ? 'Discount Percentage'
                      : 'Discount Amount'}
                  </label>
                  <div className="relative">
                    {type !== 'discount_percent' && (
                      <span className="absolute left-3 top-3 text-gray-600 font-medium">$</span>
                    )}
                    <input
                      type="number"
                      step="0.01"
                      value={overrideValue}
                      onChange={(e) => setOverrideValue(e.target.value)}
                      className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                        type !== 'discount_percent' ? 'pl-8' : ''
                      }`}
                      placeholder={
                        type === 'price'
                          ? '0.00'
                          : type === 'discount_percent'
                          ? '0'
                          : '0.00'
                      }
                      autoFocus
                    />
                    {type === 'discount_percent' && (
                      <span className="absolute right-3 top-3 text-gray-600 font-medium">%</span>
                    )}
                  </div>
                  {overrideValue && type !== 'price' && (
                    <p className="text-sm text-gray-600 mt-1">
                      New price: $
                      {type === 'discount_percent'
                        ? (
                            (context.currentPrice || 0) *
                            (1 - parseFloat(overrideValue || '0') / 100)
                          ).toFixed(2)
                        : ((context.currentPrice || 0) - parseFloat(overrideValue || '0')).toFixed(2)}
                    </p>
                  )}
                </div>
              )}

              {/* Reason */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Override *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  rows={3}
                  placeholder="Enter reason (required for audit trail)"
                  required
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg font-semibold hover:from-orange-700 hover:to-red-700 transition-colors"
                >
                  Approve Override
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ManagerOverride;
