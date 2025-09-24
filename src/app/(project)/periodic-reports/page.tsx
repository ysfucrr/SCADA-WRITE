"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { showAlert, showConfirmAlert, showErrorAlert, showToast } from "@/components/ui/alert";
import { Button } from "@/components/ui/button/CustomButton";
import IconButton from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import { useAuth } from "@/hooks/use-auth";
import { Calendar, ChartLine, Download, Eye, FileText, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PeriodicReportForm from "@/components/PeriodicReports/PeriodicReportForm";
// Types
interface PeriodicReportType {
  _id: string;
  name: string;
  description: string;
  frequency: string; // daily, weekly, monthly
  schedule: {
    dayOfWeek?: number; // 0-6 (Sunday-Saturday) for weekly
    dayOfMonth?: number; // 1-31 for monthly
    hour: number; // 0-23
    minute: number; // 0-59
  };
  format: 'html' | 'pdf';
  last24HoursOnly?: boolean;
  // Recipients now managed through centralized mail settings
  trendLogIds: string[];
  trendLogs?: any[]; // Populated data
  createdAt: string;
  updatedAt: string;
}

export default function PeriodicReportsPage() {
  const [periodicReports, setPeriodicReports] = useState<PeriodicReportType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<PeriodicReportType | undefined>(undefined);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  const [trendLogs, setTrendLogs] = useState<any[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [previewData, setPreviewData] = useState<{
    subject: string;
    html: string;
    recipients: string[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Fetch trend logs to use in report configuration
  const fetchTrendLogs = async () => {
    try {
      const response = await fetch("/api/trend-logs");
      
      if (!response.ok) {
        throw new Error("Error fetching trend logs");
      }

      // Önce tüm trend logları alalım
      const data = await response.json();
      
      // Analyzer ve register bilgilerini eklemek için gerekli verileri alalım
      const analyzersResponse = await fetch("/api/analyzers");
      if (!analyzersResponse.ok) {
        throw new Error("Error fetching analyzers");
      }
      const analyzers = await analyzersResponse.json();
      
      // Zenginleştirilmiş trend log verilerini oluşturalım
      const enrichedTrendLogs = data.map((log: any) => {
        // Analyzer bilgilerini ekleyelim
        const analyzer = analyzers.find((a: any) => a._id === log.analyzerId);
        
        return {
          ...log,
          analyzerName: analyzer ? analyzer.name : "Unknown Analyzer",
          analyzerSlaveId: analyzer ? analyzer.slaveId : "N/A",
          registerName: log.registerId.split('-').pop() || log.registerId, // register ID'den son parçayı alıp anlamlı bir isim oluşturalım
          displayName: analyzer ?
            `${analyzer.name} (Slave: ${analyzer.slaveId})` :
            `${log.analyzerId}`
        };
      });
      
      setTrendLogs(enrichedTrendLogs);
      return enrichedTrendLogs;
    } catch (error) {
      console.error("Error fetching trend logs:", error);
      showToast("Error fetching trend logs", "error");
    }
  };

  // Fetch periodic reports
  const fetchPeriodicReports = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/periodic-reports");
      
      if (!response.ok) {
        throw new Error("Error fetching periodic reports");
      }

      const data = await response.json();
      
      // Populate trend log details for each report
      for (let report of data) {
        if (report.trendLogIds && report.trendLogIds.length > 0) {
          report.trendLogs = report.trendLogIds.map((id: string) => 
            trendLogs.find(log => log._id === id)
          ).filter(Boolean);
        }
      }
      
      setPeriodicReports(data);
    } catch (error) {
      console.error("Error fetching periodic reports:", error);
      showToast("Error fetching periodic reports", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize data
  const fetchData = async () => {
    const logs = await fetchTrendLogs();
    if (logs) {
      await fetchPeriodicReports();
    }
  };

  useEffect(() => {
    // Admin her zaman erişebilir, normal kullanıcılar sadece periodicReports izni varsa
    if (!isAuthLoading && isAdmin) {
      fetchData();
    } else if (!isAuthLoading && user?.permissions?.periodicReports) {
      fetchData();
    }
  }, [isAuthLoading, isAdmin, user]);

  // Open add report modal
  const openAddModal = () => {
    setSelectedReport(undefined);
    setIsAddModalOpen(true);
  };

  // Add new periodic report
  const handleAddReport = async (reportData: any) => {
    try {
      const response = await fetch("/api/periodic-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reportData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Periodic report could not be added");
      }

      showToast("Periodic report added successfully");
      setIsAddModalOpen(false);
      fetchPeriodicReports();
    } catch (error: any) {
      showToast(error.message || "Periodic report could not be added", "error");
    }
  };

  // Open edit report modal
  const openEditModal = (report: PeriodicReportType) => {
    setSelectedReport(report);
    setIsEditModalOpen(true);
  };

  // Edit periodic report
  const handleEditReport = async (reportData: any) => {
    if (!selectedReport) return;

    try {
      const response = await fetch(`/api/periodic-reports/${selectedReport._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reportData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Periodic report could not be updated");
      }

      showToast("Periodic report updated successfully");
      setIsEditModalOpen(false);
      fetchPeriodicReports();
    } catch (error: any) {
      showToast(error.message || "Periodic report could not be updated", "error");
    }
  };

  // Delete periodic report
  const handleDeleteReport = async (report: PeriodicReportType) => {
    const result = await showConfirmAlert(
      "Delete Periodic Report",
      "This periodic report will be deleted. Are you sure?",
      "Yes",
      "Cancel"
    );

    if (result.isConfirmed) {
      setDeleting(true);
      try {
        const response = await fetch(`/api/periodic-reports/${report._id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Periodic report could not be deleted");
        }

        showToast("Periodic report deleted successfully");
        fetchPeriodicReports();
      } catch (error: any) {
        showErrorAlert(error.message || "Periodic report could not be deleted");
      } finally {
        setDeleting(false);
      }
    }
  };

  // Generate and download report manually
  const generateReport = async (report: PeriodicReportType) => {
    try {
      showToast("Generating report, please wait...");
      const response = await fetch(`/api/periodic-reports/${report._id}/generate`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Could not generate report");
      }

      showToast("Report generated and sent successfully");
    } catch (error: any) {
      showToast(error.message || "Could not generate report", "error");
    }
  };

  // Preview report
  const previewReport = async (report: PeriodicReportType) => {
    try {
      setSelectedReport(report);
      setIsPreviewModalOpen(true);
      setPreviewLoading(true);
      setPreviewData(null);
      
      const response = await fetch(`/api/periodic-reports/${report._id}/preview`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Could not preview report");
      }
      
      const data = await response.json();
      setPreviewData(data.preview);
    } catch (error: any) {
      showToast(error.message || "Could not preview report", "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Format frequency for display
  const formatFrequency = (report: PeriodicReportType) => {
    const { frequency, schedule } = report;
    
    if (frequency === 'daily') {
      return `Daily at ${schedule.hour}:${schedule.minute.toString().padStart(2, '0')}`;
    } else if (frequency === 'weekly') {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = days[schedule.dayOfWeek || 0];
      return `Weekly on ${day} at ${schedule.hour}:${schedule.minute.toString().padStart(2, '0')}`;
    } else if (frequency === 'monthly') {
      return `Monthly on day ${schedule.dayOfMonth} at ${schedule.hour}:${schedule.minute.toString().padStart(2, '0')}`;
    }
    
    return frequency;
  };

  // Loading state
  if (isAuthLoading) {
    return <Spinner variant="bars" fullPage />;
  }

  const router = useRouter();


  if (!isAuthLoading && !isAdmin && !user?.permissions?.periodicReports) {
    router.replace("/billing");
    return <Spinner variant="bars" fullPage />;
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Periodic Reports" />

      <div className="flex justify-between items-center mb-6">
        {/* "Add Periodic Report" butonunu sadece admin kullanıcılar görebilir */}
        {isAdmin && (
          <Button
            onClick={openAddModal}
            leftIcon={<PlusCircle size={16} />}
            variant="primary"
          >
            Add Periodic Report
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner variant="bars" fullPage />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 dark:bg-black/50">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left">
                    <SmallText className="font-bold uppercase tracking-wider">Name</SmallText>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left hidden md:table-cell">
                    <SmallText className="font-bold uppercase tracking-wider">Frequency</SmallText>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left hidden lg:table-cell">
                    <SmallText className="font-bold uppercase tracking-wider">Format</SmallText>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-right">
                    <SmallText className="font-bold uppercase tracking-wider">Actions</SmallText>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {periodicReports.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 sm:px-6 py-4 text-center">
                      <SmallText className="text-gray-500 dark:text-gray-400">No periodic reports found</SmallText>
                    </td>
                  </tr>
                ) : (
                  periodicReports.map((report) => (
                    <tr key={report._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="font-medium text-gray-800 dark:text-gray-300">{report.name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{report.description}</div>
                        
                        {/* Mobile view details */}
                        <div className="md:hidden mt-2 space-y-1 text-sm text-gray-500">
                          <div>Frequency: {formatFrequency(report)}</div>
                          <div>Format: {report.format.toUpperCase()}</div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden md:table-cell">
                        <div className="text-gray-500 dark:text-gray-400">
                          {formatFrequency(report)}
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                          {report.format.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex justify-end space-x-1 sm:space-x-2">
                          <IconButton
                            size="sm"
                            onClick={() => previewReport(report)}
                            icon={<Eye size={14} />}
                            variant="secondary"
                            shape="circle"
                            className="p-2 sm:p-3"
                            title="Preview Report"
                          />
                          <IconButton
                            size="sm"
                            onClick={() => generateReport(report)}
                            icon={<FileText size={14} />}
                            variant="primary"
                            shape="circle"
                            className="p-2 sm:p-3"
                            title="Generate Report Now"
                          />
                          {/* Düzenleme butonu sadece admin kullanıcılar tarafından görülür */}
                          {isAdmin && (
                            <IconButton
                              size="sm"
                              onClick={() => openEditModal(report)}
                              icon={<Pencil size={14} />}
                              variant="warning"
                              shape="circle"
                              className="p-2 sm:p-3"
                              title="Edit Report"
                            />
                          )}
                          {/* Silme butonu sadece admin kullanıcılar tarafından görülür */}
                          {isAdmin && (
                            <IconButton
                              disabled={deleting}
                              size="sm"
                              onClick={() => handleDeleteReport(report)}
                              icon={<Trash2 size={14} />}
                              variant="error"
                              shape="circle"
                              className="p-2 sm:p-3"
                              title="Delete Report"
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        className="max-w-2xl"
      >
        <PeriodicReportForm
          onSubmit={handleAddReport}
          onCancel={() => setIsAddModalOpen(false)}
          trendLogs={trendLogs}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        className="max-w-2xl"
      >
        {selectedReport && (
          <PeriodicReportForm
            report={selectedReport}
            onSubmit={handleEditReport}
            onCancel={() => setIsEditModalOpen(false)}
            trendLogs={trendLogs}
          />
        )}
      </Modal>

      {/* Preview Modal */}
      <Modal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        className="max-w-4xl"
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <Heading3>Report Preview</Heading3>
          </div>

          {previewLoading ? (
            <div className="flex justify-center py-10">
              <Spinner variant="bars" />
            </div>
          ) : previewData ? (
            <div className="space-y-4">
              <div className="border rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                <div className="font-medium text-gray-700 dark:text-gray-300">Subject:</div>
                <div className="text-gray-800 dark:text-gray-200">{previewData.subject}</div>
              </div>

              <div className="border rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                <div className="font-medium text-gray-700 dark:text-gray-300">Recipients:</div>
                <div className="text-gray-800 dark:text-gray-200">
                  {Array.isArray(previewData.recipients)
                    ? (previewData.recipients.length > 0
                        ? previewData.recipients.join(', ')
                        : 'No recipients configured in Mail Settings')
                    : (typeof previewData.recipients === 'string'
                        ? previewData.recipients
                        : 'No recipients configured in Mail Settings')}
                </div>
                <div className="mt-2 text-sm text-blue-500">
                  Recipients are managed through the centralized Mail Settings.
                </div>
              </div>
              
              <div className="border rounded-md overflow-hidden">
                <div className="bg-white p-4">
                  <div
                    className="h-[60vh] overflow-auto"
                    dangerouslySetInnerHTML={{ __html: previewData.html }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <Paragraph className="text-center py-10 text-gray-500">
              Report preview could not be loaded. Please try again.
            </Paragraph>
          )}
        </div>
      </Modal>
    </div>
  );
}