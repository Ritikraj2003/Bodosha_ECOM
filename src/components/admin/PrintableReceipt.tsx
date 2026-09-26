'use client';

import { Printer, X } from 'lucide-react';
import { usePublicSettings } from '@/hooks/usePublicSettings';

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
  const settings = usePublicSettings();

  const subtotal = order.subtotal ?? order.items.reduce((s, i) => s + (i.subtotal ?? ((i.price ?? 0) * i.quantity)), 0);
  const tax = order.taxAmount ?? Math.max(0, order.total - subtotal);
  const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleString() : new Date().toLocaleString();
  const isTakeaway = order.orderType === 'takeaway';
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Badmaas House Cafe';
  const storeAddress = settings.address || 'BTM, Bangalore, Karnataka, 560076';
  const orderTitle = isTakeaway ? '*** TAKE AWAY RECEIPT ***' : '*** IN-STORE COUNTER RECEIPT ***';
  const orderTypeLabel = isTakeaway ? 'TAKE AWAY (PARCEL)' : 'IN STORE (DINE-IN)';

  function handlePrint() {
    // Dedicated isolated iframe for 80mm x 210mm thermal printer output
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const itemsHtml = order.items
      .map((item) => {
        const itemName = item.product_name ?? item.name ?? 'Item';
        const itemSubtotal = item.subtotal ?? ((item.unit_price ?? item.price ?? 0) * item.quantity);
        return `
          <tr style="vertical-align: top;">
            <td style="width: 50%; padding: 2.5px 0; font-weight: 500; word-break: break-word; text-align: left;">${itemName}</td>
            <td style="width: 22%; padding: 2.5px 0; text-align: center; white-space: nowrap;">x${item.quantity}</td>
            <td style="width: 28%; padding: 2.5px 0; text-align: right; white-space: nowrap; font-weight: 600;">₹${itemSubtotal}</td>
          </tr>
        `;
      })
      .join('');

    const taxHtml = tax > 0
      ? `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 2px;">
          <span>Taxes / Fees:</span>
          <span>₹${tax}</span>
        </div>
      `
      : '';

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt-${order.trackingCode}</title>
          <style>
            @page {
              size: 80mm 210mm;
              margin: 0;
            }
            *, *::before, *::after {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            html {
              width: 100%;
              margin: 0;
              padding: 0;
              background: #ffffff;
            }
            body {
              width: 100%;
              margin: 0 auto;
              padding: 4mm 0 14mm 0;
              background: #ffffff;
              color: #000000;
              font-family: 'Courier New', Courier, monospace, monospace;
              font-size: 11px;
              line-height: 1.35;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
            }
            .receipt-wrapper {
              width: 72mm;
              max-width: 92%;
              margin: 0 auto;
              padding: 0 1.5mm;
              box-sizing: border-box;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .divider {
              width: 100%;
              border-bottom: 1px dashed #000000;
              margin: 6px 0;
            }
            .row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              width: 100%;
              margin-bottom: 2px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 4px 0;
              table-layout: fixed;
            }
            th {
              border-bottom: 1px dashed #000000;
              padding-bottom: 3px;
              font-size: 11px;
              font-weight: bold;
            }
            td {
              font-size: 11px;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              width: 100%;
              font-size: 13.5px;
              font-weight: 900;
              margin-top: 4px;
              padding-top: 4px;
              border-top: 1px solid #000000;
            }
            .feed-space {
              height: 10mm;
            }
          </style>
        </head>
        <body>
          <div class="receipt-wrapper">
            <div class="center">
              <h1 style="font-size: 15px; font-weight: 900; letter-spacing: 0.5px;">${appName}</h1>
              ${storeAddress ? `<p style="font-size: 10px; margin-top: 2px;">${storeAddress}</p>` : ''}
              <p style="font-size: 10.5px; font-weight: bold; margin-top: 4px; text-transform: uppercase;">
                ${orderTitle}
              </p>
            </div>

            <div class="divider"></div>

            <div class="row">
              <span>Receipt No:</span>
              <span class="bold">${order.trackingCode}</span>
            </div>
            <div class="row">
              <span>Order Type:</span>
              <span class="bold" style="text-transform: uppercase;">${orderTypeLabel}</span>
            </div>
            <div class="row">
              <span>Date & Time:</span>
              <span>${orderDate}</span>
            </div>
            <div class="row">
              <span>Customer:</span>
              <span class="bold">${order.customerName}</span>
            </div>
            <div class="row">
              <span>Phone:</span>
              <span>${order.customerPhone || 'N/A'}</span>
            </div>

            <div class="divider"></div>

            <table>
              <thead>
                <tr>
                  <th style="width: 50%; text-align: left; padding: 2px 0;">ITEM</th>
                  <th style="width: 22%; text-align: center; padding: 2px 0;">QTY</th>
                  <th style="width: 28%; text-align: right; padding: 2px 0;">PRICE</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div class="divider"></div>

            <div class="row">
              <span>Subtotal:</span>
              <span>₹${subtotal}</span>
            </div>
            ${taxHtml}
            <div class="total-row">
              <span>TOTAL PAID:</span>
              <span>₹${order.total}</span>
            </div>

            <div class="divider"></div>

            <div class="row" style="font-weight: bold; font-size: 11px;">
              <span>PAYMENT MODE:</span>
              <span style="text-transform: uppercase;">${order.paymentMethod}</span>
            </div>

            <div class="center" style="margin-top: 8px; font-size: 10px;">
              <p>Thank you for dining at ${appName}!</p>
              <p style="margin-top: 2px;">Please visit us again soon.</p>
            </div>

            <div class="feed-space"></div>
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
      }, 2000);
    }, 250);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Global Print Stylesheet for 80mm x 210mm thermal printers */}
      <style>{`
        @media print {
          @page {
            size: 80mm 210mm !important;
            margin: 0 !important;
          }
          html {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          body {
            width: 100% !important;
            margin: 0 auto !important;
            padding: 4mm 0 14mm 0 !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            justify-content: flex-start !important;
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #receipt-printable-area,
          #receipt-printable-area * {
            visibility: visible !important;
          }
          #receipt-printable-area {
            position: absolute !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            top: 0 !important;
            width: 72mm !important;
            max-width: 92% !important;
            margin: 0 auto !important;
            padding: 4mm 2mm 14mm 2mm !important;
            background: #ffffff !important;
            color: #000000 !important;
            font-family: 'Courier New', Courier, monospace, monospace !important;
            font-size: 11px !important;
            line-height: 1.35 !important;
            box-sizing: border-box !important;
            z-index: 999999 !important;
          }
          .print-hidden,
          .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

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
            <h1 className="text-base font-black tracking-tight text-ztext print:text-black">
              {appName}
            </h1>
            {storeAddress && (
              <p className="text-[10px] text-ztext-light print:text-black">{storeAddress}</p>
            )}
            <p className="text-[10px] font-bold text-zred print:text-black mt-1 uppercase tracking-wider">
              {orderTitle}
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
              <span className="font-bold uppercase text-zred print:text-black">{orderTypeLabel}</span>
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
              <span>{order.customerPhone || 'N/A'}</span>
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
            <p className="text-ztext-light print:text-black pt-2">Thank you for dining at {appName}!</p>
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

