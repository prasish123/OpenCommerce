import React, { useState } from 'react';
import { useLogin, useLoginPIN, createApiClient } from '../../../src/client';
import { useNavigate } from 'react-router-dom';

/**
 * Login Page Component
 * Supports both PIN login (POS terminals) and username/password (web/admin)
 */

type LoginMode = 'pin' | 'credentials';

const apiClient = createApiClient();

export function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>('pin');
  const [pinCode, setPinCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [terminalId, setTerminalId] = useState('TERMINAL-001');
  const [error, setError] = useState('');

  const loginMutation = useLogin(apiClient, {
    onSuccess: (data) => {
      // Save user info to state/context
      localStorage.setItem('user', JSON.stringify(data.user));
      // Navigate to POS or dashboard based on role
      if (data.user.role === 'CASHIER') {
        navigate('/pos');
      } else {
        navigate('/dashboard');
      }
    },
    onError: (error) => {
      setError(error.message);
    },
  });

  const loginPINMutation = useLoginPIN(apiClient, {
    onSuccess: (data) => {
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/pos');
    },
    onError: (error) => {
      setError(error.message);
      // Clear PIN on error
      setPinCode('');
    },
  });

  const handlePINInput = (digit: string) => {
    if (pinCode.length < 6) {
      const newPin = pinCode + digit;
      setPinCode(newPin);

      // Auto-submit when 4-6 digits entered
      if (newPin.length >= 4) {
        loginPINMutation.mutate({
          pinCode: newPin,
          terminalId,
        });
      }
    }
  };

  const handlePINBackspace = () => {
    setPinCode(pinCode.slice(0, -1));
    setError('');
  };

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    loginMutation.mutate({
      username,
      password,
      terminalId,
    });
  };

  const isLoading = loginMutation.isPending || loginPINMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <h1 className="text-3xl font-bold text-center">Liquor River POS</h1>
          <p className="text-center text-blue-100 mt-2">OpenCommerce Platform</p>
        </div>

        {/* Mode Toggle */}
        <div className="flex border-b">
          <button
            className={`flex-1 py-4 text-center font-semibold transition-colors ${
              mode === 'pin'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
            onClick={() => {
              setMode('pin');
              setError('');
              setPinCode('');
            }}
          >
            PIN Login
          </button>
          <button
            className={`flex-1 py-4 text-center font-semibold transition-colors ${
              mode === 'credentials'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
            onClick={() => {
              setMode('credentials');
              setError('');
              setUsername('');
              setPassword('');
            }}
          >
            Username/Password
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* PIN Login Mode */}
        {mode === 'pin' && (
          <div className="p-6">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Your PIN
              </label>
              <div className="flex justify-center items-center gap-2 mb-6">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div
                    key={index}
                    className="w-12 h-12 border-2 border-gray-300 rounded-lg flex items-center justify-center bg-gray-50"
                  >
                    {pinCode[index] ? (
                      <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
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
                    disabled={isLoading}
                    className="h-16 bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  onClick={handlePINBackspace}
                  disabled={isLoading || pinCode.length === 0}
                  className="h-16 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ⌫
                </button>
                <button
                  onClick={() => handlePINInput('0')}
                  disabled={isLoading}
                  className="h-16 bg-gray-100 hover:bg-gray-200 rounded-lg text-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  0
                </button>
                <button
                  onClick={() => {
                    setPinCode('');
                    setError('');
                  }}
                  disabled={isLoading || pinCode.length === 0}
                  className="h-16 bg-gray-100 hover:bg-gray-200 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Terminal ID */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Terminal ID
              </label>
              <input
                type="text"
                value={terminalId}
                onChange={(e) => setTerminalId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="TERMINAL-001"
              />
            </div>

            {isLoading && (
              <div className="mt-6 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="text-sm text-gray-600 mt-2">Authenticating...</p>
              </div>
            )}
          </div>
        )}

        {/* Username/Password Login Mode */}
        {mode === 'credentials' && (
          <div className="p-6">
            <form onSubmit={handleCredentialsSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your username"
                  required
                  autoFocus
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter your password"
                  required
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Terminal ID
                </label>
                <input
                  type="text"
                  value={terminalId}
                  onChange={(e) => setTerminalId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="TERMINAL-001"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !username || !password}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Logging in...
                  </div>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t text-center text-sm text-gray-600">
          <p>Need help? Contact your store manager</p>
        </div>
      </div>
    </div>
  );
}

export default Login;
