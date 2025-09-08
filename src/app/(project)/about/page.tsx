"use client";

import React from "react";
import { Typography } from "@/components/ui/typography";
import { GhostButton as Button } from "@/components/ui/button/CustomButton";
import { useSidebar } from "@/context/SidebarContext";
import { useRouter } from "next/navigation";
import { Info, FileText, ChevronRight } from "lucide-react";

const AboutPage: React.FC = () => {
  const { license } = useSidebar();
  const router = useRouter();
  const softwareVersion = "2.3.0"; // Example version

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-4 md:p-6">
      <div className="flex items-center gap-4">
        <Info className="w-10 h-10 text-blue-600 dark:text-blue-400" />
        <div>
          <Typography variant="h2" className="text-gray-900 dark:text-white">
            About This Software
          </Typography>
          <Typography variant="p" className="text-gray-500 dark:text-gray-400">
            Version {softwareVersion}
          </Typography>
        </div>
      </div>

      {/* Software Information Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border dark:border-gray-700">
        <div className="p-6">
          <Typography variant="h5" className="text-gray-900 dark:text-white">
            SCADA Central Monitoring
          </Typography>
          <Typography variant="p" className="mt-2 text-gray-600 dark:text-gray-300">
            This application provides a centralized interface for monitoring and managing
            your SCADA systems. Track devices, analyze trends, and manage alerts efficiently.
          </Typography>
        </div>
      </div>

      {/* License Information Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border dark:border-gray-700">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-gray-700 dark:text-gray-300" />
            <Typography variant="h5" className="text-gray-900 dark:text-white">
              License Details
            </Typography>
          </div>
          {license ? (
            <div className="mt-4 space-y-3 pl-9">
              <div className="flex justify-between items-center">
                <Typography variant="p" className="text-gray-600 dark:text-gray-400">
                  Maximum Devices
                </Typography>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{license.maxDevices}</span>
              </div>
              <div className="flex justify-between items-center">
                <Typography variant="p" className="text-gray-600 dark:text-gray-400">
                  Currently Used Devices
                </Typography>
                <span className="font-semibold text-gray-800 dark:text-gray-200">{license.usedAnalyzers}</span>
              </div>
            </div>
          ) : (
            <Typography variant="p" className="mt-4 pl-9 text-gray-500 dark:text-gray-400">
              Loading license information...
            </Typography>
          )}
          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => router.push('/update-license')}
              className="flex items-center gap-2"
            >
              <span>Update License</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;