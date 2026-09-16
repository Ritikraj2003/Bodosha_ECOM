'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, ChevronDown } from 'lucide-react';
import { exportToCSV, exportToExcel, exportToPDF } from '@/lib/exportUtils';

interface ExportDropdownProps {
  title: string;
  filenamePrefix: string;
  headers: string[];
  rows: (string | number | boolean | null | undefined)[][];
  disabled?: boolean;
}

export default function ExportDropdown({
  title,
  filenamePrefix,
  headers,
  rows,
  disabled = false,
}: ExportDropdownProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getDatedFilename = (ext: string) => {
    const today = new Date().toISOString().slice(0, 10);
    return `${filenamePrefix}-${today}.${ext}`;
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExportCSV = () => {
    exportToCSV(getDatedFilename('csv'), headers, rows);
    setOpen(false);
  };

  const handleExportExcel = () => {
    exportToExcel(getDatedFilename('xlsx'), headers, rows);
    setOpen(false);
  };

  const handleExportPDF = () => {
    exportToPDF(title, getDatedFilename('pdf'), headers, rows);
    setOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-zcard text-ztext border border-zborder rounded-xl hover:bg-zgray transition-colors disabled:opacity-50"
      >
        <Download size={14} className="text-zred" />
        <span>Export</span>
        <ChevronDown size={12} className={`text-ztext-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 rounded-xl bg-zcard border border-zborder shadow-2xl z-50 py-1 text-xs font-medium animate-in fade-in duration-150">
          <button
            type="button"
            onClick={handleExportExcel}
            className="w-full text-left px-3 py-2 text-ztext hover:bg-zgray transition-colors flex items-center gap-2"
          >
            <FileSpreadsheet size={14} className="text-emerald-500" />
            <span>Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="w-full text-left px-3 py-2 text-ztext hover:bg-zgray transition-colors flex items-center gap-2"
          >
            <FileText size={14} className="text-red-400" />
            <span>PDF (.pdf)</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="w-full text-left px-3 py-2 text-ztext hover:bg-zgray transition-colors flex items-center gap-2"
          >
            <Download size={14} className="text-blue-400" />
            <span>CSV (.csv)</span>
          </button>
        </div>
      )}
    </div>
  );
}
