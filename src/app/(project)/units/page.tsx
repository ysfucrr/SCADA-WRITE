"use client";

import { useState, useEffect } from "react";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { PlusIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import BuildingCard from "@/components/units/BuildingCard";
import FloorCard from "@/components/units/FloorCard";
import BuildingForm from "@/components/units/BuildingForm";
import FloorForm from "@/components/units/FloorForm";
import { Building, Floor, Room } from "@/types/units";
import { showConfirmAlert, showErrorAlert, showToast } from "@/components/ui/alert";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button/CustomButton";
import { eventEmitter, EVENTS } from "@/lib/events";

// export const metadata: Metadata = {
//   title: "Building Units Management",
//   description: "Manage buildings, floors and rooms",
// };


export default function UnitsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [isAddingBuilding, setIsAddingBuilding] = useState<boolean>(false);
  const [editingBuilding, setEditingBuilding] = useState<Building | null>(null);
  const [isAddingFloor, setIsAddingFloor] = useState<boolean>(false);
  const [editingFloor, setEditingFloor] = useState<Floor | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  useEffect(() => {
    fetchBuildings();
  }, []);

  // Building CRUD
  const fetchBuildings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/units");
      const data = await response.json();

      if (data.success && data.buildings) {
        setBuildings(data.buildings);
      } else {
        throw new Error(data.message || "Failed to fetch buildings");
      }
    } catch (error) {
      console.error("Error fetching buildings:", error);
      showToast("Failed to load buildings", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddBuilding = async (name: string) => {
    try {
      const response = await fetch("/api/units", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      const data = await response.json();

      if (data.success && data.building) {
        setBuildings([...buildings, data.building]);

        // Bina eklendiğinde event tetikle
        eventEmitter.emit(EVENTS.BUILDING_ADDED, { building: data.building });
        //console.log('Building added, emitting event:', data.building);

        showToast("Building added successfully", "success");
        await fetchBuildings();
        setIsAddingBuilding(false);
      } else {
        throw new Error(data.message || "Failed to add building");
      }
    } catch (error) {
      console.error("Error adding building:", error);
      showToast("Failed to add building", "error");
    }
  };

  const handleUpdateBuilding = async (id: string, name: string) => {
    try {
      const response = await fetch(`/api/units/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      const data = await response.json();

      if (data.success && data.building) {
        setBuildings(
          buildings.map((building) =>
            building._id === id ? data.building! : building
          )
        );

        if (selectedBuilding?._id === id) {
          setSelectedBuilding(data.building);
        }

        // Bina güncellendiğinde event tetikle
        eventEmitter.emit(EVENTS.BUILDING_RENAMED, { buildingId: id, name });
        //console.log('Building renamed, emitting event:', id, name);
        await fetchBuildings();

        showToast("Building updated successfully", "success");
      } else {
        throw new Error(data.message || "Failed to update building");
      }
    } catch (error) {
      console.error("Error updating building:", error);
      showToast("Failed to update building", "error");
    }
  };

  const handleDeleteBuilding = async (id: string) => {
    try {
      const result = await showConfirmAlert(
        'Delete Building',
        'Are you sure you want to delete this building? This action cannot be undone.',
        'Delete',
        'Cancel'
      );

      if (!result.isConfirmed) {
        return;
      }

      setIsLoading(true);
      const response = await fetch(`/api/units/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (data.success) {
        setBuildings(buildings.filter((building) => building._id !== id));
        if (selectedBuilding?._id === id) {
          setSelectedBuilding(null);
        }

        // Bina silindiğinde event tetikle
        eventEmitter.emit(EVENTS.BUILDING_DELETED, { buildingId: id });
        //console.log('Building deleted, emitting event:', id);
        await fetchBuildings();
        showToast("Building deleted successfully", "success");
      } else {
        console.warn(data)
        throw new Error(data.message || "Failed to delete building");
      }
    } catch (error: any) {
      console.error("Error deleting building:", error);
      showErrorAlert(error.message);
    } finally {
      setIsLoading(false);
    }
  };


  const handleAddFloor = async (floorName: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/units/${selectedBuilding?._id}/floors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: floorName }),
      });

      if (response.ok) {
        const data = await response.json();
        //console.log('API Response:', data); // Gelen veriyi kontrol edelim

        // API'den gelen floor objesini kullanalım
        if (selectedBuilding && data.success && data.floor) {
          const newFloor = data.floor;

          setSelectedBuilding({
            ...selectedBuilding,
            floors: [...selectedBuilding.floors, newFloor],
          });
          eventEmitter.emit(EVENTS.FLOOR_ADDED, {
            buildingId: selectedBuilding._id,
            floor: data.floor
          });
          await fetchBuildings();
          showToast("Floor added successfully", "success");
        } else {
          throw new Error(data.message || "Floor adding failed");
        }
      } else {
        showToast("Floor adding failed", "error");
      }
    } catch (error) {
      console.error("Error adding floor:", error);
      showToast("Floor adding failed", "error");
    } finally {
      setIsLoading(false);
    }
  };
  // Kat güncelle
  const handleUpdateFloor = async (floorId: string, newName: string) => {
    try {
      // setIsLoading(true);
      const response = await fetch(`/api/units/${selectedBuilding?._id}/floors/${floorId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });

      if (response.ok) {
        const data = await response.json();
        if (selectedBuilding && selectedBuilding._id && selectedBuilding.name && data.success && data.floor) {
          // API'den gelen güncellenmiş katı kullan
          const updatedFloor = data.floor;
          
          setSelectedBuilding({
            _id: selectedBuilding._id,
            name: selectedBuilding.name,
            floors: selectedBuilding.floors.map(f => f._id === floorId ? updatedFloor : f),
          });
          
          eventEmitter.emit(EVENTS.FLOOR_RENAMED, {
            buildingId: selectedBuilding._id,
            floorId,
            name: newName
          });
        }
        await fetchBuildings();
        showToast("Floor updated successfully", "success");
      } else {
        showToast("Floor updating failed", "error");
      }
    } catch (error) {
      console.error("Error updating floor:", error);
      showToast("Floor updating failed", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Kat sil
  const handleDeleteFloor = async (floorId: string) => {
    try {
      const result = await showConfirmAlert(
        'Delete Floor',
        'Are you sure you want to delete this floor? All rooms will be deleted.',
        'Delete',
        'Cancel'
      );

      if (!result.isConfirmed) {
        return;
      }

      setIsLoading(true);
      const response = await fetch(`/api/units/${selectedBuilding?._id}/floors/${floorId}`, {
        method: "DELETE",
      });

      if (response.ok && selectedBuilding) {
        const updatedFloors = selectedBuilding.floors.filter(f => f._id !== floorId);
        if (selectedBuilding && selectedBuilding._id && selectedBuilding.name) {
          setSelectedBuilding({
            _id: selectedBuilding._id,
            name: selectedBuilding.name,
            floors: updatedFloors,
          });
        }
        eventEmitter.emit(EVENTS.FLOOR_DELETED, {
          buildingId: selectedBuilding._id,
          floorId
        });
        await fetchBuildings();
        showToast("Floor deleted successfully", "success");
      } else {
        showToast("Floor deleting failed", "error");
      }
    } catch (error) {
      console.error("Error deleting floor:", error);
      showToast("Floor deleting failed", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Oda ekle
  const handleAddRoom = async (floorId: string, roomName: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/units/${selectedBuilding?._id}/floors/${floorId}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName }),
      });

      if (response.ok) {
        const data = await response.json();
        //console.log('API Odası yanıtı:', data); // Gelen veriyi kontrol edelim

        // API'den gelen room objesini kullanın
        if (selectedBuilding && selectedBuilding._id && data.success && data.room) {
          const newRoom = data.room;

          setSelectedBuilding({
            _id: selectedBuilding._id,
            name: selectedBuilding.name!,
            floors: selectedBuilding.floors.map(f =>
              f._id === floorId ?
                { ...f, rooms: [...f.rooms, newRoom] } :
                f
            ),
          });
          eventEmitter.emit(EVENTS.ROOM_ADDED, {
            buildingId: selectedBuilding._id,
            floorId,
            room: data.room
          });
          await fetchBuildings();
          showToast("Room added successfully", "success");
        } else {
          throw new Error(data.message || "Room adding failed");
        }
      } else {
        showToast("Room adding failed", "error");
      }
    } catch (error) {
      console.error("Error adding room:", error);
      showToast("Room adding failed", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Oda güncelle
  const handleUpdateRoom = async (floorId: string, roomId: string, newName: string) => {
    try {
      // setIsLoading(true);
      const response = await fetch(`/api/units/${selectedBuilding?._id}/floors/${floorId}/rooms/${roomId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });

      if (response.ok) {
        const data = await response.json();
        if (selectedBuilding && selectedBuilding._id && selectedBuilding.name && data.success && data.room) {
          // API'den gelen güncellenmiş odayı kullan
          const updatedRoom = data.room;
          
          setSelectedBuilding({
            _id: selectedBuilding._id,
            name: selectedBuilding.name,
            floors: selectedBuilding.floors.map(f => 
              f._id === floorId ? 
              { ...f, rooms: f.rooms.map(r => r._id === roomId ? updatedRoom : r) } : 
              f
            ),
          });
          
          eventEmitter.emit(EVENTS.ROOM_RENAMED, {
            buildingId: selectedBuilding._id,
            floorId,
            roomId,
            name: newName
          });
          await fetchBuildings();
        }
        showToast("Room updated successfully", "success");
      } else {
        showToast("Room updating failed", "error");
      }
    } catch (error) {
      console.error("Error updating room:", error);
      showToast("Room updating failed", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Oda sil
  const handleDeleteRoom = async (floorId: string, roomId: string) => {
    try {
      const result = await showConfirmAlert(
        'Delete Room',
        'Are you sure you want to delete this room?',
        'Delete',
        'Cancel'
      );

      if (!result.isConfirmed) {
        return;
      }

      setIsLoading(true);
      const response = await fetch(`/api/units/${selectedBuilding?._id}/floors/${floorId}/rooms/${roomId}`, {
        method: "DELETE",
      });

      if (response.ok && selectedBuilding) {
        const updatedFloors = selectedBuilding.floors.map(f => f._id === floorId ? { ...f, rooms: f.rooms.filter(r => r._id !== roomId) } : f);
        if (selectedBuilding && selectedBuilding._id && selectedBuilding.name) {
          setSelectedBuilding({
            _id: selectedBuilding._id,
            name: selectedBuilding.name,
            floors: updatedFloors,
          });
        }
        eventEmitter.emit(EVENTS.ROOM_DELETED, {
          buildingId: selectedBuilding._id,
          floorId,
          roomId
        });
        await fetchBuildings();
        showToast("Room deleted successfully", "success");
      } else {
        showToast("Room deleting failed", "error");
      }
    } catch (error) {
      console.error("Error deleting room:", error);
      showToast("Room deleting failed", "error");
    } finally {
      setIsLoading(false);
    }
  };
  // Bina ikonu güncelle
  const handleBuildingIconChange = async (buildingId: string, iconPath: string | null) => {
    try {
      const response = await fetch(`/api/units/${buildingId}/icon`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconPath }),
      });

      if (response.ok) {
        // Başarılı olursa, binaları güncelle
        setBuildings(buildings.map(building => {
          if (building._id === buildingId) {
            return { ...building, icon: iconPath || undefined };
          }
          return building;
        }));

        // Eğer seçili bina güncellendiyse, onu da güncelle
        if (selectedBuilding && selectedBuilding._id === buildingId) {
          setSelectedBuilding({ ...selectedBuilding, icon: iconPath || undefined });
        }

        // İkon güncellendiğinde event tetikle
        eventEmitter.emit(EVENTS.BUILDING_UPDATED, { buildingId, iconPath });
        //console.log('Building icon updated, emitting event:', buildingId, iconPath);
        await fetchBuildings();
        showToast("Building icon updated successfully", "success");
      } else {
        throw new Error("Failed to update building icon");
      }
    } catch (error) {
      console.error("Error updating building icon:", error);
      showToast("Failed to update building icon", "error");
    }
  };

  // Kat ikonu güncelle
  const handleFloorIconChange = async (floorId: string, iconPath: string | null) => {
    try {
      if (!selectedBuilding || !selectedBuilding._id) return;

      const response = await fetch(`/api/units/${selectedBuilding._id}/floors/${floorId}/icon`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconPath }),
      });

      if (response.ok && selectedBuilding) {
        // Başarılı olursa, seçili binayı güncelle
        const updatedFloors = selectedBuilding.floors.map(floor => {
          if (floor._id === floorId) {
            return { ...floor, icon: iconPath || undefined };
          }
          return floor;
        });

        setSelectedBuilding({
          ...selectedBuilding,
          floors: updatedFloors,
        });

        // İkon güncellendiğinde event tetikle
        eventEmitter.emit(EVENTS.FLOOR_UPDATED, { buildingId: selectedBuilding._id, floorId, iconPath });
        //console.log('Floor icon updated, emitting event:', floorId, iconPath);
        await fetchBuildings();
        showToast("Floor icon updated successfully", "success");
      } else {
        throw new Error("Failed to update floor icon");
      }
    } catch (error) {
      console.error("Error updating floor icon:", error);
      showToast("Failed to update floor icon", "error");
    }
  };

  // Oda ikonu güncelle
  const handleRoomIconChange = async (floorId: string, roomId: string, iconPath: string | null) => {
    try {
      if (!selectedBuilding || !selectedBuilding._id) return;

      const response = await fetch(`/api/units/${selectedBuilding._id}/floors/${floorId}/rooms/${roomId}/icon`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iconPath }),
      });

      if (response.ok && selectedBuilding) {
        // Başarılı olursa, seçili binayı güncelle
        const updatedFloors = selectedBuilding.floors.map(floor => {
          if (floor._id === floorId) {
            const updatedRooms = floor.rooms.map(room => {
              if (room._id === roomId) {
                return { ...room, icon: iconPath || undefined };
              }
              return room;
            });
            return { ...floor, rooms: updatedRooms };
          }
          return floor;
        });

        setSelectedBuilding({
          ...selectedBuilding,
          floors: updatedFloors,
        });

        // İkon güncellendiğinde event tetikle
        eventEmitter.emit(EVENTS.ROOM_UPDATED, { buildingId: selectedBuilding._id, floorId, roomId, iconPath });
        //console.log('Room icon updated, emitting event:', floorId, roomId, iconPath);
        await fetchBuildings();
        showToast("Room icon updated successfully", "success");
      } else {
        throw new Error("Failed to update room icon");
      }
    } catch (error) {
      console.error("Error updating room icon:", error);
      showToast("Failed to update room icon", "error");
    }
  };



  return (
    <div>
      <PageBreadcrumb pageTitle="Units" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Sol taraf - Binalar listesi */}
          <div className="md:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                Buildings
              </h2>
              <IconButton
                onClick={() => setIsAddingBuilding(!isAddingBuilding)}
                variant="primary"
                size="sm"
                icon={<PlusIcon className="h-5 w-5" />}
              />
            </div>

            {isAddingBuilding && (
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <BuildingForm
                  isEditing={false}
                  onSubmit={handleAddBuilding}
                  onCancel={() => setIsAddingBuilding(false)}
                />
              </div>
            )}

            {editingBuilding && (
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <BuildingForm
                  isEditing={true}
                  building={editingBuilding}
                  onSubmit={(name) => {
                    if (editingBuilding._id) {
                      handleUpdateBuilding(editingBuilding._id, name);
                      setEditingBuilding(null);
                    }
                  }}
                  onCancel={() => setEditingBuilding(null)}
                />
              </div>
            )}

            <div className="max-h-[600px] overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/40">
              {isLoading && !buildings.length ? (
                <div className="flex h-32 w-full items-center justify-center">
                  <Spinner variant="bars" size="lg" />
                </div>
              ) : buildings.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {buildings.map((building) => (
                    <BuildingCard
                      key={building._id}
                      building={building}
                      isActive={selectedBuilding?._id === building._id}
                      onSelect={setSelectedBuilding}
                      onEdit={setEditingBuilding}
                      onDelete={handleDeleteBuilding}
                      onIconChange={handleBuildingIconChange}
                    />
                  ))}
                </div>
              ) : (
                <p className="py-4 text-center text-gray-500 dark:text-gray-400">
                  No buildings yet. Add your first building.
                </p>
              )}
            </div>
          </div>

          {/* Sağ taraf - Seçilen binanın katları ve odaları */}
          <div className="md:col-span-8">
            {selectedBuilding ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-gray-800 dark:text-white">
                    Floors in {selectedBuilding.name}
                  </h4>
                  <IconButton
                    onClick={() => setIsAddingFloor(!isAddingFloor)}
                    variant="primary"
                    size="sm"
                    icon={<PlusIcon className="h-5 w-5" />}
                  />
                </div>

                {isAddingFloor && (
                  <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                    <FloorForm
                      isEditing={false}
                      onSubmit={handleAddFloor}
                      onCancel={() => setIsAddingFloor(false)}
                    />
                  </div>
                )}

                {editingFloor && (
                  <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                    <FloorForm
                      isEditing={true}
                      floor={editingFloor}
                      onSubmit={(name) => {
                        handleUpdateFloor(editingFloor._id!, name);
                        setEditingFloor(null);
                      }}
                      onCancel={() => setEditingFloor(null)}
                    />
                  </div>
                )}

                <div className="space-y-4">
                  {selectedBuilding.floors && selectedBuilding.floors.length > 0 ? (
                    selectedBuilding.floors.map((floor) => (
                      <FloorCard
                        key={floor._id}
                        floor={floor}
                        onEdit={(floorId) => setEditingFloor(selectedBuilding.floors.find(f => f._id === floorId) || null)}
                        onDelete={handleDeleteFloor}
                        onAddRoom={handleAddRoom}
                        onEditRoom={handleUpdateRoom}
                        onDeleteRoom={handleDeleteRoom}
                        onIconChange={handleFloorIconChange}
                        onRoomIconChange={handleRoomIconChange}
                      />
                    ))
                  ) : (
                    <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-400">
                      No floors yet. Add your first floor.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <p>Select a building to manage floors and rooms</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
