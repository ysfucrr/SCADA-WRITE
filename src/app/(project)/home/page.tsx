"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

// Import Typography components
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import Button from "@/components/ui/button/Button";
import { AddWidgetModal } from "@/components/widgets/AddWidgetModal";
import { EditWidgetModal } from "@/components/widgets/EditWidgetModal";
import { RegisterWidget } from "@/components/widgets/RegisterWidget";
import { showConfirmAlert, showToast } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
// Dynamically import ReactApexChart to avoid SSR issues
const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

// Define system information type
interface SystemInfo {
  mongodb: {
    dbStats: {
      db: string;
      collections: number;
      views: number;
      objects: number;
      dataSize: number;
      storageSize: number;
      indexes: number;
      indexSize: number;
    };
    collectionStats: Array<{
      name: string;
      size: number;
      count: number;
    }>;
  };
  system: {
    totalMemory: string;
    freeMemory: string;
    usedMemory: string;
    memoryUsagePercent: string;
    cpuCount: number;
    cpuModel: string;
    uptime: number;
    platform: string;
    hostname: string;
    diskIOSpeeds: {
      read: number;
      write: number;
    };
  };
}

export default function HomePage() {
  // Tab state
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'system-health'>('overview');
  
  // Check if this is a direct access via URL (from redirect)
  useEffect(() => {
    // Check URL for the redirect parameter
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const fromRedirect = urlParams.get('source') === 'redirect';
      
      if (fromRedirect) {
        setActiveTab('system-health');
        
        // Clean up the URL by removing the parameter (optional)
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  }, []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [widgets, setWidgets] = useState<any[]>([]);
  const [widgetsLoading, setWidgetsLoading] = useState(true);
  const [editingWidget, setEditingWidget] = useState<any | null>(null);
  const [widgetPositions, setWidgetPositions] = useState<Record<string, { x: number, y: number }>>({});
  
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(10); // seconds
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Auth durumunu kontrol etmek için useAuth hook'u
  const { isAdmin } = useAuth();

  useEffect(() => {
    const fetchWidgets = async () => {
      try {
        setWidgetsLoading(true);
        const response = await fetch("/api/widgets");
        if (!response.ok) {
          throw new Error("Failed to fetch widgets");
        }
        const data = await response.json();
        
        // Pozisyon bilgilerini register nesnelerine aktarma
        const processedWidgets = data.map((widget: any) => {
          if (widget.registers && Array.isArray(widget.registers)) {
            const updatedRegisters = widget.registers.map((register: any) => {
              // valuePosition bilgilerini aktarma
              if (widget.valuePositions && widget.valuePositions[register.id]) {
                register.valuePosition = widget.valuePositions[register.id];
              }
              
              // labelPosition bilgilerini aktarma
              if (widget.labelPositions && widget.labelPositions[register.id]) {
                register.labelPosition = widget.labelPositions[register.id];
              }
              
              // valueSize bilgilerini aktarma
              if (widget.valueSizes && widget.valueSizes[register.id]) {
                register.valueSize = widget.valueSizes[register.id];
              }
              
              // labelSize bilgilerini aktarma
              if (widget.labelSizes && widget.labelSizes[register.id]) {
                register.labelSize = widget.labelSizes[register.id];
              }
              
              return register;
            });
            
            return {...widget, registers: updatedRegisters};
          }
          return widget;
        });
        
        setWidgets(processedWidgets);
      } catch (error) {
        console.error(error);
      } finally {
        setWidgetsLoading(false);
      }
    };
    fetchWidgets();
  }, []);

  // Fetch system information with refresh interval
  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/system-info");
        
        if (!response.ok) {
          throw new Error(`Failed to fetch system info: ${response.status}`);
        }
        
        const data = await response.json();
        setSystemInfo(data);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        console.error("Error fetching system info:", err);
        setError("Failed to fetch system information");
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchSystemInfo();

    // Set up interval for refreshing data
    const intervalId = setInterval(fetchSystemInfo, refreshInterval * 1000);

    // Clean up interval on unmount
    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  // Format bytes to human-readable format
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i];
  };

  // Format uptime to human-readable format
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
  };

  // MongoDB collection size chart options
  const collectionSizeChartOptions: ApexOptions = {
    chart: {
      type: "bar",
      height: 350,
      stacked: false,
      toolbar: {
        show: false,
      },
      fontFamily: "Outfit, sans-serif",
      animations: {
        enabled: true,
        speed: 500,
        animateGradually: {
          enabled: true,
          delay: 100
        },
        dynamicAnimation: {
          enabled: true,
          speed: 300
        }
      },
      events: {
        updated: function(chartContext, config) {
          // Flash the background briefly when updated
          const chart = document.getElementById('collections-chart');
          if (chart) {
            chart.classList.add('bg-blue-50');
            setTimeout(() => {
              chart.classList.remove('bg-blue-50');
            }, 300);
          }
        }
      }
    },
    plotOptions: {
      bar: {
        horizontal: false, // Column chart instead of bar
        borderRadius: 4,
        columnWidth: '70%',
        distributed: false,
        dataLabels: {
          position: 'top',
        },
      },
    },
    dataLabels: {
      enabled: true,
      formatter: function (val, opts) {
        // Different formatters based on series
        if (opts.seriesIndex === 0) {
          return formatBytes(typeof val === 'number' ? val * 1024 * 1024 : 0);
        } else {
          return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); // Add commas for thousands
        }
      },
      style: {
        fontSize: '11px',
        fontWeight: 600,
        colors: ["#465FFF", "#00E396"]
      },
      offsetY: -20,
    },
    stroke: {
      width: [0, 0],
      colors: ['#fff']
    },
    xaxis: {
      categories: [],
      title: {
        text: "Collections",
      },
      labels: {
        rotate: -45,
        style: {
          fontSize: '11px'
        }
      }
    },
    yaxis: {
      title: {
        text: "Size (MB) / Document Count"
      },
      labels: {
        formatter: function(val) {
          return val.toFixed(0);
        }
      }
    },
    colors: ["#465FFF", "#00E396"],
    tooltip: {
      shared: true,
      intersect: false,
      y: [
        {
          formatter: function(value) {
            return formatBytes(value * 1024 * 1024);
          }
        },
        {
          formatter: function(value) {
            return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " docs";
          }
        }
      ]
    },
    legend: {
      position: 'top',
      horizontalAlign: 'left',
    },
  };

  // IO speed chart options
  const ioSpeedChartOptions: ApexOptions = {
    chart: {
      type: "area",
      height: 200,
      toolbar: {
        show: false,
      },
      fontFamily: "Outfit, sans-serif",
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      curve: "smooth",
      width: 2,
    },
    xaxis: {
      type: "datetime",
    },
    yaxis: {
      title: {
        text: "MB/s",
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.7,
        opacityTo: 0.3,
      },
    },
    colors: ["#32CD32", "#FF4560"],
    legend: {
      position: "top",
      horizontalAlign: "right",
    },
  };

  // Memory usage chart options
  const memoryChartOptions: ApexOptions = {
    chart: {
      type: "radialBar",
      height: 200,
      fontFamily: "Outfit, sans-serif",
    },
    plotOptions: {
      radialBar: {
        hollow: {
          size: "70%",
        },
        dataLabels: {
          show: true,
          name: {
            show: true,
            fontSize: "14px",
            fontWeight: 600,
            offsetY: -10,
          },
          value: {
            show: true,
            fontSize: "22px",
            fontWeight: 700,
            formatter: function (val) {
              return val + "%";
            },
          },
        },
      },
    },
    labels: ["Memory Usage"],
    colors: ["#465FFF"],
  };

  // Create collections data for chart
  const collectionsData = systemInfo?.mongodb?.collectionStats
    ? [
        {
          name: "Size (MB)",
          data: systemInfo.mongodb.collectionStats.map((col) => parseFloat((col.size).toFixed(2))),
          type: 'bar'
        },
        {
          name: "Documents",
          data: systemInfo.mongodb.collectionStats.map((col) => col.count),
          type: 'bar'
        }
      ]
    : [];

  // Extract collection names for categories
  const collectionNames = systemInfo?.mongodb?.collectionStats
    ? systemInfo.mongodb.collectionStats.map(col => col.name)
    : [];

  // Update the xaxis categories
  if (collectionSizeChartOptions.xaxis) {
    collectionSizeChartOptions.xaxis.categories = collectionNames;
  }

  // Create IO speed data for chart - using historical data
  const [ioSpeedHistory, setIoSpeedHistory] = useState<
    { timestamp: number; read: number; write: number }[]
  >([]);

  useEffect(() => {
    if (systemInfo?.system?.diskIOSpeeds) {
      const { read, write } = systemInfo.system.diskIOSpeeds;
      const newDataPoint = {
        timestamp: Date.now(),
        read,
        write,
      };
      
      setIoSpeedHistory((prev) => {
        // Keep last 10 points
        const updatedHistory = [...prev, newDataPoint].slice(-10);
        return updatedHistory;
      });
    }
  }, [systemInfo]);

  const ioSpeedData = [
    {
      name: "Read Speed",
      data: ioSpeedHistory.map((point) => ({
        x: point.timestamp,
        y: point.read,
      })),
    },
    {
      name: "Write Speed",
      data: ioSpeedHistory.map((point) => ({
        x: point.timestamp,
        y: point.write,
      })),
    },
  ];

  // Memory usage data
  const memoryUsageData = systemInfo?.system
    ? [parseFloat(systemInfo.system.memoryUsagePercent)]
    : [0];

  // Interface for appearance settings
  interface WidgetAppearance {
    fontFamily: string;
    textColor: string;
    backgroundColor: string;
    opacity: number;
  }

  const handleAddWidget = async (
    widgetTitle: string,
    widgetSize: { width: number, height: number },
    appearance: WidgetAppearance
  ) => {
    const widgetData = {
      title: widgetTitle,
      size: widgetSize,
      appearance: appearance,
      registers: [] // Start with an empty array of registers
    };

    try {
        // Add new widget
        const response = await fetch("/api/widgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(widgetData),
        });
        if (!response.ok) throw new Error("Failed to create widget");
        const newWidget = await response.json();
        setWidgets([...widgets, newWidget]);
        showToast("Widget added successfully.", "success");
    } catch (error) {
      console.error(error);
      showToast("An error occurred.", "error");
    }
  };
    
      const handleDeleteWidget = async (widget: any) => {
        const result = await showConfirmAlert(
          "Delete Widget",
          `"${widget.title}" widget will be deleted. Are you sure?`,
          "Delete",
          "Cancel"
        );
    
        if (result.isConfirmed) {
            try {
                const response = await fetch(`/api/widgets/${widget._id}`, {
                  method: "DELETE",
                });
                if (!response.ok) throw new Error("Failed to delete widget");
                setWidgets(widgets.filter(w => w._id !== widget._id));
                showToast("Widget deleted successfully.", "success");
            } catch (error) {
                console.error(error);
                showToast("An error occurred while deleting the widget.", "error");
            }
        }
      };

      const handlePositionsChange = useCallback((widgetId: string, newPositions: { labelPositions: any, valuePositions: any }) => {
        setWidgets(prevWidgets =>
          prevWidgets.map(widget => {
            if (widget._id === widgetId) {
              // Gelen yeni pozisyonları widget'ın register'larına işle
              const updatedRegisters = widget.registers.map((reg: any) => ({
                ...reg,
                labelPosition: newPositions.labelPositions[reg.id] || reg.labelPosition,
                valuePosition: newPositions.valuePositions[reg.id] || reg.valuePosition,
              }));
              return { ...widget, registers: updatedRegisters };
            }
            return widget;
          })
        );
      }, []);

      const handleRegisterDelete = useCallback(async (widgetId: string, registerId: string) => {
        let updatedWidget: any;

        setWidgets(prevWidgets =>
          prevWidgets.map(widget => {
            if (widget._id === widgetId) {
              const updatedRegisters = widget.registers.filter((reg: any) => reg.id !== registerId);
              updatedWidget = { ...widget, registers: updatedRegisters };
              return updatedWidget;
            }
            return widget;
          })
        );
        
        if (updatedWidget) {
            try {
                const response = await fetch(`/api/widgets/${widgetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ registers: updatedWidget.registers }),
                });

                if (!response.ok) {
                    throw new Error('Failed to delete register from widget');
                }
                showToast("Register deleted successfully.", "success");
            } catch (error) {
                console.error(error);
                showToast("An error occurred while deleting the register.", "error");
            }
        }
      }, []);
      
      const handleRegisterAdd = useCallback(async (widgetId: string, newRegister: any) => {
        let updatedWidget: any;
        setWidgets(prevWidgets =>
          prevWidgets.map(widget => {
            if (widget._id === widgetId) {
              // Ensure registers is an array
              const registers = Array.isArray(widget.registers) ? widget.registers : [];
              const updatedRegisters = [...registers, newRegister];
              updatedWidget = { ...widget, registers: updatedRegisters };
              return updatedWidget;
            }
            return widget;
          })
        );
    
        if (updatedWidget) {
            try {
                const response = await fetch(`/api/widgets/${widgetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ registers: updatedWidget.registers }),
                });
    
                if (!response.ok) {
                    throw new Error('Failed to add register to widget');
                }
                showToast("Register added successfully.", "success");
            } catch (error) {
                console.error(error);
                showToast("An error occurred while adding the register.", "error");
            }
        }
      }, []);
    
      const handleRegisterUpdate = useCallback((widgetId: string, registerId: string, updatedRegister: any) => {
        setWidgets(prevWidgets =>
          prevWidgets.map(widget => {
            if (widget._id === widgetId) {
              const updatedRegisters = widget.registers.map((reg: any) =>
                reg.id === registerId ? { ...reg, ...updatedRegister } : reg
              );
              return { ...widget, registers: updatedRegisters };
            }
            return widget;
          })
        );
      }, []);

      // Widget pozisyonlarını güncelleme fonksiyonu
      const handleWidgetPositionChange = useCallback(async (widgetId: string, newPosition: { x: number, y: number }) => {
        // Widget pozisyonlarını yerel state'te güncelle
        setWidgetPositions(prev => ({
          ...prev,
          [widgetId]: newPosition
        }));
        
        // Widget'ları state'te güncelle
        setWidgets(prevWidgets =>
          prevWidgets.map(widget => {
            if (widget._id === widgetId) {
              return { ...widget, position: newPosition };
            }
            return widget;
          })
        );
        
        try {
          // Widget pozisyonunu veritabanına kaydet
          const response = await fetch(`/api/widgets/${widgetId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: newPosition }),
          });
          
          if (!response.ok) {
            throw new Error('Failed to update widget position');
          }
        } catch (error) {
          console.error("Error updating widget position:", error);
        }
      }, []);

      const handleUpdateWidgetDetails = async (
        newName: string,
        newSize: { width: number, height: number },
        appearance: WidgetAppearance
      ) => {
        if (!editingWidget) return;

        const widgetId = editingWidget._id;
        const updatedData = {
          title: newName,
          size: newSize,
          appearance: appearance
        };

        setWidgets(prev => prev.map(w => w._id === widgetId ? { ...w, ...updatedData } : w));

        try {
            const response = await fetch(`/api/widgets/${widgetId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedData),
            });
            if (!response.ok) throw new Error('Failed to update widget details');
            showToast("Widget details updated successfully.", "success");
        } catch (error) {
            console.error("Error updating widget details:", error);
            showToast("An error occurred.", "error");
            // Optionally revert state on error
            setWidgets(prev => prev.map(w => w._id === widgetId ? editingWidget : w));
        }
      };
    
      return (
        <>
        <AddWidgetModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onConfirm={handleAddWidget}
        />
        <EditWidgetModal
            isOpen={!!editingWidget}
            onClose={() => setEditingWidget(null)}
            onConfirm={handleUpdateWidgetDetails}
            widget={editingWidget}
        />
    <div className="w-full p-6">
      {/* Tab navigation - More prominent buttons */}
      <div className="mb-8 flex justify-between items-center">
        <div className="flex">
          <button
            className={`py-4 px-8 mr-4 text-base font-bold transition-colors focus:outline-none rounded-lg shadow-md ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white dark:bg-blue-700'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`py-4 px-8 mr-4 text-base font-bold transition-colors focus:outline-none rounded-lg shadow-md ${
              activeTab === 'system-health'
                ? 'bg-blue-600 text-white dark:bg-blue-700'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('system-health')}
          >
            System Health
          </button>
          
          {/* Add Widget butonu tab butonlarıyla aynı hizada - sadece admin kullanıcılar için */}
          {activeTab === 'overview' && isAdmin && (
            <button
              className="py-4 px-8 text-base font-bold transition-colors focus:outline-none rounded-lg shadow-md bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
              onClick={() => setIsModalOpen(true)}
            >
              Add Widget
            </button>
          )}
        </div>
        
        {/* Sadece System Health tabında gösterilecek refresh bilgisi */}
        {activeTab === 'system-health' && (
          <div className="flex items-center">
            <button
              onClick={() => setRefreshInterval(prevInterval => prevInterval === 5 ? 10 : 5)}
              className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors mr-4"
            >
              Refresh: {refreshInterval}s
            </button>
            {lastUpdated && (
              <SmallText className="text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </SmallText>
            )}
          </div>
        )}
      </div>
      
      {/* Content based on active tab */}
      {activeTab === 'overview' ? (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {widgetsLoading ? (
              <div className="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
                <div className="flex items-center justify-center h-48">
                  <Paragraph className="text-gray-400 text-center">
                    Loading widgets...
                  </Paragraph>
                </div>
              </div>
            ) : widgets.length > 0 ? (
              widgets.map((widget) => {
                // Benzersiz ID kontrolü
                const widgetKey = widget._id || `widget-${Math.random()}`;
                return (
                  <RegisterWidget
                    key={widgetKey}
                    title={widget.title}
                    registers={widget.registers}
                    size={widget.size}
                    id={widget._id}
                    position={widget.position || { x: 0, y: 0 }}
                    appearance={widget.appearance}
                    onDelete={() => handleDeleteWidget(widget)}
                    onPositionsChange={handlePositionsChange}
                    onRegisterDelete={handleRegisterDelete}
                    onRegisterAdd={handleRegisterAdd}
                    onRegisterUpdate={handleRegisterUpdate}
                    onEdit={() => setEditingWidget(widget)}
                    onWidgetPositionChange={handleWidgetPositionChange}
                  />
                );
              })
            ) : (
            <div className="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-6">
              <div className="flex items-center justify-center h-48">
                <Paragraph className="text-gray-400 text-center">
                  No widgets have been added yet. Click "Add Widget" to get started.
                </Paragraph>
              </div>
            </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* System Health Content */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        {/* System overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">System Overview</h3>
          
          {isLoading && !systemInfo ? (
            <div className="h-40 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="h-40 flex items-center justify-center text-red-500">
              {error}
            </div>
          ) : systemInfo ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Platform
                  </SmallText>
                  <Paragraph className="font-medium">
                    {systemInfo.system.platform}
                  </Paragraph>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Hostname
                  </SmallText>
                  <Paragraph className="font-medium">
                    {systemInfo.system.hostname}
                  </Paragraph>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                <SmallText className="text-gray-500 dark:text-gray-400">
                  CPU
                </SmallText>
                <Paragraph className="font-medium">
                  {systemInfo.system.cpuModel} ({systemInfo.system.cpuCount} cores)
                </Paragraph>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                <SmallText className="text-gray-500 dark:text-gray-400">
                  Uptime
                </SmallText>
                <Paragraph className="font-medium">
                  {formatUptime(systemInfo.system.uptime)}
                </Paragraph>
              </div>
            </div>
          ) : null}
        </div>

        {/* Memory Usage */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">Memory Usage</h3>
          {isLoading && !systemInfo ? (
            <div className="h-40 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="h-40 flex items-center justify-center text-red-500">
              {error}
            </div>
          ) : systemInfo ? (
            <>
              <div id="memory-chart">
                <ReactApexChart
                  options={memoryChartOptions}
                  series={memoryUsageData}
                  type="radialBar"
                  height={200}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Total Memory
                  </SmallText>
                  <Paragraph className="font-medium">
                    {systemInfo.system.totalMemory} GB
                  </Paragraph>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Used Memory
                  </SmallText>
                  <Paragraph className="font-medium">
                    {systemInfo.system.usedMemory} GB
                  </Paragraph>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* MongoDB Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">MongoDB Overview</h3>
          {isLoading && !systemInfo ? (
            <div className="h-40 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="h-40 flex items-center justify-center text-red-500">
              {error}
            </div>
          ) : systemInfo?.mongodb ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Database
                  </SmallText>
                  <Paragraph className="font-medium">
                    {systemInfo.mongodb.dbStats.db}
                  </Paragraph>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Collections
                  </SmallText>
                  <Paragraph className="font-medium">
                    {systemInfo.mongodb.dbStats.collections}
                  </Paragraph>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Documents
                  </SmallText>
                  <Paragraph className="font-medium">
                    {systemInfo.mongodb.dbStats.objects.toLocaleString()}
                  </Paragraph>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Data Size
                  </SmallText>
                  <Paragraph className="font-medium">
                    {formatBytes(systemInfo.mongodb.dbStats.dataSize * 1024 * 1024)}
                  </Paragraph>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MongoDB Collections Size */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">MongoDB Collections Size</h3>
          {isLoading && !systemInfo ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="h-80 flex items-center justify-center text-red-500">
              {error}
            </div>
          ) : systemInfo?.mongodb ? (
            <>
              <div id="collections-chart" className="transition-colors duration-300">
                <ReactApexChart
                  options={collectionSizeChartOptions}
                  series={collectionsData}
                  type="bar"
                  height={350}
                />
              </div>
              <div className="mt-4 text-sm">
                <p className="text-gray-500">
                  {systemInfo.mongodb.collectionStats.length === 0 ? (
                    "No collection data found yet."
                  ) : (
                    <>
                      Showing {systemInfo.mongodb.collectionStats.length} collections.
                      <span className="text-blue-500 ml-1">Refreshes every {refreshInterval} seconds.</span>
                      <br />
                      <span className="text-xs mt-1 text-gray-400">
                        Blue columns show collection size (MB), green columns show document count
                      </span>
                    </>
                  )}
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* Disk I/O Speeds */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">Disk I/O Speeds</h3>
          {isLoading && !systemInfo ? (
            <div className="h-80 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : error ? (
            <div className="h-80 flex items-center justify-center text-red-500">
              {error}
            </div>
          ) : ioSpeedHistory.length > 0 ? (
            <>
              <div id="io-speed-chart">
                <ReactApexChart
                  options={ioSpeedChartOptions}
                  series={ioSpeedData}
                  type="area"
                  height={350}
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Current Read Speed
                  </SmallText>
                  <Paragraph className="font-medium text-green-500">
                    {systemInfo?.system?.diskIOSpeeds.read} MB/s
                  </Paragraph>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <SmallText className="text-gray-500 dark:text-gray-400">
                    Current Write Speed
                  </SmallText>
                  <Paragraph className="font-medium text-red-500">
                    {systemInfo?.system?.diskIOSpeeds.write} MB/s
                  </Paragraph>
                </div>
              </div>
            </>
          ) : (
            <div className="h-80 flex items-center justify-center text-gray-500">
              Collecting I/O data...
            </div>
          )}
        </div>
          </div>
        </>
      )}
    </div>
    </>
  );
}