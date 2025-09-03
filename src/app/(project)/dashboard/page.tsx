"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { showToast } from "@/components/ui/alert";
import { Button } from "@/components/ui/button/CustomButton";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import WidgetCard from "@/components/widgets/WidgetCard";
import WidgetForm from "@/components/widgets/WidgetForm";
import { useAuth } from "@/hooks/use-auth";
import { PlusCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { TrendLogType } from "../trend-log/page";

// Kullanıcı tipi
export interface WidgetType {
  _id: string;
  name: string;
  price: number;
  currency: string;
  trendLogs: any[];
  startTime: string;
  createdAt: string;
  updatedAt: string;
}

export default function Dashboard() {
  const [widgets, setWidgets] = useState<WidgetType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [analyzers, setAnalyzers] = useState<any[]>([]);
  
  // Modal durumları
  const [isAddWidgetModalOpen, setIsAddWidgetModalOpen] = useState(false);
  const [isEditWidgetModalOpen, setIsEditWidgetModalOpen] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<WidgetType | undefined>(undefined);
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  useEffect(() => {
    if (!isAuthLoading && (isAdmin || user?.permissions?.dashboard === true)) {
      fetchBuildings().then(() => {
        fetchWidgets().then(() => {
          setIsLoading(false);
        })
      });
    }
  }, [isAuthLoading]);

  const fetchAnalyzers = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/analyzers");

      if (!response.ok) {
        throw new Error("Error fetching analyzers");
      }

      const data = await response.json();
      //console.log("analyzers: ", data)
      setAnalyzers(data.analyzers);
      return data
    } catch (error) {
      console.error("Error fetching analyzers:", error);
      showToast("Error fetching analyzers", "error");
      return []
    } finally {
      setIsLoading(false);
    }
  };
  const fetchWidgets = async () => {
    const analyzers = await fetchAnalyzers();
    try {
      setIsLoading(true);
      const response = await fetch("/api/widgets");

      if (!response.ok) {
        throw new Error("Error fetching RTUs");
      }

      const data = await response.json();
      for (let i = 0; i < data.length; i++) {
        const widget = data[i];
        widget.trendLogs.forEach((trendLog: any) => {
          trendLog.analyzerName = analyzers.find((analyzer: any) => analyzer._id === trendLog.analyzerId)?.name;
        });
      }
      
      //console.log("widgets: ", data)
      setWidgets(data);
    } catch (error) {
      console.error("Error fetching  widgets:", error);
      showToast("Error fetching widgets", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBuildings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/units");

      if (!response.ok) {
        throw new Error("Error fetching buildings");
      }

      const data = await response.json();
      //console.log("buildings: ", data)
      setBuildings(data.buildings);
    } catch (error) {
      console.error("Error fetching buildings:", error);
      showToast("Error fetching buildings", "error");
    } finally {
      setIsLoading(false);
    }
  };


  // Kullanıcı ekle modalını aç
  const openAddWidgetModal = () => {
    setSelectedWidget(undefined);
    setIsAddWidgetModalOpen(true);
  };

  // Widget ekle
  const handleAddWidget = async (widgetData: { name: string; price: number; currency: string; trendLogsData: TrendLogType[]; }) => {
    try {
      const response = await fetch("/api/widgets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(widgetData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Widget could not be added");
      }

      showToast("Widget added successfully");
      setIsAddWidgetModalOpen(false);
      fetchWidgets();
    } catch (error: any) {
      showToast(error.message || "Widget could not be added", "error");
    }
  };

  // Kullanıcı düzenle modalını aç
  const openEditWidgetModal = (widget: WidgetType) => {
    setSelectedWidget(widget);
    setIsEditWidgetModalOpen(true);
  };

  // Widget düzenle
  const handleEditWidget = async (widgetData: { name: string; price: number; currency: string; trendLogsData: TrendLogType[]; }) => {
    if (!selectedWidget) return;
    
    try {
      // Eğer password boşsa, API'ye göndermiyoruz
      const dataToSend = {
        name: widgetData.name,
        price: widgetData.price,
        currency: widgetData.currency,
        trendLogsData: widgetData.trendLogsData
      };

      const response = await fetch(`/api/widgets/${selectedWidget._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Widget could not be updated");
      }

      showToast("Widget updated successfully");
      setIsEditWidgetModalOpen(false);
      fetchWidgets();
    } catch (error: any) {
      showToast(error.message || "Widget could not be updated", "error");
    }
  };

  // Widget sil
  const handleDeleteWidget = async (widget: WidgetType) => {
    try {
      const response = await fetch(`/api/widgets/${widget._id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Widget could not be deleted");
      }

      showToast("Widget deleted successfully");
      fetchWidgets();
    } catch (error: any) {
      showToast(error.message || "Widget could not be deleted", "error");
    }
  };

  // Kimlik doğrulama yükleniyorsa
  // if (status === "loading") {
  //     return <Spinner variant="bars" fullPage />;
  // }

  // Admin değilse erişimi engelle


  if (isAuthLoading) {
    return <Spinner variant="bars" fullPage />
  } 

  return (
    <div>
      <PageBreadcrumb pageTitle="Dashboard" />

      <div className="flex justify-between items-center mb-6">
        {/* <div>  </div> */}
        {isAdmin && (
          <Button
            onClick={openAddWidgetModal}
            leftIcon={<PlusCircle size={16} />}
            variant="primary"
          >
            Add Widget
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner variant="bars" fullPage />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="overflow-x-auto w-full">
            {widgets.length === 0 ? (
              <div className="flex justify-center py-8 text-gray-500 dark:text-gray-400">
                No widgets found
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {JSON.stringify(analyzers)}
                {widgets.map((widget) => (
                  <WidgetCard
                    key={widget._id}
                    widget={widget}
                    onEdit={openEditWidgetModal}
                    onDelete={handleDeleteWidget}
                    buildings={buildings}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Widget Ekle Modal */}
      <Modal
        isOpen={isAddWidgetModalOpen}
        onClose={() => setIsAddWidgetModalOpen(false)}
        className="max-w-2xl"
      >
        <WidgetForm
          onSubmit={handleAddWidget}
          onCancel={() => setIsAddWidgetModalOpen(false)}
        />
      </Modal>

      {/* Widget Düzenle Modal */}
      <Modal
        isOpen={isEditWidgetModalOpen}
        onClose={() => setIsEditWidgetModalOpen(false)}
        className="max-w-2xl"
      >
        {selectedWidget && (
          <WidgetForm
            widget={selectedWidget}
            onSubmit={handleEditWidget}
            onCancel={() => setIsEditWidgetModalOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}
