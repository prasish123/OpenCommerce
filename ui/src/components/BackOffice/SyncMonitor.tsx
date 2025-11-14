import React, { useState } from 'react';

/**
 * Sync Monitor Component
 * Monitor synchronization status across all stores and terminals
 */

interface SyncStatus {
  storeId: string;
  storeName: string;
  terminalsOnline: number;
  terminalsTotal: number;
  lastSync: string;
  pendingTransactions: number;
  syncHealth: 'HEALTHY' | 'WARNING' | 'ERROR';
  conflicts: number;
}

interface SyncConflict {
  id: string;
  storeId: string;
  recordType: string;
  conflictType: string;
  createdAt: string;
  resolved: boolean;
}

export function SyncMonitor() {
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [showConflicts, setShowConflicts] = useState(false);

  // Mock data
  const stores: SyncStatus[] = [
    {
      storeId: 'STORE-001',
      storeName: 'Liquor River - Main',
      terminalsOnline: 2,
      terminalsTotal: 2,
      lastSync: '2 minutes ago',
      pendingTransactions: 0,
      syncHealth: 'HEALTHY',
      conflicts: 0,
    },
    {
      storeId: 'STORE-002',
      storeName: 'Liquor River - West',
      terminalsOnline: 1,
      terminalsTotal: 2,
      lastSync: '45 seconds ago',
      pendingTransactions: 3,
      syncHealth: 'WARNING',
      conflicts: 1,
    },
  ];

  const conflicts: SyncConflict[] = [
    {
      id: '1',
      storeId: 'STORE-002',
      recordType: 'PRODUCT',
      conflictType: 'PRICE_MISMATCH',
      createdAt: '5 minutes ago',
      resolved: false,
    },
  ];

  const getHealthColor = (health: string) => {
    switch (health) {
      case 'HEALTHY':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'WARNING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'ERROR':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total Stores</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">2</p>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <span className="text-2xl">🏪</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Terminals Online</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">3 / 4</p>
            </div>
            <div className="bg-green-100 rounded-full p-3">
              <span className="text-2xl">✅</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Pending Sync</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">3</p>
            </div>
            <div className="bg-yellow-100 rounded-full p-3">
              <span className="text-2xl">⏳</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Conflicts</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">1</p>
            </div>
            <div className="bg-red-100 rounded-full p-3">
              <span className="text-2xl">⚠️</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Sync Operations</h2>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              Force Sync All
            </button>
            <button
              onClick={() => setShowConflicts(!showConflicts)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              View Conflicts ({conflicts.length})
            </button>
            <button className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
              Download Logs
            </button>
          </div>
        </div>
      </div>

      {/* Store Sync Status */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">Store Sync Status</h3>
        </div>

        <div className="divide-y divide-gray-200">
          {stores.map((store) => (
            <div
              key={store.storeId}
              className={`p-6 hover:bg-gray-50 cursor-pointer transition-colors ${
                selectedStore === store.storeId ? 'bg-blue-50' : ''
              }`}
              onClick={() =>
                setSelectedStore(selectedStore === store.storeId ? null : store.storeId)
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-4">
                    <h4 className="text-lg font-semibold text-gray-900">{store.storeName}</h4>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${getHealthColor(
                        store.syncHealth
                      )}`}
                    >
                      {store.syncHealth}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-4 gap-6">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Store ID</p>
                      <p className="text-sm font-mono text-gray-900 mt-1">{store.storeId}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Terminals</p>
                      <p className="text-sm text-gray-900 mt-1">
                        {store.terminalsOnline} / {store.terminalsTotal} online
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Last Sync</p>
                      <p className="text-sm text-gray-900 mt-1">{store.lastSync}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">Pending</p>
                      <p className="text-sm text-gray-900 mt-1">
                        {store.pendingTransactions} transactions
                      </p>
                    </div>
                  </div>

                  {/* Terminal Details (when expanded) */}
                  {selectedStore === store.storeId && (
                    <div className="mt-4 pt-4 border-t">
                      <h5 className="text-sm font-semibold text-gray-700 mb-3">Terminals</h5>
                      <div className="grid grid-cols-2 gap-4">
                        <TerminalCard
                          terminalId="TERMINAL-001"
                          name="Main Register 1"
                          status="ONLINE"
                          lastHeartbeat="10 seconds ago"
                          pendingSync={0}
                        />
                        <TerminalCard
                          terminalId="TERMINAL-002"
                          name="Main Register 2"
                          status="ONLINE"
                          lastHeartbeat="8 seconds ago"
                          pendingSync={3}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="ml-4">
                  {store.conflicts > 0 && (
                    <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-semibold">
                      {store.conflicts} conflict{store.conflicts > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conflicts Panel */}
      {showConflicts && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b bg-red-50">
            <h3 className="text-lg font-semibold text-red-900">Sync Conflicts</h3>
            <p className="text-sm text-red-700 mt-1">
              These conflicts require manual resolution
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">⚠️</span>
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {conflict.conflictType.replace('_', ' ')}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          Store: {conflict.storeId} • Type: {conflict.recordType} •{' '}
                          {conflict.createdAt}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                      Server Wins
                    </button>
                    <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                      Local Wins
                    </button>
                    <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium">
                      Merge
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync History */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">Recent Sync Operations</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Store
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Direction
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Records
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <SyncHistoryRow
                time="2 minutes ago"
                store="STORE-001"
                type="TRANSACTION"
                direction="UP"
                records={5}
                status="SUCCESS"
              />
              <SyncHistoryRow
                time="45 seconds ago"
                store="STORE-002"
                type="PRODUCT"
                direction="DOWN"
                records={150}
                status="SUCCESS"
              />
              <SyncHistoryRow
                time="5 minutes ago"
                store="STORE-002"
                type="INVENTORY"
                direction="DOWN"
                records={320}
                status="FAILED"
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TerminalCard({
  terminalId,
  name,
  status,
  lastHeartbeat,
  pendingSync,
}: {
  terminalId: string;
  name: string;
  status: string;
  lastHeartbeat: string;
  pendingSync: number;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <h6 className="font-semibold text-gray-900">{name}</h6>
        <span
          className={`px-2 py-1 rounded-full text-xs font-semibold ${
            status === 'ONLINE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {status}
        </span>
      </div>
      <p className="text-xs text-gray-600 mb-1">ID: {terminalId}</p>
      <p className="text-xs text-gray-600 mb-1">Last heartbeat: {lastHeartbeat}</p>
      {pendingSync > 0 && (
        <p className="text-xs text-yellow-600 font-medium">Pending: {pendingSync} transactions</p>
      )}
    </div>
  );
}

function SyncHistoryRow({
  time,
  store,
  type,
  direction,
  records,
  status,
}: {
  time: string;
  store: string;
  type: string;
  direction: string;
  records: number;
  status: string;
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{time}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{store}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{type}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm">
        <span
          className={`px-2 py-1 rounded-full text-xs font-semibold ${
            direction === 'UP' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
          }`}
        >
          {direction === 'UP' ? '↑ UP' : '↓ DOWN'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{records}</td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <span
          className={`px-2 py-1 rounded-full text-xs font-semibold ${
            status === 'SUCCESS'
              ? 'bg-green-100 text-green-800'
              : status === 'FAILED'
              ? 'bg-red-100 text-red-800'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {status}
        </span>
      </td>
    </tr>
  );
}

export default SyncMonitor;
