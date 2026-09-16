'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Pencil, Clock } from 'lucide-react';
import type { DeliverySlot } from '@/features/delivery/types/slots';
import { formatClock12h, minutesFromMidnight } from '@/features/delivery/lib/slots';

interface DeliverySlotsManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  slots: DeliverySlot[];
  onSaveSlots: (updatedSlots: DeliverySlot[]) => void;
  disabled?: boolean;
}

export default function DeliverySlotsManagerModal({
  isOpen,
  onClose,
  slots,
  onSaveSlots,
  disabled = false,
}: DeliverySlotsManagerModalProps) {
  const [items, setItems] = useState<DeliverySlot[]>([]);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);

  // Form fields
  const [label, setLabel] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('13:30');
  const [cutoffTime, setCutoffTime] = useState('13:15');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
     
    setItems(slots || []);
  }, [slots, isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingSlotId(null);
    setLabel('');
    setDeliveryTime('13:30');
    setCutoffTime('13:15');
    setError(null);
  };

  const handleStartEdit = (slot: DeliverySlot) => {
    setEditingSlotId(slot.id);
    setLabel(slot.label);
    setDeliveryTime(slot.delivery_time);
    setCutoffTime(slot.cutoff_time);
    setError(null);
  };

  const handleSaveSlotItem = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const dMin = minutesFromMidnight(deliveryTime);
    const cMin = minutesFromMidnight(cutoffTime);

    if (cMin >= dMin) {
      setError('Order Cutoff time must be earlier than Delivery time');
      return;
    }

    const slotLabel = label.trim() || `Slot ${editingSlotId ? '' : items.length + 1}`;

    if (editingSlotId) {
      const updated = items.map((item) =>
        item.id === editingSlotId
          ? { ...item, label: slotLabel, delivery_time: deliveryTime, cutoff_time: cutoffTime }
          : item
      );
      setItems(updated);
      onSaveSlots(updated);
    } else {
      const newSlot: DeliverySlot = {
        id: `slot-${Date.now()}`,
        label: slotLabel,
        delivery_time: deliveryTime,
        cutoff_time: cutoffTime,
        is_enabled: true,
      };
      const updated = [...items, newSlot];
      setItems(updated);
      onSaveSlots(updated);
    }

    resetForm();
  };

  const handleToggleSlot = (id: string) => {
    const updated = items.map((item) =>
      item.id === id ? { ...item, is_enabled: !item.is_enabled } : item
    );
    setItems(updated);
    onSaveSlots(updated);
  };

  const handleDeleteSlot = (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    onSaveSlots(updated);
    if (editingSlotId === id) resetForm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl rounded-2xl border border-zborder bg-zcard p-6 shadow-xl max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zborder pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="text-zred" size={20} />
            <h2 className="text-lg font-bold text-ztext">Configure Delivery Slots</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ztext-muted hover:bg-zgray transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto py-4 space-y-5 flex-1 pr-1">
          {/* Add / Edit Form */}
          <form onSubmit={handleSaveSlotItem} className="bg-zgray/50 border border-zborder p-4 rounded-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ztext-muted flex items-center gap-1.5">
              {editingSlotId ? <Pencil size={14} /> : <Plus size={14} />}
              {editingSlotId ? 'Edit Delivery Slot' : 'Add New Delivery Slot'}
            </h3>

            {error && (
              <div className="text-xs font-semibold text-red-500 bg-red-500/10 border border-red-500/20 p-2.5 rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ztext-light mb-1">
                  Slot Label (optional)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Afternoon Slot"
                  className="input-z text-xs w-full"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ztext-light mb-1">
                  Delivery Time *
                </label>
                <input
                  type="time"
                  required
                  value={deliveryTime}
                  onChange={(e) => setDeliveryTime(e.target.value)}
                  className="input-z text-xs w-full font-semibold"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ztext-light mb-1">
                  Order Cutoff Time *
                </label>
                <input
                  type="time"
                  required
                  value={cutoffTime}
                  onChange={(e) => setCutoffTime(e.target.value)}
                  className="input-z text-xs w-full font-semibold"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {editingSlotId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="button-z button-z-ghost text-xs px-3 py-1.5"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="submit"
                className="button-z button-z-primary text-xs px-4 py-1.5 font-bold inline-flex items-center gap-1"
              >
                {editingSlotId ? 'Update Slot' : '+ Save Slot'}
              </button>
            </div>
          </form>

          {/* Configured Slots List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ztext-muted">
              Current Configured Slots ({items.length})
            </h3>

            {items.length === 0 ? (
              <div className="p-6 text-center text-xs text-ztext-muted border border-dashed border-zborder rounded-xl">
                No delivery slots created yet. Add your first slot above.
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((slot) => (
                  <div
                    key={slot.id}
                    className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                      slot.is_enabled
                        ? 'bg-zcard border-zborder'
                        : 'bg-zgray/40 border-zborder/50 opacity-60'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-ztext">{slot.label}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            slot.is_enabled
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              : 'bg-zgray text-ztext-muted border border-zborder'
                          }`}
                        >
                          {slot.is_enabled ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-ztext-light font-medium">
                        Deliver at <strong className="text-ztext">{formatClock12h(slot.delivery_time)}</strong>
                        {' · '}
                        Order before <strong className="text-amber-500">{formatClock12h(slot.cutoff_time)}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Enable/Disable switch */}
                      <button
                        type="button"
                        onClick={() => handleToggleSlot(slot.id)}
                        disabled={disabled}
                        className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                          slot.is_enabled
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 hover:bg-amber-500/20'
                            : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20'
                        }`}
                      >
                        {slot.is_enabled ? 'Disable' : 'Enable'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartEdit(slot)}
                        className="p-1.5 rounded-lg text-ztext-muted hover:bg-zgray hover:text-ztext transition-colors"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="p-1.5 rounded-lg text-ztext-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-zborder pt-3 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="button-z button-z-primary text-xs px-5 py-2 font-bold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
