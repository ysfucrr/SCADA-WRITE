"use client";

import { useWebSocket } from '@/context/WebSocketContext';
import { useAuth } from '@/hooks/use-auth';
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";
import React, { useCallback, useEffect, useRef, useState } from "react";

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
  const [currentTimeFilter, setCurrentTimeFilter] = useState<'month' | 'year'>('month');
  const [liveRegisterValue, setLiveRegisterValue] = useState<number | null>(null);
  const { watchRegister, unwatchRegister } = useWebSocket();
  
  // Widget dragging state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [currentPosition, setCurrentPosition] = useState(position);
  const positionRef = useRef(currentPosition);
  
  // Helper lines state
  const [helperLines, setHelperLines] = useState<{ vertical: number | undefined, horizontal: number | undefined }>({
    vertical: undefined,
    horizontal: undefined
  });
  const watchedRegisterRef = useRef<{ config: any; callback: (value: number) => void } | null>(null);
  
  // Constants for snapping - same as RegisterWidget
  const SNAP_THRESHOLD = 10;
  const GRID_SIZE = 10;
  const WIDGET_SNAP_THRESHOLD = 15;
  const VERTICAL_SNAP_MULTIPLIER = 0.5;
  
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

  const getRegisterKey = (config: any) =>
    config.dataType === 'boolean' && typeof config.bit === 'number'
      ? `${config.analyzerId}-${config.address}-bit${config.bit}`
      : `${config.analyzerId}-${config.address}`;

  const stopWatchingRegister = useCallback(() => {
    if (watchedRegisterRef.current) {
      const { config, callback } = watchedRegisterRef.current;
      console.log('[SocketIO] Cleaning up WebSocket watch for:', getRegisterKey(config));
      unwatchRegister(config, callback);
      watchedRegisterRef.current = null;
    }
  }, [unwatchRegister]);

  const liveValueUpdateHandler = useCallback((value: number) => {
    console.log('Live register value updated:', value);
    setLiveRegisterValue(value);
  }, []);

  // Fetch trend log data - only on initial load and when dependencies change
  useEffect(() => {
    fetchTrendLogData();
    // Removed automatic refresh interval - only update when live values change via WebSocket
  }, [trendLogId, currentTimeFilter, stopWatchingRegister]);

  // When liveRegisterValue changes, update comparisonData with the new value
  useEffect(() => {
    if (liveRegisterValue !== null && currentTimeFilter === 'month') {
      setComparisonData((prev) => {
        if (!prev) {
          return prev;
        }

        const previousValue = prev.previousValue;
        let newPercentageChange = 0;

        if (previousValue !== null && previousValue !== 0) {
          newPercentageChange = ((liveRegisterValue - previousValue) / previousValue) * 100;
        } else if (previousValue === 0 || previousValue === null) {
          newPercentageChange = 100; // 100% increase if there was no previous value
        }

        return {
          ...prev,
          currentValue: liveRegisterValue,
          currentTimestamp: new Date(),
          percentageChange: newPercentageChange
        };
      });
    }
  }, [liveRegisterValue, currentTimeFilter]);

  const fetchTrendLogData = async () => {
    try {
      // Only show loading on initial load, not on subsequent updates
      if (!comparisonData && !monthlyData) {
        setLoading(true);
      }

      const response = await fetch(`/api/trend-logs/${trendLogId}/entries?timeFilter=${currentTimeFilter}`);

      if (!response.ok) {
        throw new Error('Failed to fetch trend log data');
      }

      const data = await response.json();

      if (data.comparison) {
        // Convert timestamp numbers to Date objects if needed
        const comparison = {
          ...data.comparison,
          previousTimestamp: typeof data.comparison.previousTimestamp === 'number' 
            ? new Date(data.comparison.previousTimestamp) 
            : new Date(data.comparison.previousTimestamp),
          currentTimestamp: typeof data.comparison.currentTimestamp === 'number' 
            ? new Date(data.comparison.currentTimestamp) 
            : new Date(data.comparison.currentTimestamp)
        };
        
        // If we have a live value and we're in month view, use the live value for current period
        if (currentTimeFilter === 'month' && liveRegisterValue !== null) {
          setComparisonData({
            ...comparison,
            currentValue: liveRegisterValue,
            currentTimestamp: new Date(),
            percentageChange: comparison.previousValue && comparison.previousValue !== 0 ?
              ((liveRegisterValue - comparison.previousValue) / comparison.previousValue) * 100 :
              100
          });
        } else {
          setComparisonData(comparison);
        }
      } else {
        setComparisonData(null);
      }

      if (data.monthlyData) {
        // Convert timestamp numbers to Date objects if needed
        const monthlyData = {
          ...data.monthlyData,
          currentYear: data.monthlyData.currentYear.map((item: any) => ({
            ...item,
            timestamp: typeof item.timestamp === 'number' 
              ? new Date(item.timestamp) 
              : new Date(item.timestamp)
          })),
          previousYear: data.monthlyData.previousYear.map((item: any) => ({
            ...item,
            timestamp: typeof item.timestamp === 'number' 
              ? new Date(item.timestamp) 
              : new Date(item.timestamp)
          }))
        };
        setMonthlyData(monthlyData);
      } else {
        setMonthlyData(null);
      }

      // If there's trend log register info, set up WebSocket watch
      if (data.trendLog && currentTimeFilter === 'month' && data.trendLog.registerId) {
        console.log('Setting up WebSocket watch for register:', data.trendLog.registerId);
        setupRegisterWatch(data.trendLog.registerId, data.trendLog.analyzerId || 'default');
      } else {
        stopWatchingRegister();
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
      case 'month':
        return d.toLocaleDateString('en-US', { month: 'long' });
      case 'year':
        return d.toLocaleDateString('en-US', { year: 'numeric' });
      default:
        return d.toLocaleDateString('en-US');
    }
  };

  // Get period labels - now returns formatted dates with consumption indicator
  const getPeriodLabels = () => {
    if (currentTimeFilter === 'year' && monthlyData) {
      // For yearly view, return month names
      return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
    
    if (!comparisonData) return ['', ''];
    
    return [
      `${formatDate(comparisonData.previousTimestamp)} Consumption`,
      `${formatDate(comparisonData.currentTimestamp)} Consumption`
    ];
  };

  // Chart options for column chart
  const chartOptions: ApexOptions = currentTimeFilter === 'year' && monthlyData ? ({
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
        distributed: false,
        grouped: true,
        dataLabels: {
          position: 'top'
        }
      } as any
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
        // Safety check for series data
        if (!series || series.length === 0) {
          return '<div class="custom-tooltip">No data available</div>';
        }
        
        // For yearly view, we expect two series
        if (series.length < 2 || !series[0] || !series[1]) {
          // Handle case where we only have one series or incomplete data
          const value = series[0] ? series[0][dataPointIndex] : 0;
          const monthName = w.globals.labels[dataPointIndex];
          
          return '<div class="custom-tooltip">' +
            '<div class="tooltip-header">' + monthName + '</div>' +
            '<div class="tooltip-body">' +
            '<div class="tooltip-row">' +
            '<span>Value: </span>' +
            '<strong>' + formatEnergyValue(value, 1) + '</strong>' +
            '</div>' +
            '</div>' +
            '</div>';
        }
        
        const previousValue = series[0][dataPointIndex] || 0;
        const currentValue = series[1][dataPointIndex] || 0;
        const monthName = w.globals.labels[dataPointIndex];
        
        let percentChange = 0;
        if (previousValue && previousValue !== 0) {
          percentChange = ((currentValue - previousValue) / previousValue) * 100;
        } else if (previousValue === 0 && currentValue > 0) {
          percentChange = 100;
        }
        
        return '<div class="custom-tooltip">' +
          '<div class="tooltip-header">' + monthName + '</div>' +
          '<div class="tooltip-body">' +
          '<div class="tooltip-row">' +
          '<span class="tooltip-marker" style="background-color: #90CAF9"></span>' +
          '<span>' + (monthlyData?.previousYearLabel || 'Previous Year') + ' Consumption: </span>' +
          '<strong>' + formatEnergyValue(previousValue, 1) + '</strong>' +
          '</div>' +
          '<div class="tooltip-row">' +
          '<span class="tooltip-marker" style="background-color: #FFC107"></span>' +
          '<span>' + (monthlyData?.currentYearLabel || 'Current Year') + ' Consumption: </span>' +
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
  } as ApexOptions) : {
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
      name: `${monthlyData.previousYearLabel || 'Previous Year'} Consumption`,
      data: monthlyData.previousYear ? monthlyData.previousYear.map(m => m?.value || 0) : []
    },
    {
      name: `${monthlyData.currentYearLabel || 'Current Year'} Consumption`,
      data: monthlyData.currentYear ? monthlyData.currentYear.map(m => m?.value || 0) : []
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

  // Function to get other widgets' positions for snapping
  const getOtherWidgetPositions = useCallback(() => {
    const allWidgets = document.querySelectorAll('.widget-container');
    type OtherWidget = {
      id: string;
      x: number;
      y: number;
      width: number;
      height: number;
    };
    
    const otherWidgets: Array<OtherWidget> = [];
    
    allWidgets.forEach((el) => {
      const widgetId = el.getAttribute('data-widget-id');
      if (widgetId && widgetId !== id) {
        const rect = el.getBoundingClientRect();
        otherWidgets.push({
          id: widgetId,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height
        });
      }
    });
    
    return otherWidgets;
  }, [id]);

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
      
      // Add snapping logic with helper lines
      const gridSnappedX = Math.round(newPosition.x / GRID_SIZE) * GRID_SIZE;
      const gridSnappedY = Math.round(newPosition.y / GRID_SIZE) * GRID_SIZE;
      
      let snappedPosition = { ...newPosition };
      let newHelperLines = { vertical: undefined as number | undefined, horizontal: undefined as number | undefined };
      
      // Grid snapping
      if (Math.abs(gridSnappedX - newPosition.x) < SNAP_THRESHOLD) {
        snappedPosition.x = gridSnappedX;
        newHelperLines.vertical = gridSnappedX;
      }
      
      if (Math.abs(gridSnappedY - newPosition.y) < SNAP_THRESHOLD) {
        snappedPosition.y = gridSnappedY;
        newHelperLines.horizontal = gridSnappedY;
      }
      
      // Widget-to-widget snapping
      const otherWidgets = getOtherWidgetPositions();
      const isShiftKeyPressed = e.shiftKey;
      
      if (!isShiftKeyPressed) {
        const isMovingDown = newPosition.y > currentPosition.y;
        
        otherWidgets.forEach((otherWidget) => {
          // Horizontal snapping
          if (Math.abs(otherWidget.x - snappedPosition.x) < WIDGET_SNAP_THRESHOLD) {
            snappedPosition.x = otherWidget.x;
            newHelperLines.vertical = otherWidget.x;
          }
          
          // Right edge alignment
          const currentWidgetRight = snappedPosition.x + size.width;
          if (Math.abs(currentWidgetRight - otherWidget.x) < WIDGET_SNAP_THRESHOLD) {
            snappedPosition.x = otherWidget.x - size.width;
            newHelperLines.vertical = otherWidget.x;
          }
          
          // Vertical snapping with reduced threshold when moving down
          const verticalThreshold = WIDGET_SNAP_THRESHOLD * (isMovingDown ? VERTICAL_SNAP_MULTIPLIER : 1);
          
          if (Math.abs(otherWidget.y - snappedPosition.y) < verticalThreshold) {
            snappedPosition.y = otherWidget.y;
            newHelperLines.horizontal = otherWidget.y;
          }
          
          // Bottom edge alignment
          const currentWidgetBottom = snappedPosition.y + size.height;
          if (Math.abs(currentWidgetBottom - otherWidget.y) < verticalThreshold) {
            snappedPosition.y = otherWidget.y - size.height;
            newHelperLines.horizontal = otherWidget.y;
          }
        });
      }
      
      setHelperLines(newHelperLines);
      setCurrentPosition(snappedPosition);
      positionRef.current = snappedPosition;
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
      
      // Add snapping logic for touch events
      const gridSnappedX = Math.round(newPosition.x / GRID_SIZE) * GRID_SIZE;
      const gridSnappedY = Math.round(newPosition.y / GRID_SIZE) * GRID_SIZE;
      
      let snappedPosition = { ...newPosition };
      let newHelperLines = { vertical: undefined as number | undefined, horizontal: undefined as number | undefined };
      
      // Grid snapping
      if (Math.abs(gridSnappedX - newPosition.x) < SNAP_THRESHOLD) {
        snappedPosition.x = gridSnappedX;
        newHelperLines.vertical = gridSnappedX;
      }
      
      if (Math.abs(gridSnappedY - newPosition.y) < SNAP_THRESHOLD) {
        snappedPosition.y = gridSnappedY;
        newHelperLines.horizontal = gridSnappedY;
      }
      
      // Widget-to-widget snapping
      const otherWidgets = getOtherWidgetPositions();
      const isMovingDown = newPosition.y > currentPosition.y;
      
      otherWidgets.forEach((otherWidget) => {
        // Horizontal snapping
        if (Math.abs(otherWidget.x - snappedPosition.x) < WIDGET_SNAP_THRESHOLD) {
          snappedPosition.x = otherWidget.x;
          newHelperLines.vertical = otherWidget.x;
        }
        
        // Right edge alignment
        const currentWidgetRight = snappedPosition.x + size.width;
        if (Math.abs(currentWidgetRight - otherWidget.x) < WIDGET_SNAP_THRESHOLD) {
          snappedPosition.x = otherWidget.x - size.width;
          newHelperLines.vertical = otherWidget.x;
        }
        
        // Vertical snapping with reduced threshold when moving down
        const verticalThreshold = WIDGET_SNAP_THRESHOLD * (isMovingDown ? VERTICAL_SNAP_MULTIPLIER : 1);
        
        if (Math.abs(otherWidget.y - snappedPosition.y) < verticalThreshold) {
          snappedPosition.y = otherWidget.y;
          newHelperLines.horizontal = otherWidget.y;
        }
        
        // Bottom edge alignment
        const currentWidgetBottom = snappedPosition.y + size.height;
        if (Math.abs(currentWidgetBottom - otherWidget.y) < verticalThreshold) {
          snappedPosition.y = otherWidget.y - size.height;
          newHelperLines.horizontal = otherWidget.y;
        }
      });
      
      setHelperLines(newHelperLines);
      setCurrentPosition(snappedPosition);
      positionRef.current = snappedPosition;
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      setIsDragging(false);
      if (onWidgetPositionChange && id) {
        onWidgetPositionChange(id, positionRef.current);
      }
      // Clear helper lines with small delay to let the user see them briefly
      setTimeout(() => setHelperLines({ vertical: undefined, horizontal: undefined }), 300);
    };

    const handleTouchEnd = () => {
      if (!isDragging) return;
      setIsDragging(false);
      if (onWidgetPositionChange && id) {
        onWidgetPositionChange(id, positionRef.current);
      }
      // Clear helper lines with small delay
      setTimeout(() => setHelperLines({ vertical: undefined, horizontal: undefined }), 300);
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
  }, [isDragging, dragStart, id, onWidgetPositionChange, getOtherWidgetPositions, size]);

  // Setup WebSocket watch for the trend log's register
  const setupRegisterWatch = useCallback((registerId: string, analyzerId: string) => {
    // Find the register details by registerId from the API
    fetch(`/api/registers/${registerId}`)
      .then(response => response.json())
      .then(register => {
        if (register && register.data && register.data.address !== undefined) {
          // Watch this register for real-time updates
          const watchConfig = {
            analyzerId: analyzerId || 'default',
            registerId: registerId,
            address: register.data.address,
            dataType: register.data.dataType || 'float',
            scale: register.data.scale || 1,
            byteOrder: register.data.byteOrder || 'AB CD'
          };
          
          // Start watching this register
          const existingKey = watchedRegisterRef.current ? getRegisterKey(watchedRegisterRef.current.config) : null;
          const newKey = getRegisterKey(watchConfig);

          if (existingKey && existingKey !== newKey) {
            stopWatchingRegister();
          }

          watchRegister(watchConfig, liveValueUpdateHandler);
          watchedRegisterRef.current = { config: watchConfig, callback: liveValueUpdateHandler };
        } else {
          console.error('Invalid register data format:', register);
        }
      })
      .catch(err => {
        console.error('Error fetching register details:', err);
      });
  }, [watchRegister, liveValueUpdateHandler, stopWatchingRegister]);
  
  // Cleanup WebSocket subscription when component unmounts
  useEffect(() => {
    const cleanupRegisterId = trendLogId;
    
    return () => {
      // Clean up any WebSocket subscriptions
      if (cleanupRegisterId) {
        console.log('Cleaning up WebSocket subscriptions for:', cleanupRegisterId);
        stopWatchingRegister();
      }
    };
  }, [trendLogId, stopWatchingRegister]);

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
      {/* Helper lines for alignment - similar to RegisterWidget */}
      {helperLines.vertical !== undefined && (
        <div
          className="fixed top-0 h-screen w-[2px] bg-blue-500 pointer-events-none"
          style={{
            left: `${helperLines.vertical}px`,
            zIndex: 9999
          }}
        />
      )}
      {helperLines.horizontal !== undefined && (
        <div
          className="fixed left-0 w-screen h-[2px] bg-blue-500 pointer-events-none"
          style={{
            top: `${helperLines.horizontal}px`,
            zIndex: 9999
          }}
        />
      )}
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
        
        {/* Consumption Display in Header */}
        {comparisonData && comparisonData.currentValue !== null && (
          <div className="flex flex-col items-end text-sm">
            <div className="text-xs text-gray-600 dark:text-gray-400">
              {currentTimeFilter === 'month' ? 'Monthly' : 'Yearly'} Consumption
            </div>
            <div className="text-base font-bold text-blue-600">
              {formatEnergyValue(comparisonData.currentValue, 1)}
            </div>
            {comparisonData.percentageChange !== null && (
              <div className={`text-xs ${comparisonData.percentageChange >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                {comparisonData.percentageChange >= 0 ? '+' : ''}{comparisonData.percentageChange.toFixed(1)}%
              </div>
            )}
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
          <option value="month">Monthly</option>
          <option value="year">Yearly</option>
        </select>
        
        {/* Legend for yearly view */}
        {currentTimeFilter === 'year' && monthlyData && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#90CAF9]"></span>
              <span className="text-sm" style={{ color: appearance?.textColor || '#666' }}>
                {monthlyData.previousYearLabel} Consumption
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#FFC107]"></span>
              <span className="text-sm" style={{ color: appearance?.textColor || '#666' }}>
                {monthlyData.currentYearLabel} Consumption
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