import React from 'react';

/**
 * User Management Component
 * Manage users, roles, and permissions
 */

export function UserManagement() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">User Management</h2>
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
            + Add User
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Store
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                PIN Set
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <UserRow
              name="John Manager"
              username="john.manager"
              role="MANAGER"
              store="STORE-001"
              hasPin={true}
              isActive={true}
            />
            <UserRow
              name="Jane Cashier"
              username="jane.cashier"
              role="CASHIER"
              store="STORE-001"
              hasPin={true}
              isActive={true}
            />
            <UserRow
              name="Bob Admin"
              username="bob.admin"
              role="ADMIN"
              store="All Stores"
              hasPin={false}
              isActive={true}
            />
          </tbody>
        </table>
      </div>

      {/* Role Permissions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">Role Permissions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <RoleCard role="CASHIER" permissions={['POS operations', 'Scan items', 'Process payments']} />
          <RoleCard
            role="MANAGER"
            permissions={['All cashier permissions', 'Price overrides', 'Void transactions', 'Reports']}
          />
          <RoleCard
            role="ADMIN"
            permissions={['All manager permissions', 'User management', 'Configuration', 'Full reports']}
          />
          <RoleCard
            role="SUPER_ADMIN"
            permissions={['All admin permissions', 'System settings', 'Multi-store management']}
          />
        </div>
      </div>
    </div>
  );
}

function UserRow({
  name,
  username,
  role,
  store,
  hasPin,
  isActive,
}: {
  name: string;
  username: string;
  role: string;
  store: string;
  hasPin: boolean;
  isActive: boolean;
}) {
  const roleColors: Record<string, string> = {
    CASHIER: 'bg-blue-100 text-blue-800',
    MANAGER: 'bg-purple-100 text-purple-800',
    ADMIN: 'bg-orange-100 text-orange-800',
    SUPER_ADMIN: 'bg-red-100 text-red-800',
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{name}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{username}</td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${roleColors[role]}`}>
          {role}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{store}</td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <span className={`text-sm ${hasPin ? 'text-green-600' : 'text-red-600'} font-medium`}>
          {hasPin ? '✓ Yes' : '✗ No'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center">
        <span
          className={`px-2 py-1 rounded-full text-xs font-semibold ${
            isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
        <button className="text-blue-600 hover:text-blue-900 font-medium mr-3">Edit</button>
        <button className="text-red-600 hover:text-red-900 font-medium">Delete</button>
      </td>
    </tr>
  );
}

function RoleCard({ role, permissions }: { role: string; permissions: string[] }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-gray-900 mb-3">{role}</h4>
      <ul className="space-y-1">
        {permissions.map((perm, index) => (
          <li key={index} className="text-sm text-gray-600">
            • {perm}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default UserManagement;
