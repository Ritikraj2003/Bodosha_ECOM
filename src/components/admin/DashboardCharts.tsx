'use client';

import React, { useEffect, useRef } from 'react';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5percent from '@amcharts/amcharts5/percent';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';

interface OrderTypeStat {
  type: string;
  label: string;
  count: number;
}

interface PaymentTypeStat {
  category: string;
  value: number;
}

interface DashboardChartsProps {
  orderTypeData?: OrderTypeStat[];
  paymentTypeData?: PaymentTypeStat[];
}

export default function DashboardCharts({ orderTypeData, paymentTypeData }: DashboardChartsProps) {
  const orderChartRef = useRef<HTMLDivElement | null>(null);
  const paymentChartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let orderRoot: am5.Root | null = null;
    let paymentRoot: am5.Root | null = null;

    // Palette provided in user prompt
    const themeColors = [
      am5.color(0x73556e),
      am5.color(0x9fa1a6),
      am5.color(0xf2aa6b),
      am5.color(0xf28f6b),
      am5.color(0xa95a52),
      am5.color(0xe35b5d),
      am5.color(0xffa446),
    ];

    // -------------------------------------------------------------
    // 1. ORDER TYPE BAR / COLUMN CHART
    // -------------------------------------------------------------
    if (orderChartRef.current) {
      orderRoot = am5.Root.new(orderChartRef.current);
      if (orderRoot._logo) orderRoot._logo.dispose();

      orderRoot.setThemes([am5themes_Animated.new(orderRoot)]);

      const barChart = orderRoot.container.children.push(
        am5xy.XYChart.new(orderRoot, {
          panX: false,
          panY: false,
          wheelX: 'none',
          wheelY: 'none',
          pinchZoomX: false,
          paddingLeft: 0,
          layout: orderRoot.verticalLayout,
        })
      );

      barChart.set(
        'colors',
        am5.ColorSet.new(orderRoot, {
          colors: themeColors,
        })
      );

      const xRenderer = am5xy.AxisRendererX.new(orderRoot, {
        minGridDistance: 40,
        minorGridEnabled: false,
      });

      xRenderer.grid.template.setAll({
        location: 1,
        stroke: am5.color(0x38383b),
        strokeOpacity: 0.3,
      });

      xRenderer.labels.template.setAll({
        fill: am5.color(0xd4d4d8),
        fontSize: 12,
        paddingTop: 8,
      });

      const xAxis = barChart.xAxes.push(
        am5xy.CategoryAxis.new(orderRoot, {
          maxDeviation: 0.3,
          categoryField: 'orderType',
          renderer: xRenderer,
          tooltip: am5.Tooltip.new(orderRoot, {}),
        })
      );

      const yRenderer = am5xy.AxisRendererY.new(orderRoot, {
        strokeOpacity: 0.1,
      });

      yRenderer.grid.template.setAll({
        stroke: am5.color(0x38383b),
        strokeOpacity: 0.3,
      });

      yRenderer.labels.template.setAll({
        fill: am5.color(0xa3a3a3),
        fontSize: 11,
      });

      const yAxis = barChart.yAxes.push(
        am5xy.ValueAxis.new(orderRoot, {
          maxDeviation: 0.3,
          min: 0,
          extraMax: 0.15,
          renderer: yRenderer,
        })
      );

      const barSeries = barChart.series.push(
        am5xy.ColumnSeries.new(orderRoot, {
          name: 'Orders',
          xAxis: xAxis,
          yAxis: yAxis,
          valueYField: 'value',
          categoryXField: 'orderType',
          tooltip: am5.Tooltip.new(orderRoot, {
            labelText: '{categoryX}: {valueY} orders',
          }),
          colorByDataItem: true,
          colors: barChart.get('colors'),
        })
      );

      barSeries.columns.template.setAll({
        tooltipY: 0,
        tooltipText: '{categoryX}: {valueY}',
        shadowOpacity: 0.15,
        shadowOffsetX: 2,
        shadowOffsetY: 2,
        shadowBlur: 2,
        strokeWidth: 2,
        stroke: am5.color(0xffffff),
        shadowColor: am5.color(0x000000),
        cornerRadiusTL: 50,
        cornerRadiusTR: 50,
        fillGradient: am5.LinearGradient.new(orderRoot, {
          stops: [
            {},
            { color: am5.color(0x000000) },
          ],
        }),
        fillPattern: am5.GrainPattern.new(orderRoot, {
          maxOpacity: 0.15,
          density: 0.5,
          colors: [am5.color(0x000000), am5.color(0x000000), am5.color(0xffffff)],
        }),
      });

      barSeries.columns.template.states.create('hover', {
        shadowOpacity: 1,
        shadowBlur: 10,
        cornerRadiusTL: 10,
        cornerRadiusTR: 10,
      });

      const defaultOrderTypes = [
        { orderType: 'Online Delivery', value: 0 },
        { orderType: 'Take Away', value: 0 },
        { orderType: 'In Store', value: 0 },
      ];

      const barData =
        orderTypeData && orderTypeData.length > 0
          ? orderTypeData
              .filter((d) => d.type !== 'dine_in' && d.label !== 'Dine In')
              .map((d) => ({
                orderType: d.label,
                value: d.count,
              }))
          : defaultOrderTypes;

      xAxis.data.setAll(barData);
      barSeries.data.setAll(barData);

      barSeries.appear(1000);
      barChart.appear(1000, 100);
    }

    // -------------------------------------------------------------
    // 2. PAYMENT TYPE DONUT / PIE CHART
    // -------------------------------------------------------------
    if (paymentChartRef.current) {
      paymentRoot = am5.Root.new(paymentChartRef.current);
      if (paymentRoot._logo) paymentRoot._logo.dispose();

      paymentRoot.setThemes([am5themes_Animated.new(paymentRoot)]);

      const pieChart = paymentRoot.container.children.push(
        am5percent.PieChart.new(paymentRoot, {
          endAngle: 270,
          layout: paymentRoot.verticalLayout,
          innerRadius: am5.percent(60),
        })
      );

      const pieSeries = pieChart.series.push(
        am5percent.PieSeries.new(paymentRoot, {
          valueField: 'value',
          categoryField: 'category',
          endAngle: 270,
        })
      );

      pieSeries.set(
        'colors',
        am5.ColorSet.new(paymentRoot, {
          colors: themeColors,
        })
      );

      const radialGradient = am5.RadialGradient.new(paymentRoot, {
        stops: [
          { color: am5.color(0x000000) },
          { color: am5.color(0x000000) },
          {},
        ],
      });

      pieSeries.slices.template.setAll({
        fillGradient: radialGradient,
        strokeWidth: 2,
        stroke: am5.color(0xffffff),
        cornerRadius: 10,
        shadowOpacity: 0.1,
        shadowOffsetX: 2,
        shadowOffsetY: 2,
        shadowColor: am5.color(0x000000),
        fillPattern: am5.GrainPattern.new(paymentRoot, {
          maxOpacity: 0.2,
          density: 0.5,
          colors: [am5.color(0x000000)],
        }),
      });

      pieSeries.slices.template.states.create('hover', {
        shadowOpacity: 1,
        shadowBlur: 10,
      });

      pieSeries.ticks.template.setAll({
        strokeOpacity: 0.4,
        strokeDasharray: [2, 2],
        stroke: am5.color(0xa3a3a3),
      });

      pieSeries.labels.template.setAll({
        fill: am5.color(0xd4d4d8),
        fontSize: 11,
      });

      pieSeries.states.create('hidden', {
        endAngle: -90,
      });

      const defaultPayments = [
        { category: 'Cash / COD', value: 0 },
        { category: 'UPI', value: 0 },
        { category: 'Online', value: 0 },
        { category: 'Wallet', value: 0 },
      ];

      const donutData =
        paymentTypeData && paymentTypeData.length > 0
          ? paymentTypeData
          : defaultPayments;

      pieSeries.data.setAll(donutData);

      const legend = pieChart.children.push(
        am5.Legend.new(paymentRoot, {
          centerX: am5.percent(50),
          x: am5.percent(50),
          marginTop: 15,
          marginBottom: 10,
        })
      );

      legend.labels.template.setAll({
        fill: am5.color(0xd4d4d8),
        fontSize: 12,
      });

      legend.valueLabels.template.setAll({
        fill: am5.color(0xa3a3a3),
        fontSize: 12,
      });

      legend.markerRectangles.template.adapters.add('fillGradient', () => undefined);
      legend.data.setAll(pieSeries.dataItems);

      pieSeries.appear(1000, 100);
    }

    return () => {
      if (orderRoot) orderRoot.dispose();
      if (paymentRoot) paymentRoot.dispose();
    };
  }, [orderTypeData, paymentTypeData]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Order Type Bar Chart */}
      <div className="bg-zcard rounded-xl border border-zborder p-5 shadow-z flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-zred inline-block" />
            <h2 className="text-sm font-bold text-ztext">Order Type Overview</h2>
          </div>
          <span className="text-[11px] font-medium text-ztext-lighter bg-zsurface px-2.5 py-0.5 rounded-full border border-zborder">
            Bar Distribution
          </span>
        </div>
        <p className="text-xs text-ztext-lighter mb-4">Breakdown of orders across delivery and store formats</p>
        <div className="flex-1 w-full min-h-[380px] relative">
          <div ref={orderChartRef} className="w-full h-full min-h-[380px]" />
        </div>
      </div>

      {/* Payment Type Donut Chart */}
      <div className="bg-zcard rounded-xl border border-zborder p-5 shadow-z flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <h2 className="text-sm font-bold text-ztext">Payment Type Overview</h2>
          </div>
          <span className="text-[11px] font-medium text-ztext-lighter bg-zsurface px-2.5 py-0.5 rounded-full border border-zborder">
            Donut Distribution
          </span>
        </div>
        <p className="text-xs text-ztext-lighter mb-4">Share of transactions by payment channel & mode</p>
        <div className="flex-1 w-full min-h-[380px] relative">
          <div ref={paymentChartRef} className="w-full h-full min-h-[380px]" />
        </div>
      </div>
    </div>
  );
}
