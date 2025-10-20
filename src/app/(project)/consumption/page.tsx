"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

// Import Typography components
import { Heading3, Paragraph, SmallText } from "@/components/ui/typography";
import Button from "@/components/ui/button/Button";
import { AddReadyMadeWidgetModal } from "@/components/widgets/AddReadyMadeWidgetModal";
import { EditWidgetModal } from "@/components/widgets/EditWidgetModal";
import { EnergyConsumptionWidget } from "@/components/widgets/EnergyConsumptionWidget";
import { showConfirmAlert, showToast } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { WidgetDnDProvider } from "@/context/WidgetDnDContext";

// Interface for appearance settings
interface WidgetAppearance {
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  opacity: number;
}

export default function ConsumptionPage() {
  const router = useRouter();
  const [isReadyMadeModalOpen, setIsReadyMadeModalOpen] = useState(false);
  const [widgets, setWidgets] = useState<any[]>([]);
  const [widgetsLoading, setWidgetsLoading] = useState(true);
  const [editingWidget, setEditingWidget] = useState<any | null>(null);
  const [widgetPositions, setWidgetPositions] = useState<Record<string, { x: number, y: number }>>({});
  
  // Auth durumunu kontrol etmek için useAuth hook'u
  const { isAdmin } = useAuth();

  useEffect(() => {
    const fetchWidgets = async () => {
      try {
        setWidgetsLoading(true);
        const response = await fetch("/api/consumption-widgets");
        if (!response.ok) {
          throw new Error("Failed to fetch consumption widgets");
        }
        const data = await response.json();
        setWidgets(data);
      } catch (error) {
        console.error(error);
      } finally {
        setWidgetsLoading(false);
      }
    };
    fetchWidgets();
  }, []);

  const handleAddReadyMadeWidget = async (widgetData: any) => {
    const newWidgetData = {
      title: widgetData.title,
      size: widgetData.size,
      appearance: widgetData.appearance,
      type: widgetData.type,
      trendLogId: widgetData.trendLogId
    };

    try {
      const response = await fetch("/api/consumption-widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWidgetData),
      });
      if (!response.ok) throw new Error("Failed to create consumption widget");
      const newWidget = await response.json();
      setWidgets([...widgets, newWidget]);
      showToast("Consumption widget added successfully.", "success");
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
            const response = await fetch(`/api/consumption-widgets/${widget._id}`, {
              method: "DELETE",
            });
            if (!response.ok) throw new Error("Failed to delete consumption widget");
            setWidgets(widgets.filter(w => w._id !== widget._id));
            showToast("Widget deleted successfully.", "success");
        } catch (error) {
            console.error(error);
            showToast("An error occurred while deleting the widget.", "error");
        }
    }
  };

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
      const response = await fetch(`/api/consumption-widgets/${widgetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: newPosition }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update consumption widget position');
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
    const updatedData: any = {
      title: newName,
      size: newSize,
      appearance: appearance
    };

    setWidgets(prev => prev.map(w => w._id === widgetId ? { ...w, ...updatedData } : w));

    try {
        const response = await fetch(`/api/consumption-widgets/${widgetId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData),
        });
        if (!response.ok) throw new Error('Failed to update consumption widget details');
        showToast("Widget details updated successfully.", "success");
    } catch (error) {
        console.error("Error updating widget details:", error);
        showToast("An error occurred.", "error");
        // Optionally revert state on error
        setWidgets(prev => prev.map(w => w._id === widgetId ? editingWidget : w));
    }
  };

  return (
    <WidgetDnDProvider>
      <>
      <AddReadyMadeWidgetModal
          isOpen={isReadyMadeModalOpen}
          onClose={() => setIsReadyMadeModalOpen(false)}
          onConfirm={handleAddReadyMadeWidget}
      />
      <EditWidgetModal
          isOpen={!!editingWidget}
          onClose={() => setEditingWidget(null)}
          onConfirm={handleUpdateWidgetDetails}
          widget={editingWidget}
      />
      
      <div className="w-full p-6">
        {/* Header */}
        <div className="mb-8 flex justify-between items-center">
          <div>
            <Heading3 className="text-2xl font-bold text-gray-900 dark:text-white">
              Energy Consumption
            </Heading3>
            <Paragraph className="text-gray-600 dark:text-gray-400 mt-1">
              Monitor and analyze energy consumption data
            </Paragraph>
          </div>
          
          {/* Add Ready-Made Widget button - sadece admin kullanıcılar için */}
          {isAdmin && (
            <button
              className="py-3 px-6 text-base font-bold transition-colors focus:outline-none rounded-lg shadow-md bg-green-500 text-white hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700"
              onClick={() => setIsReadyMadeModalOpen(true)}
            >
              Add Consumption Widget
            </button>
          )}
        </div>
        
        {/* Content */}
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
                const widgetKey = widget._id || `widget-${Math.random()}`;
                
                return (
                  <EnergyConsumptionWidget
                    key={widgetKey}
                    id={widget._id}
                    title={widget.title}
                    size={widget.size}
                    position={widget.position || { x: 0, y: 0 }}
                    appearance={widget.appearance}
                    trendLogId={widget.trendLogId}
                    onDelete={() => handleDeleteWidget(widget)}
                    onEdit={() => setEditingWidget(widget)}
                    onWidgetPositionChange={handleWidgetPositionChange}
                  />
                );
              })
            ) : (
              <div className="col-span-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 mb-6">
                <div className="flex items-center justify-center h-48">
                  <Paragraph className="text-gray-400 text-center">
                    No consumption widgets have been added yet. Click "Add Consumption Widget" to get started.
                  </Paragraph>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      </>
    </WidgetDnDProvider>
  );
}