import React from 'react';

/**
 * Promotion Management Component
 * Manage promotions, Mix & Match, BOGO, discounts
 */

export function PromotionManagement() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Promotion Management</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <PromoCard title="Mix & Match" description="2 for $10, 3 for $15, etc." icon="🎯" />
        <PromoCard title="BOGO" description="Buy One Get One Free/Half Off" icon="🎁" />
        <PromoCard title="% Discount" description="10% off, 20% off, etc." icon="💰" />
        <PromoCard title="$ Discount" description="$5 off, $10 off, etc." icon="💵" />
        <PromoCard title="Combo Deals" description="Bundle products together" icon="📦" />
        <PromoCard title="Loyalty Rewards" description="Points multipliers, bonuses" icon="⭐" />
      </div>

      <button className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold text-lg">
        + Create New Promotion
      </button>
    </div>
  );
}

function PromoCard({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="border-2 border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600 mt-1">{description}</p>
    </div>
  );
}

export default PromotionManagement;
