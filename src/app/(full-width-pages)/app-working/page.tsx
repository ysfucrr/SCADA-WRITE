"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ApexOptions } from "apexcharts";

// Import Typography components
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";

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

export default function AppWorkingPage() {
  const [localIpAddress, setLocalIpAddress] = useState("");
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(10); // seconds
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch IP address
  useEffect(() => {
    fetch("/api/ip-address")
      .then((res) => res.json())
      .then((data) => {
        setLocalIpAddress(data.ip);
      })
      .catch((err) => {
        setError("Failed to fetch IP address");
        console.error("IP address fetch error:", err);
      });
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

  // Handle browser link click
  const handleLinkClick = () => {
    if (window.electron && localIpAddress) {
      window.electron.openExternal(`http://${localIpAddress}:3000`);
    }
  };

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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-white/90">
      {/* Header with app status */}
      <div className="bg-white dark:bg-gray-800 shadow-sm py-6 px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <Heading3 className="text-gray-800 dark:text-white/90">
                SCADA Multicore is Running
              </Heading3>
              <Paragraph className="text-gray-600 dark:text-gray-400 mt-1">
                System is operational and ready to use
              </Paragraph>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center space-x-2">
                <div className="h-3 w-3 rounded-full bg-green-500"></div>
                <span className="text-sm font-medium">Online</span>
              </div>
              {lastUpdated && (
                <SmallText className="text-gray-500 dark:text-gray-400 mt-1">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </SmallText>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Status message */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="mb-4 md:mb-0">
              <Heading3 className="text-xl font-bold mb-2">
                Welcome to SCADA Multicore
              </Heading3>
              <Paragraph>
                You can now access the interface using your browser
              </Paragraph>
            </div>
            {localIpAddress ? (
              <div
                onClick={handleLinkClick}
                className="inline-block px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors"
              >
                Open in Browser: http://{localIpAddress}:3000
              </div>
            ) : (
              <div className="px-6 py-3 text-lg font-semibold text-gray-500 bg-gray-200 rounded-lg">
                Getting IP address...
              </div>
            )}
          </div>
        </div>

        {/* System information */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          {/* System overview */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">System Overview</h3>
              <button 
                onClick={() => setRefreshInterval(prevInterval => prevInterval === 5 ? 10 : 5)}
                className="text-sm px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Refresh: {refreshInterval}s
              </button>
            </div>
            
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
      </div>
    </div>
  );
}