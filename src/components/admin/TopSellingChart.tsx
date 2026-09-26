'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';
import { Flame, Package, IndianRupee, Trophy, ShoppingBag, Loader2 } from 'lucide-react';
import type { TopSellingItem } from '@/features/admin/types';
import { getTopSellingItems } from '@/features/admin/actions';

interface TopSellingChartProps {
  initialData?: TopSellingItem[];
  dateFilter?: { fromDate?: string; toDate?: string };
  dateLabel?: string;
}

export default function TopSellingChart({
  initialData,
  dateFilter,
  dateLabel = 'All time',
}: TopSellingChartProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<am5.Root | null>(null);

  const [limit, setLimit] = useState<number>(5);
  const [inputValue, setInputValue] = useState<string>('5');
  const [items, setItems] = useState<TopSellingItem[]>(() => initialData || []);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchTopItems = React.useCallback(async (targetLimit: number) => {
    setLoading(true);
    try {
      const res = await getTopSellingItems({
        fromDate: dateFilter?.fromDate,
        toDate: dateFilter?.toDate,
        limit: Math.max(targetLimit, 10),
      });
      if (res.success && res.data) {
        setItems(res.data);
      }
    } catch (e) {
      console.error('Failed to fetch top selling items:', e);
    } finally {
      setLoading(false);
    }
  }, [dateFilter?.fromDate, dateFilter?.toDate]);

  // Sync with initialData changes from parent
  useEffect(() => {
    if (initialData !== undefined) {
      setItems(initialData);
    }
  }, [initialData]);

  // If initialData is not provided at all, fetch on mount or when dateFilter changes
  useEffect(() => {
    if (initialData === undefined) {
      fetchTopItems(limit);
    }
  }, [initialData, fetchTopItems, limit]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInputValue(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      setLimit(parsed);
      if (parsed > items.length) {
        fetchTopItems(parsed);
      }
    }
  }

  function handlePresetClick(preset: number) {
    setLimit(preset);
    setInputValue(String(preset));
    if (preset > items.length) {
      fetchTopItems(preset);
    }
  }

  const displayedItems = React.useMemo(() => items.slice(0, limit), [items, limit]);
  const totalUnits = displayedItems.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalRevenue = displayedItems.reduce((acc, curr) => acc + curr.revenue, 0);
  const topItem = displayedItems[0];

  useEffect(() => {
    if (!chartRef.current) return;

    if (rootRef.current) {
      rootRef.current.dispose();
      rootRef.current = null;
    }

    if (displayedItems.length === 0) return;

    const root = am5.Root.new(chartRef.current);
    rootRef.current = root;
    if (root._logo) root._logo.dispose();

    root.setThemes([am5themes_Animated.new(root)]);

    const chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false,
        panY: false,
        wheelX: 'none',
        wheelY: 'none',
        layout: root.verticalLayout,
        paddingLeft: 10,
        paddingRight: 20,
        paddingTop: 10,
        paddingBottom: 10,
      })
    );

    // Theme palette for distinct vibrant bars
    const palette = [
      am5.color(0xef4444), // red-500
      am5.color(0xf97316), // orange-500
      am5.color(0xf59e0b), // amber-500
      am5.color(0x10b981), // emerald-500
      am5.color(0x06b6d4), // cyan-500
      am5.color(0x3b82f6), // blue-500
      am5.color(0x8b5cf6), // violet-500
      am5.color(0xec4899), // pink-500
      am5.color(0x14b8a6), // teal-500
      am5.color(0xeab308), // yellow-500
    ];

    chart.set(
      'colors',
      am5.ColorSet.new(root, {
        colors: palette,
      })
    );

    // Y Axis: Product names (inversed so rank 1 is on top)
    const yRenderer = am5xy.AxisRendererY.new(root, {
      inversed: true,
      cellStartLocation: 0.1,
      cellEndLocation: 0.9,
      minorGridEnabled: false,
    });

    yRenderer.grid.template.setAll({
      stroke: am5.color(0x38383b),
      strokeOpacity: 0.25,
    });

    yRenderer.labels.template.setAll({
      fill: am5.color(0xd4d4d8),
      fontSize: 12,
      fontWeight: '500',
      maxWidth: 180,
      oversizedBehavior: 'truncate',
    });

    const yAxis = chart.yAxes.push(
      am5xy.CategoryAxis.new(root, {
        categoryField: 'name',
        renderer: yRenderer,
      })
    );

    // X Axis: Units sold count
    const xRenderer = am5xy.AxisRendererX.new(root, {
      strokeOpacity: 0.1,
      minGridDistance: 40,
    });

    xRenderer.grid.template.setAll({
      stroke: am5.color(0x38383b),
      strokeOpacity: 0.25,
    });

    xRenderer.labels.template.setAll({
      fill: am5.color(0xa3a3a3),
      fontSize: 11,
    });

    const xAxis = chart.xAxes.push(
      am5xy.ValueAxis.new(root, {
        min: 0,
        renderer: xRenderer,
        numberFormat: '#,###',
      })
    );

    // Column Series (horizontal bars)
    const series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        name: 'Sold Quantity',
        xAxis: xAxis,
        yAxis: yAxis,
        valueXField: 'quantity',
        categoryYField: 'name',
        colorByDataItem: true,
        colors: chart.get('colors'),
        tooltip: am5.Tooltip.new(root, {
          labelText: '{categoryY}\nSold: {valueX} units\nRevenue: ₹{revenue}',
        }),
      })
    );

    series.columns.template.setAll({
      height: am5.percent(72),
      cornerRadiusTR: 10,
      cornerRadiusBR: 10,
      strokeWidth: 1.5,
      stroke: am5.color(0x27272a),
      shadowOpacity: 0.2,
      shadowOffsetX: 3,
      shadowOffsetY: 2,
      shadowBlur: 5,
      shadowColor: am5.color(0x000000),
    });

    series.columns.template.states.create('hover', {
      shadowOpacity: 0.5,
      shadowBlur: 10,
    });

    // Provide data formatted
    const chartData = displayedItems.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      revenue: Number(item.revenue).toLocaleString('en-IN'),
    }));

    yAxis.data.setAll(chartData);
    series.data.setAll(chartData);

    series.appear(800);
    chart.appear(800, 100);

    return () => {
      if (rootRef.current) {
        rootRef.current.dispose();
        rootRef.current = null;
      }
    };
  }, [displayedItems]);

  const dynamicHeight = Math.max(280, displayedItems.length * 48 + 60);

  return (
    <div className="bg-zcard rounded-xl border border-zborder p-5 shadow-z mb-6 transition-all">
      {/* Header with Title and Limit Input */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zborder">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center">
              <Flame size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold text-ztext flex items-center gap-2">
                Top Selling Items
                <span className="text-[11px] font-normal text-ztext-muted">({dateLabel})</span>
              </h2>
              <p className="text-xs text-ztext-light">
                Highest selling menu items by total quantity ordered
              </p>
            </div>
          </div>
        </div>

        {/* Input box & Quick Presets */}
        <div className="flex items-center gap-2.5 bg-zsurface px-3 py-1.5 rounded-xl border border-zborder self-start sm:self-auto">
          <label htmlFor="top-selling-limit-input" className="text-xs font-semibold text-ztext-light whitespace-nowrap">
            Show Top:
          </label>
          <input
            id="top-selling-limit-input"
            type="number"
            min={1}
            max={50}
            value={inputValue}
            onChange={handleInputChange}
            aria-label="Number of top items to show"
            className="w-14 px-2 py-1 text-center font-bold bg-zcard border border-zborder rounded-lg text-xs text-ztext focus:outline-none focus:border-zred transition-all"
          />

          {/* Quick preset chips */}
          <div className="flex items-center gap-1 border-l border-zborder pl-2.5">
            {[5, 10, 15, 20].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className={`text-[11px] px-2 py-0.5 rounded-md font-semibold transition-all ${
                  limit === preset
                    ? 'bg-zred text-white shadow-sm'
                    : 'bg-zcard text-ztext-lighter hover:text-ztext hover:bg-zgray border border-zborder'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPI Strip */}
      {displayedItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
          <div className="bg-zsurface/60 rounded-lg p-3 border border-zborder flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Trophy size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-ztext-lighter font-medium">#1 Best Seller</p>
              <p className="text-xs font-bold text-ztext truncate" title={topItem?.name}>
                {topItem?.name || '-'}
              </p>
              <span className="text-[10px] text-amber-400 font-semibold">{topItem?.quantity || 0} sold</span>
            </div>
          </div>

          <div className="bg-zsurface/60 rounded-lg p-3 border border-zborder flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
              <Package size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-ztext-lighter font-medium">Top {limit} Total Units</p>
              <p className="text-sm font-bold text-ztext">
                {totalUnits.toLocaleString('en-IN')} <span className="text-xs font-normal text-ztext-lighter">units</span>
              </p>
            </div>
          </div>

          <div className="bg-zsurface/60 rounded-lg p-3 border border-zborder flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <IndianRupee size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] text-ztext-lighter font-medium">Top {limit} Revenue</p>
              <p className="text-sm font-bold text-emerald-400">
                ₹{Number(totalRevenue).toLocaleString('en-IN')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chart View */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-ztext-lighter">
          <Loader2 className="animate-spin mr-2 text-zred" size={20} />
          <span className="text-xs font-medium">Loading top selling items...</span>
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="py-16 text-center text-ztext-lighter">
          <ShoppingBag size={36} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm font-semibold text-ztext">No sales data found</p>
          <p className="text-xs text-ztext-light mt-0.5">
            No completed item sales recorded for {dateLabel}.
          </p>
        </div>
      ) : (
        <div className="w-full relative mt-2" style={{ height: `${dynamicHeight}px` }}>
          <div ref={chartRef} className="w-full h-full" />
        </div>
      )}
    </div>
  );
}
