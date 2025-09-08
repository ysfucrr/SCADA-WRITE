"use client";
import { useEffect, useState } from "react";

export default function AppWorkingPage() {
  const [localIpAddress, setLocalIpAddress] = useState("");

  useEffect(() => {
    fetch("/api/ip-address")
      .then((res) => res.json())
      .then((data) => {
        setLocalIpAddress(data.ip);
      });
  }, []);

  const handleLinkClick = () => {
    if (window.electron && localIpAddress) {
      window.electron.openExternal(`http://${localIpAddress}:3000`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 text-center">
      <div className="p-10 bg-white rounded-lg shadow-lg">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          SCADA Multicore is Running
        </h1>
        <p className="text-lg text-gray-600 mb-6">
          You can now access the interface using your browser.
        </p>
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
  );
}