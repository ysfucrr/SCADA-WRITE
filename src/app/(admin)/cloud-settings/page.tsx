"use client";
import React, { useState, useEffect } from "react";
import { Typography } from "@/components/ui/typography";
import { showToast, showErrorAlert, showSuccessAlert } from "@/components/ui/alert";
import axios from "axios";

interface CloudSettings {
  serverIp: string;
  httpPort: number;
  wsPort: number;
}

const CloudSettingsPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [settings, setSettings] = useState<CloudSettings>({
    serverIp: "",
    httpPort: 4000,
    wsPort: 4001,
  });

  // Load existing settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const response = await axios.get("/api/cloud-settings");
        if (response.data.success && response.data.settings) {
          setSettings(response.data.settings);
        }
      } catch (error) {
        console.error("Error fetching cloud settings:", error);
        showErrorAlert(
          "Error",
          "Failed to load cloud settings"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Convert port values to numbers
    if (name === "httpPort" || name === "wsPort") {
      const numValue = parseInt(value);
      setSettings({
        ...settings,
        [name]: isNaN(numValue) ? 0 : numValue,
      });
    } else {
      setSettings({
        ...settings,
        [name]: value,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate settings
    if (!settings.serverIp) {
      showErrorAlert(
        "Validation Error",
        "Server IP is required"
      );
      return;
    }

    if (!settings.httpPort || settings.httpPort < 1 || settings.httpPort > 65535) {
      showErrorAlert(
        "Validation Error",
        "HTTP Port must be between 1 and 65535"
      );
      return;
    }

    if (!settings.wsPort || settings.wsPort < 1 || settings.wsPort > 65535) {
      showErrorAlert(
        "Validation Error",
        "WebSocket Port must be between 1 and 65535"
      );
      return;
    }

    try {
      setIsLoading(true);
      const response = await axios.post("/api/cloud-settings", settings);
      
      if (response.data.success) {
        showSuccessAlert(
          "Success",
          "Cloud settings saved successfully"
        );
      } else {
        showErrorAlert(
          "Error",
          response.data.message || "Failed to save settings"
        );
      }
    } catch (error) {
      console.error("Error saving cloud settings:", error);
      showErrorAlert(
        "Error",
        "Failed to save cloud settings"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const testHttpConnection = async () => {
    try {
      setIsTesting(true);
      
      const response = await axios.post("/api/cloud-settings/test", settings);
      
      if (response.data.httpSuccess) {
        showSuccessAlert(
          "Success",
          "HTTP connection successful"
        );
      } else {
        showErrorAlert(
          "Error",
          "HTTP connection failed. Check your settings and ensure the cloud bridge is running."
        );
      }
      
      return response.data.httpSuccess;
    } catch (error) {
      console.error("Error testing connection:", error);
      showErrorAlert(
        "Error",
        "Failed to test connection"
      );
      return false;
    } finally {
      setIsTesting(false);
    }
  };

  const testWsConnection = () => {
    try {
      const ws = new WebSocket(`ws://${settings.serverIp}:${settings.wsPort}`);
      
      ws.onopen = () => {
        showSuccessAlert(
          "Success",
          "WebSocket connection successful"
        );
        ws.close();
      };
      
      ws.onerror = () => {
        showErrorAlert(
          "Error",
          "WebSocket connection failed. Check your settings and ensure the cloud bridge is running."
        );
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
      showErrorAlert(
        "Error",
        "Failed to establish WebSocket connection"
      );
    }
  };

  const handleTestConnection = async () => {
    // First test HTTP connection
    const httpSuccess = await testHttpConnection();
    
    // If HTTP successful, test WebSocket connection
    if (httpSuccess) {
      testWsConnection();
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Typography variant="h1">Cloud Bridge Settings</Typography>
      <Typography variant="p" className="mt-2 mb-6">
        Configure the connection to the Cloud Bridge server for remote access
      </Typography>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="serverIp" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Server IP or Hostname
            </label>
            <input
              type="text"
              id="serverIp"
              name="serverIp"
              value={settings.serverIp}
              onChange={handleInputChange}
              className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600"
              placeholder="e.g., 192.168.1.100 or example.com"
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label htmlFor="httpPort" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                HTTP Port
              </label>
              <input
                type="number"
                id="httpPort"
                name="httpPort"
                value={settings.httpPort}
                onChange={handleInputChange}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600"
                min="1"
                max="65535"
                placeholder="4000"
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="wsPort" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                WebSocket Port
              </label>
              <input
                type="number"
                id="wsPort"
                name="wsPort"
                value={settings.wsPort}
                onChange={handleInputChange}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600"
                min="1"
                max="65535"
                placeholder="4001"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 sm:justify-between">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isLoading || isTesting || !settings.serverIp}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isTesting ? "Testing Connection..." : "Test Connection"}
            </button>
            
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              {isLoading ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <Typography variant="h2">About Cloud Bridge</Typography>
        <Typography variant="p" className="mt-2">
          The Cloud Bridge enables secure remote access to your SCADA system without port forwarding.
          It consists of two components:
        </Typography>
        
        <ul className="mt-4 list-disc pl-6 space-y-2">
          <li className="text-gray-700 dark:text-gray-300">
            <strong>Cloud Bridge Server</strong> - A server that runs in the cloud and acts as a bridge between mobile apps and SCADA systems
          </li>
          <li className="text-gray-700 dark:text-gray-300">
            <strong>Agent Service</strong> - A client that runs on the SCADA machine and connects to the Cloud Bridge
          </li>
        </ul>
        
        <Typography variant="p" className="mt-4">
          To use this feature, you need to deploy the Cloud Bridge server on a publicly accessible server
          and run the Agent Service on your SCADA machine.
        </Typography>
      </div>
    </div>
  );
};

export default CloudSettingsPage;