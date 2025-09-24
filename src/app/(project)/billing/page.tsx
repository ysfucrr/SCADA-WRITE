"use client";

import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { showToast } from "@/components/ui/alert";
import { Button } from "@/components/ui/button/CustomButton";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import BillingCard from "@/components/billing/billingCard";
import BillingForm from "@/components/billing/billingForm";
import { useAuth } from "@/hooks/use-auth";
import { PlusCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { TrendLogType } from "../trend-log/page";

// Kullanıcı tipi
export interface billingType {
  _id: string;
  name: string;
  price: number;
  currency: string;
  trendLogs: any[];
  startTime: string;
  createdAt: string;
  updatedAt: string;
}

export default function billing() {
  const [billings, setbillings] = useState<billingType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [buildings, setBuildings] = useState<any[]>([]);
  const [analyzers, setAnalyzers] = useState<any[]>([]);
  
  // Modal durumları
  const [isAddbillingModalOpen, setIsAddbillingModalOpen] = useState(false);
  const [isEditbillingModalOpen, setIsEditbillingModalOpen] = useState(false);
  const [selectedbilling, setSelectedbilling] = useState<billingType | undefined>(undefined);
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  useEffect(() => {
    if (!isAuthLoading && (isAdmin || user?.permissions?.billing === true)) {
      fetchBuildings().then(() => {
        fetchbillings().then(() => {
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
  const fetchbillings = async () => {
    const analyzers = await fetchAnalyzers();
    try {
      setIsLoading(true);
      const response = await fetch("/api/billings");

      if (!response.ok) {
        throw new Error("Error fetching gateway");
      }

      const data = await response.json();
      for (let i = 0; i < data.length; i++) {
        const billing = data[i];
        billing.trendLogs.forEach((trendLog: any) => {
          trendLog.analyzerName = analyzers.find((analyzer: any) => analyzer._id === trendLog.analyzerId)?.name;
        });
      }
      
      //console.log("billings: ", data)
      setbillings(data);
    } catch (error) {
      console.error("Error fetching  billings:", error);
      showToast("Error fetching billings", "error");
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
  const openAddbillingModal = () => {
    setSelectedbilling(undefined);
    setIsAddbillingModalOpen(true);
  };

  // billing ekle
  const handleAddbilling = async (billingData: { name: string; price: number; currency: string; trendLogsData: TrendLogType[]; }) => {
    try {
      const response = await fetch("/api/billings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(billingData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Billing could not be added");
      }

      showToast("Billing added successfully");
      setIsAddbillingModalOpen(false);
      fetchbillings();
    } catch (error: any) {
      showToast(error.message || "Billing could not be added", "error");
    }
  };

  // Kullanıcı düzenle modalını aç
  const openEditbillingModal = (billing: billingType) => {
    setSelectedbilling(billing);
    setIsEditbillingModalOpen(true);
  };

  // billing düzenle
  const handleEditbilling = async (billingData: { name: string; price: number; currency: string; trendLogsData: TrendLogType[]; }) => {
    if (!selectedbilling) return;
    
    try {
      // Eğer password boşsa, API'ye göndermiyoruz
      const dataToSend = {
        name: billingData.name,
        price: billingData.price,
        currency: billingData.currency,
        trendLogsData: billingData.trendLogsData
      };

      const response = await fetch(`/api/billings/${selectedbilling._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Billing could not be updated");
      }

      showToast("Billing updated successfully");
      setIsEditbillingModalOpen(false);
      fetchbillings();
    } catch (error: any) {
      showToast(error.message || "Billing could not be updated", "error");
    }
  };

  // billing sil
  const handleDeletebilling = async (billing: billingType) => {
    try {
      const response = await fetch(`/api/billings/${billing._id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Billing could not be deleted");
      }

      showToast("Billing deleted successfully");
      fetchbillings();
    } catch (error: any) {
      showToast(error.message || "Billing could not be deleted", "error");
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
      <PageBreadcrumb pageTitle="Billing" />

      <div className="flex justify-between items-center mb-6">
        {/* <div>  </div> */}
        {isAdmin && (
          <Button
            onClick={openAddbillingModal}
            leftIcon={<PlusCircle size={16} />}
            variant="primary"
          >
            Add Billing
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
            {billings.length === 0 ? (
              <div className="flex justify-center py-8 text-gray-500 dark:text-gray-400">
                No billings found
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {JSON.stringify(analyzers)}
                {billings.map((billing) => (
                  <BillingCard
                    key={billing._id}
                    billing={billing}
                    onEdit={openEditbillingModal}
                    onDelete={handleDeletebilling}
                    buildings={buildings}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* billing Ekle Modal */}
      <Modal
        isOpen={isAddbillingModalOpen}
        onClose={() => setIsAddbillingModalOpen(false)}
        className="max-w-2xl"
      >
        <BillingForm
          onSubmit={handleAddbilling}
          onCancel={() => setIsAddbillingModalOpen(false)}
        />
      </Modal>

      {/* billing Düzenle Modal */}
      <Modal
        isOpen={isEditbillingModalOpen}
        onClose={() => setIsEditbillingModalOpen(false)}
        className="max-w-2xl"
      >
        {selectedbilling && (
          <BillingForm
            billing={selectedbilling}
            onSubmit={handleEditbilling}
            onCancel={() => setIsEditbillingModalOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}
