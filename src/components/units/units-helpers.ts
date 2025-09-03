"use client";

import { v4 as uuidv4 } from 'uuid';
import { Building, Floor, Room } from '@/types/units';

// Yeni bir boş kat oluştur
export const createNewFloor = (name: string): Floor => {
  return {
    _id: uuidv4(),
    name,
    rooms: []
  };
};

// Yeni bir boş oda oluştur
export const createNewRoom = (name: string): Room => {
  return {
    _id: uuidv4(),
    name
  };
};

// Binadan katı bul
export const findFloorById = (building: Building, floorId: string): Floor | undefined => {
  return building.floors.find(floor => floor._id === floorId);
};

// Binada katı güncelle
export const updateFloorInBuilding = (building: Building, updatedFloor: Floor): Building => {
  return {
    ...building,
    floors: building.floors.map(floor => 
      floor._id === updatedFloor._id ? updatedFloor : floor
    )
  };
};

// Katta odayı bul
export const findRoomById = (floor: Floor, roomId: string): Room | undefined => {
  return floor.rooms.find(room => room._id === roomId);
};

// Katta odayı güncelle
export const updateRoomInFloor = (floor: Floor, updatedRoom: Room): Floor => {
  return {
    ...floor,
    rooms: floor.rooms.map(room => 
      room._id === updatedRoom._id ? updatedRoom : room
    )
  };
};
