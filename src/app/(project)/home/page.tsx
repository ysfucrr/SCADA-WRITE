"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

// Import Typography components
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import Button from "@/components/ui/button/Button";
import { AddWidgetModal } from "@/components/widgets/AddWidgetModal";
import { RegisterWidget } from "@/components/widgets/RegisterWidget";
import { showConfirmAlert, showToast } from "@/components/ui/alert";
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
  const [activeTab, setActiveTab] = useState<'overview' | 'system-health'>('overview');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [widgets, setWidgets] = useState<any[]>([]);
  const [widgetToEdit, setWidgetToEdit] = useState<any | null>(null);
  
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(10); // seconds
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchWidgets = async () => {
      try {
        const response = await fetch("/api/widgets");
        if (!response.ok) {
          throw new Error("Failed to fetch widgets");
        }
        const data = await response.json();
        setWidgets(data);
      } catch (error) {
        console.error(error);
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

  const handleAddWidget = async (widgetTitle: string, selectedRegisters: any[]) => {
    const widgetData = {
      title: widgetTitle,
      registers: selectedRegisters.map((r) => ({
        id: r.selectedRegister.value,
        label: r.customLabel || r.selectedRegister.label.split("(")[0].trim(),
        analyzerId: r.selectedRegister.analyzerId,
        address: r.selectedRegister.address,
        dataType: r.selectedRegister.dataType,
        bit: r.selectedRegister.bit,
      })),
    };

    try {
      if (widgetToEdit) {
        // Update existing widget
        const response = await fetch(`/api/widgets/${widgetToEdit._id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(widgetData),
        });
        if (!response.ok) throw new Error("Failed to update widget");
        setWidgets(widgets.map(w => w._id === widgetToEdit._id ? { ...w, ...widgetData } : w));
        showToast("Widget updated successfully.", "success");
      } else {
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
      }
    } catch (error) {
      console.error(error);
      showToast("An error occurred.", "error");
    } finally {
        setWidgetToEdit(null);
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
    
      return (
        <>
        <AddWidgetModal
            isOpen={isModalOpen || !!widgetToEdit}
            widgetToEdit={widgetToEdit}
            onClose={() => {
                setIsModalOpen(false)
                setWidgetToEdit(null)
            }}
            onConfirm={handleAddWidget}
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
            className={`py-4 px-8 text-base font-bold transition-colors focus:outline-none rounded-lg shadow-md ${
              activeTab === 'system-health'
                ? 'bg-blue-600 text-white dark:bg-blue-700'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
            onClick={() => setActiveTab('system-health')}
          >
            System Health
          </button>
        </div>
        
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
      </div>
      
      {/* Content based on active tab */}
      {activeTab === 'overview' ? (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setIsModalOpen(true)}>
              Add Widget
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {widgets.map((widget) => (
              <RegisterWidget
                key={widget._id}
                title={widget.title}
                registers={widget.registers}
                onEdit={() => setWidgetToEdit(widget)}
                onDelete={() => handleDeleteWidget(widget)}
              />
            ))}
          </div>
          {widgets.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-6">
              <div className="flex items-center justify-center h-48">
                <Paragraph className="text-gray-400 text-center">
                  No widgets added yet. Click "Add Widget" to get started.
                </Paragraph>
              </div>
            </div>
          )}
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