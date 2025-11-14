import React, { useState } from 'react';
import { ProductManagement } from './ProductManagement';
import { PromotionManagement } from './PromotionManagement';
import { StoreConfiguration } from './StoreConfiguration';
import { SyncMonitor } from './SyncMonitor';
import { UserManagement } from './UserManagement';

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
        {activeTab === 'reports' && <ReportsView />}
      </div>
    </div>
  );
}

/**
 * Reports View (placeholder)
 */
function ReportsView() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Reports</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ReportCard title="Sales Report" description="Daily, weekly, monthly sales" icon="💰" />
        <ReportCard title="Inventory Report" description="Stock levels and movements" icon="📊" />
        <ReportCard
          title="Performance Report"
          description="Terminal and cashier performance"
          icon="📈"
        />
        <ReportCard
          title="Compliance Report"
          description="PCI-DSS and age verification"
          icon="✅"
        />
        <ReportCard title="Sync Report" description="Sync status and conflicts" icon="🔄" />
        <ReportCard title="Tax Report" description="Tax collected by jurisdiction" icon="💵" />
      </div>
    </div>
  );
}

function ReportCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="border-2 border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600 mt-1">{description}</p>
      <button className="mt-4 text-blue-600 text-sm font-medium hover:text-blue-700">
        Generate Report →
      </button>
    </div>
  );
}

export default BackOfficePortal;
