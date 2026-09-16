'use client';

import { Plus, Search, Filter, Edit, Trash2 } from 'lucide-react';

const menuItems = [
  { id: 1, name: 'Kolkata Biryani', category: 'Main Course', price: '₹280', status: 'Available', veg: false },
  { id: 2, name: 'Macher Jhol', category: 'Main Course', price: '₹220', status: 'Available', veg: false },
  { id: 3, name: 'Shorshe Ilish', category: 'Main Course', price: '₹350', status: 'Available', veg: false },
  { id: 4, name: 'Misti Doi', category: 'Dessert', price: '₹80', status: 'Available', veg: true },
  { id: 5, name: 'Daal & Rice', category: 'Main Course', price: '₹160', status: 'Available', veg: true },
];

export default function AdminMenuPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-ztext">Menu Management</h2>
          <p className="text-ztext-light text-sm mt-1">Manage your dishes, categories, and prices.</p>
        </div>
        <button className="button-z button-z-primary flex items-center gap-2">
          <Plus size={16} /> Add New Item
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-zcard border border-zborder rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ztext-muted" />
          <input
            type="text"
            placeholder="Search menu items..."
            className="w-full bg-zbg border border-zborder rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-zred transition-all"
          />
        </div>
        <button className="button-z button-z-ghost flex items-center gap-2 border border-zborder bg-zbg w-full sm:w-auto">
          <Filter size={16} /> Filter
        </button>
      </div>

      {/* Menu Table */}
      <div className="bg-zcard/40 backdrop-blur-md rounded-2xl border border-zborder shadow-z overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zborder/50 text-ztext-muted text-xs uppercase tracking-wider">
                <th className="p-4 font-medium">Item Name</th>
                <th className="p-4 font-medium">Category</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">Price</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zborder/50">
              {menuItems.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="p-4 font-medium text-sm text-ztext">{item.name}</td>
                  <td className="p-4 text-sm text-ztext-light">{item.category}</td>
                  <td className="p-4 text-sm">
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-sm border ${item.veg ? 'border-green-500' : 'border-zred'}`}>
                      <span className={`w-2 h-2 rounded-full ${item.veg ? 'bg-green-500' : 'bg-zred'}`}></span>
                    </span>
                  </td>
                  <td className="p-4 text-sm font-bold">{item.price}</td>
                  <td className="p-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-green-500/10 text-green-500">
                      {item.status}
                    </span>
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    <button className="p-2 text-ztext-muted hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors">
                      <Edit size={16} />
                    </button>
                    <button className="p-2 text-ztext-muted hover:text-zred hover:bg-zred/10 rounded-lg transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
