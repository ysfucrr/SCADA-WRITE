export interface Room {
  _id?: string;
  name?: string;
  icon?: string;
}

export interface Floor {
  _id?: string;
  name?: string;
  rooms: Room[];
  isExpanded?: boolean;
  icon?: string;
}

export interface Building {
  _id?: string;
  name?: string;
  floors: Floor[];
  icon?: string;
}

// Yeni bina oluşturma formunda kullanılacak tip
export interface NewBuilding {
  name?: string;
  floors: Floor[];
}
