import React from 'react';

/**
 * Store Configuration Component
 * Configure stores, terminals, and settings
 */

export function StoreConfiguration() {
  return (
    <div className="space-y-6">
      {/* Store List */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Store Configuration</h2>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            + Add Store
          </button>
        </div>

        <div className="space-y-4">
          <StoreCard
            storeId="STORE-001"
            storeName="Liquor River - Main"
            address="123 Main St, Los Angeles, CA 90001"
            terminals={2}
            status="ACTIVE"
          />
          <StoreCard
            storeId="STORE-002"
            storeName="Liquor River - West"
            address="456 West Ave, Los Angeles, CA 90002"
            terminals={2}
            status="ACTIVE"
          />
        </div>
      </div>

      {/* Tax Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Tax Configuration</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CA State Sales Tax
            </label>
            <input
              type="number"
              step="0.01"
              defaultValue="7.25"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Local Tax</label>
            <input
              type="number"
              step="0.01"
              defaultValue="1.00"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Channel Markup Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Channel Markup</h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">DoorDash</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                defaultValue="30"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
              <span className="absolute right-3 top-2 text-gray-600">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Uber Eats</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                defaultValue="25"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
              <span className="absolute right-3 top-2 text-gray-600">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Website</label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                defaultValue="10"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
              <span className="absolute right-3 top-2 text-gray-600">%</span>
            </div>
          </div>
        </div>
        <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          Save Changes
        </button>
      </div>
    </div>
  );
}

function StoreCard({
  storeId,
  storeName,
  address,
  terminals,
  status,
}: {
  storeId: string;
  storeName: string;
  address: string;
  terminals: number;
  status: string;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h4 className="text-lg font-semibold text-gray-900">{storeName}</h4>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
              {status}
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{address}</p>
          <p className="text-sm text-gray-500 mt-2">
            Store ID: {storeId} • {terminals} terminals
          </p>
        </div>
        <button className="px-4 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-medium">
          Configure
        </button>
      </div>
    </div>
  );
}

export default StoreConfiguration;
