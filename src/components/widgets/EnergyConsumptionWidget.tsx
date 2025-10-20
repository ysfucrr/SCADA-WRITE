"use client";

import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useAuth } from '@/hooks/use-auth';

// Dynamically import ReactApexChart to avoid SSR issues
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

interface EnergyConsumptionWidgetProps {
  id: string;
  title: string;
  size: { width: number; height: number };
  position?: { x: number; y: number };
  appearance?: {
    fontFamily: string;
    textColor: string;
    backgroundColor: string;
    opacity: number;
  };
  trendLogId: string;
  onDelete: () => void;
  onEdit: () => void;
  onWidgetPositionChange?: (widgetId: string, newPosition: { x: number, y: number }) => void;
}

interface ComparisonData {
  previousValue: number;
  currentValue: number;
  previousTimestamp: Date;
  currentTimestamp: Date;
  percentageChange: number;
  timeFilter: string;
}

interface MonthlyData {
  currentYear: Array<{ month: number; value: number; timestamp: Date }>;
  previousYear: Array<{ month: number; value: number; timestamp: Date }>;
  currentYearLabel: number;
  previousYearLabel: number;
}

export const EnergyConsumptionWidget: React.FC<EnergyConsumptionWidgetProps> = ({
  id,
  title,
  size,
  position = { x: 0, y: 0 },
  appearance,
  trendLogId,
  onDelete,
  onEdit,
  onWidgetPositionChange
}) => {
  const { isAdmin } = useAuth();
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTimeFilter, setCurrentTimeFilter] = useState<'hour' | 'day' | 'month' | 'year'>('day');
  
  // Widget dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentPosition, setCurrentPosition] = useState(position);
  const positionRef = useRef(currentPosition);
  
  // Boundary constants - same as RegisterWidget
  const BOUNDARY = {
    LEFT: 260,  // Left menu width
    TOP: 220,   // Top area height (header and tabs)
    RIGHT: 20,  // Right edge margin
    BOTTOM: 20  // Bottom edge margin
  };

  useEffect(() => {
    setCurrentPosition(position);
    positionRef.current = position;
  }, [position]);

  // Fetch trend log data
  useEffect(() => {
    fetchTrendLogData();
    const interval = setInterval(fetchTrendLogData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [trendLogId, currentTimeFilter]);

  const fetchTrendLogData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/trend-logs/${trendLogId}/entries?timeFilter=${currentTimeFilter}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch trend log data');
      }
      
      const data = await response.json();
      
      if (data.comparison) {
        setComparisonData(data.comparison);
      } else {
        setComparisonData(null);
      }
      
      if (data.monthlyData) {
        setMonthlyData(data.monthlyData);
      } else {
        setMonthlyData(null);
      }
      
      setError(null);
    } catch (err) {
      console.error('Error fetching trend log data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Format date based on time filter
  const formatDate = (date: Date | string, isPrevious: boolean = false) => {
    const d = new Date(date);
    switch (currentTimeFilter) {
      case 'hour':
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      case 'day':
        return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
      case 'month':
        return d.toLocaleDateString('en-US', { month: 'long' });
      case 'year':
        return d.toLocaleDateString('en-US', { year: 'numeric' });
      default:
        return d.toLocaleDateString('en-US');
    }
  };

  // Get period labels - now returns formatted dates
  const getPeriodLabels = () => {
    if (currentTimeFilter === 'year' && monthlyData) {
      // For yearly view, return month names
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
    
    if (!comparisonData) return ['', ''];
    
    return [
      formatDate(comparisonData.previousTimestamp),
      formatDate(comparisonData.currentTimestamp)
    ];
  };

  // Chart options for column chart
  const chartOptions: ApexOptions = currentTimeFilter === 'year' && monthlyData ? {
    // Yearly view with 12 months
    chart: {
      type: 'bar',
      height: '100%',
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: false,
          zoom: false,
          zoomin: false,
          zoomout: false,
          pan: false,
          reset: false
        }
      },
      fontFamily: appearance?.fontFamily || 'Arial, sans-serif',
      background: 'transparent'
    },
    plotOptions: {
      bar: {
        columnWidth: '80%',
        dataLabels: {
          position: 'top'
        }
      }
    },
    dataLabels: {
      enabled: false // Disable for cleaner look with many bars
    },
    xaxis: {
      categories: getPeriodLabels(),
      labels: {
        style: {
          colors: appearance?.textColor || '#666',
          fontSize: '11px'
        }
      },
      axisBorder: {
        color: '#E0E0E0'
      },
      axisTicks: {
        color: '#E0E0E0'
      }
    },
    yaxis: {
      title: {
        text: 'Energy',
        style: {
          color: appearance?.textColor || '#666',
          fontSize: '14px'
        }
      },
      labels: {
        style: {
          colors: appearance?.textColor || '#666',
          fontSize: '12px'
        },
        formatter: (value) => formatEnergyValue(value, 0)
      }
    },
    grid: {
      borderColor: '#E0E0E0',
      strokeDashArray: 0,
      xaxis: {
        lines: {
          show: false
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      }
    },
    tooltip: {
      shared: true,
      intersect: false,
      custom: function({ series, seriesIndex, dataPointIndex, w }) {
        const previousValue = series[0][dataPointIndex];
        const currentValue = series[1][dataPointIndex];
        const monthName = w.globals.labels[dataPointIndex];
        
        let percentChange = 0;
        if (previousValue && previousValue !== 0) {
          percentChange = ((currentValue - previousValue) / previousValue) * 100;
        }
        
        return '<div class="custom-tooltip">' +
          '<div class="tooltip-header">' + monthName + '</div>' +
          '<div class="tooltip-body">' +
          '<div class="tooltip-row">' +
          '<span class="tooltip-marker" style="background-color: #90CAF9"></span>' +
          '<span>All - ' + monthlyData.previousYearLabel + ': </span>' +
          '<strong>' + formatEnergyValue(previousValue, 1) + '</strong>' +
          '</div>' +
          '<div class="tooltip-row">' +
          '<span class="tooltip-marker" style="background-color: #FFC107"></span>' +
          '<span>All - ' + monthlyData.currentYearLabel + ': </span>' +
          '<strong>' + formatEnergyValue(currentValue, 1) + '</strong>' +
          '</div>' +
          '<div class="tooltip-row">' +
          '<span>Change: </span>' +
          '<strong style="color: ' + (percentChange >= 0 ? '#f44336' : '#4caf50') + '">' +
          (percentChange >= 0 ? '+' : '') + percentChange.toFixed(1) + '%' +
          '</strong>' +
          '</div>' +
          '</div>' +
          '</div>';
      }
    },
    colors: ['#90CAF9', '#FFC107'], // Previous year blue, current year yellow
    legend: {
      show: false // Hide ApexCharts legend since we're using custom legend
    }
  } : {
    // Regular view (hour, day, month)
    chart: {
      type: 'bar',
      height: '100%',
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: false,
          zoom: false,
          zoomin: false,
          zoomout: false,
          pan: false,
          reset: false
        }
      },
      fontFamily: appearance?.fontFamily || 'Arial, sans-serif',
      background: 'transparent'
    },
    plotOptions: {
      bar: {
        columnWidth: '40%',
        distributed: true,
        dataLabels: {
          position: 'top'
        }
      }
    },
    dataLabels: {
      enabled: true,
      formatter: function(val) {
        return typeof val === 'number' ? formatEnergyValue(val) : val;
      },
      offsetY: -25,
      style: {
        fontSize: '14px',
        fontWeight: 'bold',
        colors: ['#333']
      }
    },
    xaxis: {
      categories: getPeriodLabels(),
      labels: {
        style: {
          colors: appearance?.textColor || '#666',
          fontSize: '12px'
        }
      },
      axisBorder: {
        color: '#E0E0E0'
      },
      axisTicks: {
        color: '#E0E0E0'
      }
    },
    yaxis: {
      title: {
        text: 'Energy',
        style: {
          color: appearance?.textColor || '#666',
          fontSize: '14px'
        }
      },
      labels: {
        style: {
          colors: appearance?.textColor || '#666',
          fontSize: '12px'
        },
        formatter: (value) => formatEnergyValue(value, 0)
      }
    },
    grid: {
      borderColor: '#E0E0E0',
      strokeDashArray: 0,
      xaxis: {
        lines: {
          show: false
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      }
    },
    tooltip: {
      theme: 'light',
      y: {
        formatter: (value) => formatEnergyValue(value, 2)
      }
    },
    colors: ['#90CAF9', '#FFC107'], // First value blue, last value yellow
    legend: {
      show: false
    }
  };

  const series = currentTimeFilter === 'year' && monthlyData ? [
    {
      name: `All - ${monthlyData.previousYearLabel}`,
      data: monthlyData.previousYear.map(m => m.value)
    },
    {
      name: `All - ${monthlyData.currentYearLabel}`,
      data: monthlyData.currentYear.map(m => m.value)
    }
  ] : [{
    name: 'Consumption',
    data: comparisonData ? [
      comparisonData.previousValue !== null ? comparisonData.previousValue : 0,
      comparisonData.currentValue !== null ? comparisonData.currentValue : 0
    ] : []
  }];

  // Widget dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !isAdmin) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - currentPosition.x,
      y: e.clientY - currentPosition.y
    });
    e.preventDefault();
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isAdmin) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - currentPosition.x,
      y: touch.clientY - currentPosition.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      
      let newPosition = {
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      };
      
      // Apply boundaries
      newPosition.x = Math.max(BOUNDARY.LEFT, newPosition.x);
      newPosition.y = Math.max(BOUNDARY.TOP, newPosition.y);
      
      // Right boundary (considering window width)
      const windowWidth = window.innerWidth - BOUNDARY.RIGHT;
      newPosition.x = Math.min(newPosition.x, windowWidth - size.width);
      
      // Handle page scrolling when dragging near bottom
      const viewportHeight = window.innerHeight;
      const mousePositionInViewport = e.clientY;
      const scrollThreshold = 50;
      
      if (mousePositionInViewport > viewportHeight - scrollThreshold &&
          newPosition.y > currentPosition.y) {
        window.scrollBy(0, 10);
        
        const widgetBottom = newPosition.y + size.height + window.scrollY;
        const body = document.body;
        const neededHeight = widgetBottom + 100;
        
        if (neededHeight > body.offsetHeight) {
          body.style.minHeight = neededHeight + 'px';
        }
      }
      
      setCurrentPosition(newPosition);
      positionRef.current = newPosition;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !e.touches[0]) return;
      e.preventDefault();
      
      const touch = e.touches[0];
      let newPosition = {
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      };
      
      // Apply boundaries
      newPosition.x = Math.max(BOUNDARY.LEFT, newPosition.x);
      newPosition.y = Math.max(BOUNDARY.TOP, newPosition.y);
      
      // Right boundary
      const windowWidth = window.innerWidth - BOUNDARY.RIGHT;
      newPosition.x = Math.min(newPosition.x, windowWidth - size.width);
      
      // Handle page scrolling for touch
      const viewportHeight = window.innerHeight;
      const touchPositionInViewport = touch.clientY;
      const scrollThreshold = 50;
      
      if (touchPositionInViewport > viewportHeight - scrollThreshold &&
          newPosition.y > currentPosition.y) {
        window.scrollBy(0, 5);
        
        const widgetBottom = newPosition.y + size.height + window.scrollY;
        const body = document.body;
        const neededHeight = widgetBottom + 100;
        
        if (neededHeight > body.offsetHeight) {
          body.style.minHeight = neededHeight + 'px';
        }
      }
      
      setCurrentPosition(newPosition);
      positionRef.current = newPosition;
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      if (onWidgetPositionChange && id) {
        onWidgetPositionChange(id, positionRef.current);
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging) return;
      setIsDragging(false);
      if (onWidgetPositionChange && id) {
        onWidgetPositionChange(id, positionRef.current);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, dragStart, id, onWidgetPositionChange]);

  // Helper function to convert hex to RGB
  const hexToRgb = (hex: string): string => {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  };

  // Helper function to format energy values with appropriate unit
  const formatEnergyValue = (value: number, decimals: number = 1): string => {
    if (value >= 1000) {
      // Convert to MWh if value is 1000 or more
      return `${(value / 1000).toFixed(decimals)} MWh`;
    } else {
      // Keep as kWh for smaller values
      return `${value.toFixed(decimals)} kWh`;
    }
  };

  return (
    <div
      data-widget-id={id}
      className="widget-container rounded-xl shadow-lg p-6 relative group border border-transparent hover:border-blue-500 transition-all duration-300"
      style={{
        width: `${size.width}px`,
        height: `${size.height}px`,
        position: 'absolute',
        left: currentPosition.x,
        top: currentPosition.y,
        zIndex: isDragging ? 100 : 1,
        transition: isDragging ? 'none' : 'box-shadow 0.2s ease',
        boxShadow: isDragging ? '0 10px 25px rgba(0, 0, 0, 0.15)' : '',
        backgroundColor: appearance ? 
          `rgba(${hexToRgb(appearance.backgroundColor)}, ${appearance.opacity / 100})` : 
          'white',
        fontFamily: appearance?.fontFamily || 'inherit',
      }}
    >
      {/* Widget Edit/Delete Buttons */}
      {isAdmin && (
        <div className="absolute -top-8 left-2 flex items-center gap-1 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors shadow-md"
            title="Edit Widget"
          >
            <PencilSquareIcon className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors shadow-md"
            title="Delete Widget"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Widget Header */}
      <div
        className="text-xl font-bold mb-4 tracking-wider select-none flex items-center justify-between"
        style={{
          cursor: isAdmin ? (isDragging ? 'grabbing' : 'grab') : 'default',
          padding: '8px 12px',
          marginTop: '-8px',
          marginLeft: '-12px',
          marginRight: '-12px',
          borderTopLeftRadius: '0.75rem',
          borderTopRightRadius: '0.75rem',
          backgroundColor: 'rgba(0, 0, 0, 0.03)',
          borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
          color: appearance?.textColor || '#333',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <span className="flex-1 text-center">{title}</span>
        
        {/* Percentage Change Display in Header */}
        {comparisonData && comparisonData.percentageChange !== null && (
          <div className="flex flex-col items-end text-sm">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {currentTimeFilter === 'hour' ? 'Hourly' :
               currentTimeFilter === 'day' ? 'Daily' :
               currentTimeFilter === 'month' ? 'Monthly' : 'Yearly'} Change
            </div>
            <div className={`text-base font-bold ${comparisonData.percentageChange >= 0 ? 'text-red-500' : 'text-green-500'}`}>
              {comparisonData.percentageChange >= 0 ? '+' : ''}{comparisonData.percentageChange.toFixed(1)}%
            </div>
          </div>
        )}
      </div>

      {/* Time Filter Dropdown and Legend */}
      <div className="absolute top-[84px] left-6 right-6 flex items-center gap-6">
        <select
          value={currentTimeFilter}
          onChange={(e) => setCurrentTimeFilter(e.target.value as any)}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="hour">Hourly</option>
          <option value="day">Daily</option>
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
        </select>
        
        {/* Legend for yearly view */}
        {currentTimeFilter === 'year' && monthlyData && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#90CAF9]"></span>
              <span className="text-sm" style={{ color: appearance?.textColor || '#666' }}>
                All - {monthlyData.previousYearLabel}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#FFC107]"></span>
              <span className="text-sm" style={{ color: appearance?.textColor || '#666' }}>
                All - {monthlyData.currentYearLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Chart Content */}
      <div className="h-[calc(100%-100px)] mt-10">
        <style jsx global>{`
          .custom-tooltip {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 4px;
            padding: 12px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .tooltip-header {
            font-weight: bold;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e0e0e0;
          }
          .tooltip-row {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
          }
          .tooltip-marker {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
            display: inline-block;
          }
        `}</style>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            {error}
          </div>
        ) : comparisonData || (currentTimeFilter === 'year' && monthlyData) ? (
          <ReactApexChart
            options={chartOptions}
            series={series}
            type="bar"
            height="100%"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            No data
          </div>
        )}
      </div>
    </div>
  );
};