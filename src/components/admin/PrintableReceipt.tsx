'use client';

import { Printer, X } from 'lucide-react';

export interface PrintableReceiptProps {
  order: {
    trackingCode: string;
    createdAt?: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    orderType?: string;
    total: number;
    subtotal?: number;
    taxAmount?: number;
    paymentMethod: string;
    paymentStatus?: string;
    items: Array<{
      product_name?: string;
      name?: string;
      quantity: number;
      price?: number;
      unit_price?: number;
      subtotal?: number;
    }>;
  };
  onClose: () => void;
}

export function PrintableReceipt({ order, onClose }: PrintableReceiptProps) {
  function handlePrint() {
    window.print();
  }

  const subtotal = order.subtotal ?? order.items.reduce((s, i) => s + (i.subtotal ?? ((i.price ?? 0) * i.quantity)), 0);
  const tax = order.taxAmount ?? Math.max(0, order.total - subtotal);
  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString();
  const isTakeaway = order.orderType === 'takeaway';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Container with print-specific stylesheet overrides */}
      <div className="bg-zcard border border-zborder rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 my-8 print:shadow-none print:border-none print:p-0 print:m-0 print:bg-white print:text-black">
        {/* Modal Top Actions (Hidden when printing) */}
        <div className="flex items-center justify-between border-b border-zborder pb-3 print:hidden">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ztext">Print Counter Receipt</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-zred text-white rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-red-600 transition-colors shadow-z"
            >
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} className="p-1 hover:bg-zgray rounded-lg text-ztext-lighter">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* RECEIPT CONTENT BODY */}
        <div id="receipt-printable-area" className="space-y-4 text-xs font-mono text-ztext print:text-black print:w-full">
          {/* Header */}
          <div className="text-center border-b border-dashed border-zborder print:border-black pb-3">
            <h1 className="text-base font-black tracking-tight text-ztext print:text-black">DILIP DA</h1>
            <p className="text-[10px] text-ztext-light print:text-black">Near CIT Kokrajhar, Kokrajhar, Assam</p>
            <p className="text-[10px] font-bold text-zred print:text-black mt-1 uppercase tracking-wider">
              {isTakeaway ? '*** TAKE AWAY RECEIPT ***' : '*** IN-STORE COUNTER RECEIPT ***'}
            </p>
          </div>

          {/* Metadata */}
          <div className="space-y-1 border-b border-dashed border-zborder print:border-black pb-3 text-[11px]">
            <div className="flex justify-between">
              <span className="text-ztext-light print:text-black">Receipt No:</span>
              <span className="font-bold">{order.trackingCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ztext-light print:text-black">Order Type:</span>
              <span className="font-bold uppercase text-zred print:text-black">{isTakeaway ? 'TAKE AWAY (PARCEL)' : 'IN STORE (DINE-IN)'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ztext-light print:text-black">Date & Time:</span>
              <span>{orderDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ztext-light print:text-black">Customer:</span>
              <span className="font-semibold">{order.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ztext-light print:text-black">Phone:</span>
              <span>{order.customerPhone}</span>
            </div>
          </div>

          {/* Items Table */}
          <div className="border-b border-dashed border-zborder print:border-black pb-3">
            <div className="grid grid-cols-12 font-bold border-b border-zborder print:border-black pb-1 mb-1.5 text-[11px]">
              <span className="col-span-6">ITEM</span>
              <span className="col-span-2 text-center">QTY</span>
              <span className="col-span-4 text-right">PRICE</span>
            </div>

            <div className="space-y-1.5">
              {order.items.map((item, idx) => {
                const itemName = item.product_name ?? item.name ?? 'Item';
                const itemSubtotal = item.subtotal ?? ((item.unit_price ?? item.price ?? 0) * item.quantity);
                return (
                  <div key={idx} className="grid grid-cols-12 text-[11px]">
                    <span className="col-span-6 font-medium truncate pr-1">{itemName}</span>
                    <span className="col-span-2 text-center">x{item.quantity}</span>
                    <span className="col-span-4 text-right font-semibold">₹{itemSubtotal}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Financial Totals */}
          <div className="space-y-1 text-[11px] border-b border-dashed border-zborder print:border-black pb-3">
            <div className="flex justify-between">
              <span className="text-ztext-light print:text-black">Subtotal:</span>
              <span>₹{subtotal}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between">
                <span className="text-ztext-light print:text-black">Taxes / Fees:</span>
                <span>₹{tax}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-sm pt-1.5 border-t border-zborder print:border-black text-ztext print:text-black">
              <span>TOTAL PAID:</span>
              <span>₹{order.total}</span>
            </div>
          </div>

          {/* Footer Info */}
          <div className="text-center space-y-1 text-[10px] pt-1">
            <div className="flex items-center justify-between font-bold text-[11px] bg-zgray print:bg-transparent p-1.5 rounded">
              <span>PAYMENT MODE:</span>
              <span className="uppercase text-zred print:text-black">{order.paymentMethod}</span>
            </div>
            <p className="text-ztext-light print:text-black pt-2">Thank you for dining at Dilip Da!</p>
            <p className="text-ztext-lighter print:text-black">Please visit us again soon.</p>
          </div>
        </div>

        {/* Modal Bottom Print Button (Hidden when printing) */}
        <div className="pt-2 print:hidden">
          <button
            onClick={handlePrint}
            className="w-full button-z button-z-primary h-10 text-xs font-bold flex items-center justify-center gap-2"
          >
            <Printer size={16} /> Print Receipt Now
          </button>
        </div>
      </div>
    </div>
  );
}
