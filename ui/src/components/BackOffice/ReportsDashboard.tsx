import React, { useState } from 'react';
import { createApiClient, useGenerateXReport, useGenerateZReport } from '../../client';

/**
 * Reports Dashboard
 * Comprehensive reporting: X/Z reports, EOD, sales, drawer reconciliation, tax reports
 */

const apiClient = createApiClient();

export function ReportsDashboard() {
  const [activeTab, setActiveTab] = useState<'daily' | 'drawer' | 'sales' | 'tax' | 'inventory'>('daily');
  const storeId = 'STORE-001'; // TODO: Get from context
  const terminalId = 'TERM-001'; // TODO: Get from context

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Reports & Analytics</h2>

        {/* Report Type Tabs */}
        <div className="flex gap-2 border-b">
          <TabButton
            active={activeTab === 'daily'}
            onClick={() => setActiveTab('daily')}
            icon="📊"
            label="Daily Reports"
          />
          <TabButton
            active={activeTab === 'drawer'}
            onClick={() => setActiveTab('drawer')}
            icon="💰"
            label="Drawer Management"
          />
          <TabButton
            active={activeTab === 'sales'}
            onClick={() => setActiveTab('sales')}
            icon="📈"
            label="Sales Analysis"
          />
          <TabButton
            active={activeTab === 'tax'}
            onClick={() => setActiveTab('tax')}
            icon="💵"
            label="Tax Reports"
          />
          <TabButton
            active={activeTab === 'inventory'}
            onClick={() => setActiveTab('inventory')}
            icon="📦"
            label="Inventory"
          />
        </div>
      </div>

      {/* Report Content */}
      <div>
        {activeTab === 'daily' && <DailyReports storeId={storeId} terminalId={terminalId} />}
        {activeTab === 'drawer' && <DrawerManagement storeId={storeId} terminalId={terminalId} />}
        {activeTab === 'sales' && <SalesAnalysis storeId={storeId} />}
        {activeTab === 'tax' && <TaxReports storeId={storeId} />}
        {activeTab === 'inventory' && <InventoryReports storeId={storeId} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 font-semibold transition-colors ${
        active
          ? 'border-b-2 border-blue-600 text-blue-600'
          : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      <span className="mr-2">{icon}</span>
      {label}
    </button>
  );
}

/**
 * Daily Reports (X Reports, Z Reports, EOD)
 */
function DailyReports({ storeId, terminalId }: { storeId: string; terminalId: string }) {
  const [reportData, setReportData] = useState<any>(null);
  const [reportType, setReportType] = useState<'none' | 'x' | 'z'>('none');

  const generateXReport = useGenerateXReport(apiClient);
  const generateZReport = useGenerateZReport(apiClient);

  const handleGenerateXReport = async () => {
    try {
      const report = await generateXReport.mutateAsync({ storeId, terminalId });
      setReportData(report);
      setReportType('x');
    } catch (error) {
      console.error('Failed to generate X Report:', error);
    }
  };

  const handleGenerateZReport = async () => {
    try {
      const report = await generateZReport.mutateAsync({ storeId, terminalId });
      setReportData(report);
      setReportType('z');
    } catch (error) {
      console.error('Failed to generate Z Report:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Report Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ReportCard
          title="X Report"
          description="Mid-day sales report (does not close drawer)"
          icon="📄"
          buttonText="Generate X Report"
          onClick={handleGenerateXReport}
          loading={generateXReport.isPending}
        />
        <ReportCard
          title="Z Report"
          description="End-of-day report with drawer reconciliation"
          icon="📋"
          buttonText="Generate Z Report"
          onClick={handleGenerateZReport}
          loading={generateZReport.isPending}
        />
        <ReportCard
          title="EOD Summary"
          description="Complete end-of-day business summary"
          icon="📊"
          buttonText="Generate EOD"
          onClick={() => alert('EOD Report coming soon')}
          loading={false}
        />
      </div>

      {/* Report Display */}
      {reportData && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-900">
              {reportType === 'x' ? 'X Report' : 'Z Report'} - {reportData.businessDate}
            </h3>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              🖨️ Print Report
            </button>
          </div>

          {/* Summary Section */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-3">Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <MetricBox label="Total Sales" value={`$${reportData.summary?.totalSales?.toFixed(2) || '0.00'}`} />
              <MetricBox label="Total Tax" value={`$${reportData.summary?.totalTax?.toFixed(2) || '0.00'}`} />
              <MetricBox label="Transactions" value={reportData.summary?.totalTransactions || 0} />
              <MetricBox label="Items Sold" value={reportData.summary?.totalItems || 0} />
              <MetricBox label="Avg Transaction" value={`$${reportData.summary?.averageTransaction?.toFixed(2) || '0.00'}`} />
            </div>
          </div>

          {/* Tender Breakdown */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-3">Tender Breakdown</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <TenderBox
                label="Cash"
                count={reportData.tenders?.cash?.count || 0}
                amount={reportData.tenders?.cash?.amount || 0}
              />
              <TenderBox
                label="Credit Card"
                count={reportData.tenders?.creditCard?.count || 0}
                amount={reportData.tenders?.creditCard?.amount || 0}
              />
              <TenderBox
                label="Debit Card"
                count={reportData.tenders?.debitCard?.count || 0}
                amount={reportData.tenders?.debitCard?.amount || 0}
              />
              <TenderBox
                label="Other"
                count={reportData.tenders?.other?.count || 0}
                amount={reportData.tenders?.other?.amount || 0}
              />
            </div>
          </div>

          {/* Adjustments */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-3">Adjustments</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AdjustmentBox
                label="Discounts"
                count={reportData.discounts?.discountCount || 0}
                amount={reportData.discounts?.totalDiscounts || 0}
                color="green"
              />
              <AdjustmentBox
                label="Voids"
                count={reportData.voids?.voidCount || 0}
                amount={reportData.voids?.totalVoided || 0}
                color="red"
              />
              <AdjustmentBox
                label="Refunds"
                count={reportData.refunds?.refundCount || 0}
                amount={reportData.refunds?.totalRefunded || 0}
                color="orange"
              />
            </div>
          </div>

          {/* Z Report - Drawer Reconciliation */}
          {reportType === 'z' && (
            <div className="mb-6 border-t pt-6">
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Drawer Reconciliation</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricBox label="Starting Cash" value={`$${reportData.drawerStartingCash?.toFixed(2) || '0.00'}`} />
                <MetricBox label="Expected Cash" value={`$${reportData.drawerExpectedCash?.toFixed(2) || '0.00'}`} />
                <MetricBox label="Actual Cash" value={`$${reportData.drawerActualCash?.toFixed(2) || '0.00'}`} />
                <MetricBox
                  label="Variance"
                  value={`$${reportData.drawerVariance?.toFixed(2) || '0.00'}`}
                  valueClass={reportData.drawerVariance === 0 ? 'text-green-600' : 'text-red-600'}
                />
              </div>
            </div>
          )}

          {/* Hourly Breakdown */}
          {reportData.hourlyBreakdown && reportData.hourlyBreakdown.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-gray-900 mb-3">Hourly Breakdown</h4>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hour</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Transactions</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {reportData.hourlyBreakdown.map((hour: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {hour.hour}:00 - {hour.hour + 1}:00
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                          {hour.transactions}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                          ${hour.sales.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Drawer Management
 */
function DrawerManagement({ storeId, terminalId }: { storeId: string; terminalId: string }) {
  const openDrawer = useGenerateXReport(apiClient); // TODO: Use proper open drawer hook
  const closeDrawer = useGenerateZReport(apiClient); // TODO: Use proper close drawer hook

  return (
    <div className="space-y-6">
      {/* Current Drawer Status */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Current Drawer Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium">Status</p>
            <p className="text-2xl font-bold text-green-900 mt-2">OPEN</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 font-medium">Starting Cash</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">$200.00</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600 font-medium">Expected Cash</p>
            <p className="text-2xl font-bold text-gray-900 mt-2">$1,247.50</p>
          </div>
        </div>
      </div>

      {/* Drawer Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Open Drawer</h4>
          <p className="text-sm text-gray-600 mb-4">
            Open cash drawer for a new shift. Enter starting cash amount.
          </p>
          <div className="space-y-3">
            <input
              type="number"
              placeholder="Starting cash amount"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
              Open Drawer
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Close & Reconcile Drawer</h4>
          <p className="text-sm text-gray-600 mb-4">
            Close drawer and reconcile cash. Enter actual cash counted.
          </p>
          <div className="space-y-3">
            <input
              type="number"
              placeholder="Actual cash counted"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
              Close & Reconcile
            </button>
          </div>
        </div>
      </div>

      {/* Recent Drawer Sessions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Recent Drawer Sessions</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Opened By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Closed By</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Starting</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Expected</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actual</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <DrawerSessionRow
                date="2025-11-15"
                openedBy="John Manager"
                closedBy="John Manager"
                starting={200}
                expected={1247.5}
                actual={1245}
                variance={-2.5}
                status="VARIANCE"
              />
              <DrawerSessionRow
                date="2025-11-14"
                openedBy="Jane Cashier"
                closedBy="John Manager"
                starting={200}
                expected={1580.75}
                actual={1580.75}
                variance={0}
                status="RECONCILED"
              />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DrawerSessionRow({
  date,
  openedBy,
  closedBy,
  starting,
  expected,
  actual,
  variance,
  status,
}: {
  date: string;
  openedBy: string;
  closedBy: string;
  starting: number;
  expected: number;
  actual: number;
  variance: number;
  status: string;
}) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{date}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{openedBy}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{closedBy}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">${starting.toFixed(2)}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">${expected.toFixed(2)}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">${actual.toFixed(2)}</td>
      <td className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${variance === 0 ? 'text-green-600' : 'text-red-600'}`}>
        ${variance.toFixed(2)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
          status === 'RECONCILED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {status}
        </span>
      </td>
    </tr>
  );
}

/**
 * Sales Analysis
 */
function SalesAnalysis({ storeId }: { storeId: string }) {
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-gray-900">Sales Analysis</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setDateRange('today')}
              className={`px-4 py-2 rounded-lg font-medium ${
                dateRange === 'today' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateRange('week')}
              className={`px-4 py-2 rounded-lg font-medium ${
                dateRange === 'week' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setDateRange('month')}
              className={`px-4 py-2 rounded-lg font-medium ${
                dateRange === 'month' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
              }`}
            >
              This Month
            </button>
          </div>
        </div>
      </div>

      {/* Channel Performance */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Channel Performance</h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ChannelCard channel="In-Store" transactions={145} revenue={3247.50} color="blue" />
          <ChannelCard channel="DoorDash" transactions={67} revenue={1890.25} color="red" />
          <ChannelCard channel="Uber Eats" transactions={52} revenue={1456.80} color="green" />
          <ChannelCard channel="Website" transactions={38} revenue={987.45} color="purple" />
        </div>
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Top Selling Products</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty Sold</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">% of Total</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <TopProductRow rank={1} product="Premium Beer 6-Pack" qty={234} revenue={3037.66} percent={18.5} />
              <TopProductRow rank={2} product="Red Wine 750ml" qty={156} revenue={3898.44} percent={23.7} />
              <TopProductRow rank={3} product="Vodka 1L" qty={89} revenue={2492.11} percent={15.2} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChannelCard({ channel, transactions, revenue, color }: { channel: string; transactions: number; revenue: number; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    red: 'bg-red-50 border-red-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
  };

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-sm font-medium text-gray-600">{channel}</p>
      <p className="text-2xl font-bold text-gray-900 mt-2">${revenue.toFixed(2)}</p>
      <p className="text-sm text-gray-600 mt-1">{transactions} transactions</p>
    </div>
  );
}

function TopProductRow({ rank, product, qty, revenue, percent }: { rank: number; product: string; qty: number; revenue: number; percent: number }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">#{rank}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{qty}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">${revenue.toFixed(2)}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">{percent}%</td>
    </tr>
  );
}

/**
 * Tax Reports
 */
function TaxReports({ storeId }: { storeId: string }) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Tax Collection Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <MetricBox label="Total Tax Collected" value="$1,247.85" />
          <MetricBox label="Sales Tax" value="$1,089.50" />
          <MetricBox label="Excise Tax" value="$158.35" />
        </div>

        <h4 className="text-lg font-semibold text-gray-900 mb-3">By Jurisdiction</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jurisdiction</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax Type</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Taxable Sales</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tax Collected</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <TaxRow jurisdiction="State" taxType="Sales Tax" rate={6.5} taxableSales={15247.50} taxCollected={991.09} />
              <TaxRow jurisdiction="County" taxType="Sales Tax" rate={0.5} taxableSales={15247.50} taxCollected={76.24} />
              <TaxRow jurisdiction="City" taxType="Sales Tax" rate={1.0} taxableSales={15247.50} taxCollected={152.48} />
              <TaxRow jurisdiction="State" taxType="Excise Tax (Alcohol)" rate={null} taxableSales={8945.20} taxCollected={158.35} />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TaxRow({ jurisdiction, taxType, rate, taxableSales, taxCollected }: { jurisdiction: string; taxType: string; rate: number | null; taxableSales: number; taxCollected: number }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{jurisdiction}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{taxType}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{rate ? `${rate}%` : 'Variable'}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">${taxableSales.toFixed(2)}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">${taxCollected.toFixed(2)}</td>
    </tr>
  );
}

/**
 * Inventory Reports
 */
function InventoryReports({ storeId }: { storeId: string }) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Inventory Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <MetricBox label="Total SKUs" value="1,247" />
          <MetricBox label="Low Stock Items" value="23" valueClass="text-orange-600" />
          <MetricBox label="Out of Stock" value="5" valueClass="text-red-600" />
          <MetricBox label="Inventory Value" value="$87,543.20" />
        </div>

        <h4 className="text-lg font-semibold text-gray-900 mb-3">Low Stock Alerts</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Reorder Point</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <InventoryRow product="Premium Beer 6-Pack" currentStock={8} reorderPoint={20} status="LOW" />
              <InventoryRow product="Red Wine 750ml" currentStock={0} reorderPoint={15} status="OUT" />
              <InventoryRow product="Vodka 1L" currentStock={12} reorderPoint={25} status="LOW" />
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InventoryRow({ product, currentStock, reorderPoint, status }: { product: string; currentStock: number; reorderPoint: number; status: string }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">{currentStock}</td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{reorderPoint}</td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
          status === 'OUT' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'
        }`}>
          {status === 'OUT' ? 'OUT OF STOCK' : 'LOW STOCK'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <button className="text-blue-600 hover:text-blue-900 font-medium">Reorder</button>
      </td>
    </tr>
  );
}

// Helper Components
function ReportCard({ title, description, icon, buttonText, onClick, loading }: any) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-4">{description}</p>
      <button
        onClick={onClick}
        disabled={loading}
        className={`w-full px-4 py-2 rounded-lg font-medium ${
          loading
            ? 'bg-gray-400 text-white cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {loading ? 'Generating...' : buttonText}
      </button>
    </div>
  );
}

function MetricBox({ label, value, valueClass = 'text-gray-900' }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-sm text-gray-600 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-2 ${valueClass}`}>{value}</p>
    </div>
  );
}

function TenderBox({ label, count, amount }: { label: string; count: number; amount: number }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-sm text-gray-600 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-2">${amount.toFixed(2)}</p>
      <p className="text-sm text-gray-600 mt-1">{count} transactions</p>
    </div>
  );
}

function AdjustmentBox({ label, count, amount, color }: { label: string; count: number; amount: number; color: string }) {
  const colorClasses: Record<string, string> = {
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    orange: 'bg-orange-50 border-orange-200',
  };

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-2">${amount.toFixed(2)}</p>
      <p className="text-sm text-gray-600 mt-1">{count} adjustments</p>
    </div>
  );
}

export default ReportsDashboard;
