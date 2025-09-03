"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useWebSocket } from '@/context/WebSocketContext';
import { ApexOptions } from 'apexcharts';

// ApexCharts'ı dinamik olarak yükle (SSR sorunlarını önlemek için)
const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface RegisterGraphComponentProps {
  registerId: string;
  registerName: string;
  analyzerId: string | number;
  address: number;
  dataType: string;
  scale: number;
  byteOrder?: string;
  bit?: number;
  width?: number;
  height?: number;
  maxDataPoints?: number;
  showToolbar?: boolean;
  theme?: 'light' | 'dark';
}

interface DataPoint {
  x: number; // timestamp
  y: number; // value
}

const RegisterGraphComponent: React.FC<RegisterGraphComponentProps> = ({
  registerId,
  registerName,
  analyzerId,
  address,
  dataType,
  scale,
  byteOrder,
  bit,
  width = 300,
  height = 200,
  maxDataPoints = 50,
  showToolbar = false,
  theme = 'dark'
}) => {
  const [data, setData] = useState<DataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastValue, setLastValue] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { watchRegister, unwatchRegister, isConnected } = useWebSocket();

  // Register değerini işleme fonksiyonu
  const handleRegisterValue = useCallback((registerValue: string | number | boolean | null | undefined) => {
    if (registerValue !== null && registerValue !== undefined) {
      let numericValue: number;
      
      if (dataType === 'boolean') {
        numericValue = (registerValue === 1 || registerValue === true) ? 1 : 0;
      } else if (typeof registerValue === 'number') {
        numericValue = registerValue;
      } else {
        numericValue = parseFloat(String(registerValue)) || 0;
      }

      // Sadece değer değiştiğinde grafiği güncelle
      if (lastValue === null || Math.abs(numericValue - lastValue) > 0.001) {
        // Zaman bilgisi artık tooltip içinde gösterilecek
        
        const newDataPoint: DataPoint = {
          x: Date.now(),
          y: numericValue
        };

        setData(prevData => {
          // Aynı Y değerinde tekrar eden noktaları filtrele
          const lastYValue = prevData.length > 0 ? prevData[prevData.length - 1].y : null;
          const secondLastYValue = prevData.length > 1 ? prevData[prevData.length - 2].y : null;
          
          // Önceki iki değer aynı ise ve yeni değer de aynı ise, son değeri güncelle
          if (prevData.length >= 2 && 
              lastYValue === secondLastYValue && 
              lastYValue === numericValue) {
            const filteredData = [...prevData];
            filteredData[filteredData.length - 1] = newDataPoint;
            return filteredData;
          } else {
            const newData = [...prevData, newDataPoint];
            // Maksimum veri noktası sayısını aşarsa eski verileri sil
            if (newData.length > maxDataPoints) {
              return newData.slice(-maxDataPoints);
            }
            return newData;
          }
        });
        
        // X ekseni kategorileri artık kullanılmayacak çünkü datetime formatına dönüyoruz
        // Kategori listesini güncellemeye gerek yok
        
        setLastValue(numericValue);
      }
      
      setIsLoading(false);
      setError(null);
    }
  }, [dataType, maxDataPoints, lastValue]);

  // Container boyutunu izle ve grafiği yeniden render et
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // ResizeObserver sadece container değişikliklerini takip eder
      // ApexCharts otomatik olarak yeniden boyutlandırılacak
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // WebSocket ile register izlemeyi başlat
  useEffect(() => {
    if (!isConnected) {
      setIsLoading(true);
      setError('WebSocket bağlantısı yok');
      return;
    }

    setIsLoading(true);
    setError(null);

    // Register izlemeyi başlat
    const register = {
      analyzerId: analyzerId,
      address,
      dataType,
      scale,
      byteOrder,
      bit
    };

    watchRegister(register, handleRegisterValue);

    // Component unmount olduğunda izlemeyi durdur
    return () => {
      unwatchRegister(register, handleRegisterValue);
    };
  }, [address, dataType, scale, byteOrder, bit, analyzerId, isConnected, watchRegister, unwatchRegister, handleRegisterValue]);

  // ApexCharts seçenekleri
  const chartOptions: ApexOptions = {
    chart: {
      type: 'line',
      height: height,
      fontFamily: 'inherit',
      width: '100%',
      zoom: {
        enabled: false
      },
      toolbar: {
        show: showToolbar
      },
      background: 'transparent',
      parentHeightOffset: 0,
      offsetY: 0,
      offsetX: 0
    },
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'straight',
      width: 6,
      lineCap: 'round'
    },
    title: {
      text: '',
      align: 'left',
      style: {
        fontSize: '0px' // Görünmez yap
      },
      margin: 0
    },
    grid: {
      show: true,
      borderColor: theme === 'dark' ? '#D1D5DB' : '#1F2937',
      strokeDashArray: 1,
      position: 'back',
      xaxis: {
        lines: {
          show: true
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      },
      row: {
        colors: undefined,
        opacity: 0
      },
      column: {
        colors: undefined,
        opacity: 0
      },
      padding: {
        top: 10,
        right: 10,
        bottom: 10,
        left: 90
      }
    },
    xaxis: {
      type: 'datetime',
      labels: {
        show: false
      },
      axisBorder: {
        show: true,
        color: theme === 'dark' ? '#FFFFFF' : '#000000'
      },
      axisTicks: {
        show: true,
        color: theme === 'dark' ? '#FFFFFF' : '#000000'
      }
    },
    yaxis: {
      tickAmount: 5,
      decimalsInFloat: 2,
      labels: {
        offsetX: 70,
        style: {
          colors: theme === 'dark' ? '#FFFFFF' : '#000000',
          fontSize: '28px',
          fontWeight: 900,
          cssClass: 'apexcharts-yaxis-label-bold'
        },
        formatter: (value: any) => {
          return typeof value === 'number' ? value.toFixed(2) : value;
        }
      },
      axisBorder: {
        show: true,
        color: theme === 'dark' ? '#FFFFFF' : '#000000'
      },
      axisTicks: {
        show: true,
        color: theme === 'dark' ? '#FFFFFF' : '#000000'
      }
    },
    tooltip: {
      theme: theme,
      custom: function({series, seriesIndex, dataPointIndex, w}) {
        const value = series[seriesIndex][dataPointIndex];
        const date = new Date(data[dataPointIndex]?.x || Date.now());
        const timeStr = date.toLocaleTimeString('tr-TR', { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });
        
        // Tema renklerini ayarla
        const bgColor = theme === 'dark' ? '#374151' : '#FFFFFF';
        const textColor = theme === 'dark' ? '#F9FAFB' : '#111827';
        const borderColor = theme === 'dark' ? '#4B5563' : '#E5E7EB';
        
        return `
          <div class="custom-tooltip" style="
            background: ${bgColor}; 
            color: ${textColor}; 
            padding: 8px; 
            border: 1px solid ${borderColor}; 
            border-radius: 4px;
            font-size: 18px;
            font-weight: bold;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
            <div>${timeStr}</div>
            <div>
              <span style="color: #3B82F6; margin-right: 5px;">●</span>
              ${registerName}: ${typeof value === 'number' ? value.toFixed(2) : value}
            </div>
          </div>
        `;
      }
    },
    colors: ['#3B82F6'], // Mavi çizgi rengi
    markers: {
      size: 8,
      colors: ['#3B82F6'],
      strokeColors: '#ffffff',
      strokeWidth: 3,
      hover: {
        size: 12,
      },
      discrete: [{
        seriesIndex: 0,
        dataPointIndex: 0,
        fillColor: '#3B82F6',
        strokeColor: '#fff',
        size: 8,
        shape: "circle" // circle, square, rect etc  
      }]
    },
    legend: {
      show: false
    }
  };

  // Chart data format
  const chartSeries = [{
    name: registerName,
    data: data // Tam data objesi (x ve y değerlerini içeren)
  }];

  if (isLoading && data.length === 0) {
    return (
      <div 
        ref={containerRef}
        className="flex items-center justify-center bg-gray-900 text-white rounded w-full h-full"
        style={{ minWidth: width, minHeight: height }}
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400 mx-auto mb-2"></div>
          <div className="text-sm">Grafik yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div 
        ref={containerRef}
        className="flex items-center justify-center bg-red-900 text-red-200 rounded w-full h-full"
        style={{ minWidth: width, minHeight: height }}
      >
        <div className="text-center">
          <div className="text-sm">Hata: {error}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Global style to force ApexCharts to respect container dimensions */}
      <style jsx global>{`
        #chart-${registerId} {
          width: 100% !important;
          height: 100% !important;
        }
        
        #chart-${registerId} .apexcharts-canvas {
          width: 100% !important;
          height: 100% !important;
        }
        
        #chart-${registerId} .apexcharts-canvas svg {
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
      
      {/* Main container with responsive size */}
      <div 
        ref={containerRef}
        id={`chart-${registerId}`}
        className="w-full h-full"
        style={{ 
          minWidth: width,
          minHeight: height,
          position: 'relative'
        }}
      >
        <ReactApexChart
          options={chartOptions}
          series={chartSeries}
          type="line"
          width="100%"
          height="100%"
        />
      </div>
    </>
  );
};

export default RegisterGraphComponent;
