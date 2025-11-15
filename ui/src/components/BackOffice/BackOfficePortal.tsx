import React, { useState } from 'react';
import { ProductManagement } from './ProductManagement';
import { PromotionManagement } from './PromotionManagement';
import { StoreConfiguration } from './StoreConfiguration';
import { SyncMonitor } from './SyncMonitor';
import { UserManagement } from './UserManagement';
import { ReportsDashboard } from './ReportsDashboard';

/**
 * Back-office Portal
 * Central hub for managing products, promotions, prices, users, and store configuration
 */

type TabType = 'products' | 'promotions' | 'stores' | 'sync' | 'users' | 'reports';

export function BackOfficePortal() {
  const [activeTab, setActiveTab] = useState<TabType>('products');

  const tabs: Array<{ id: TabType; label: string; icon: string }> = [
    { id: 'products', label: 'Products & Pricing', icon: '📦' },
    { id: 'promotions', label: 'Promotions', icon: '🎁' },
    { id: 'stores', label: 'Store Configuration', icon: '🏪' },
    { id: 'sync', label: 'Sync Monitor', icon: '🔄' },
    { id: 'users', label: 'User Management', icon: '👥' },
    { id: 'reports', label: 'Reports', icon: '📊' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Back Office Portal</h1>
              <p className="text-sm text-gray-600 mt-1">
                Liquor River - Central Administration
              </p>
            </div>

            {/* User info */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">Admin User</p>
                <p className="text-xs text-gray-500">admin@liquorriver.com</p>
              </div>
              <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
                Logout
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-6 flex gap-2 border-b overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 font-semibold whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {activeTab === 'products' && <ProductManagement />}
        {activeTab === 'promotions' && <PromotionManagement />}
        {activeTab === 'stores' && <StoreConfiguration />}
        {activeTab === 'sync' && <SyncMonitor />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'reports' && <ReportsDashboard />}
      </div>
    </div>
  );
}

export default BackOfficePortal;
