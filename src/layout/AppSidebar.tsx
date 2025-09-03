"use client";
import EditableTitle from "@/components/ui/EditableTitle";
import { Spinner } from "@/components/ui/spinner";
import { Typography } from "@/components/ui/typography";
import { useAuth } from "@/hooks/use-auth";
import { Building, Combine, DoorOpen, Gauge, Home, Layers, Logs, Mail, Microchip, ServerCog, Siren, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSidebar } from "../context/SidebarContext";
import { eventEmitter, EVENTS } from "@/lib/events";
import {
  ChevronDownIcon,
  HorizontaLDots
} from "../icons/index";
import { GhostButton } from "@/components/ui/button/CustomButton";
import { useRouter } from "next/navigation";

type NavItem = {
  name: string;
  icon?: React.ReactNode;
  path?: string;
  subItems?: NavItem[];
};

type Building = {
  _id: string;
  name: string;
  icon?: string;
  floors?: {
    _id: string;
    name: string;
    icon?: string;
    rooms?: {
      _id: string;
      name: string;
      icon?: string;
    }[];
  }[];
};

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered, toggleSidebar, toggleMobileSidebar, license } = useSidebar();
  const [openSubmenus, setOpenSubmenus] = useState<string[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const pathname = usePathname() || '';
  const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  // URL'nin belirli bir yolla eşleşip eşleşmediğini kontrol eden fonksiyon
  const isActive = useCallback((path: string) => pathname === path, [pathname]);

  // Binaları menü öğelerine dönüştüren fonksiyon
  const getBuildingMenuItems = useCallback((user: any, buildings: Building[], isAdmin: boolean): NavItem[] => {
    if (!user || !buildings.length) return [];

    return buildings
      .filter(building => isAdmin || user.buildingPermissions?.[building._id])
      .map(building => ({
        icon: building.icon ? (
          <div className="relative h-5 w-5">
            <img src={building.icon} alt={building.name} className="h-full w-full object-contain" />
          </div>
        ) : <Building />,
        name: building.name,
        path: `/buildings/${building._id}`,
        subItems: building.floors?.map((floor: any) => ({
          icon: floor.icon ? (
            <div className="relative h-5 w-5">
              <img src={floor.icon} alt={floor.name} className="h-full w-full object-contain" />
            </div>
          ) : <Layers />,
          name: floor.name,
          path: `/buildings/${building._id}/${floor._id}`,
          subItems: floor.rooms?.map((room: any) => ({
            icon: room.icon ? (
              <div className="relative h-5 w-5">
                <img src={room.icon} alt={room.name} className="h-full w-full object-contain" />
              </div>
            ) : <DoorOpen />,
            name: room.name,
            path: `/buildings/${building._id}/${floor._id}/${room._id}`
          })) || []
        })) || []
      }));
  }, []);

  const getMainMenuItems = useCallback((user: any, isAdmin: boolean): NavItem[] => {
    if (!user) return [];

    const items = [];

    if (isAdmin) {

      return [
        {
          icon: <Home />,
          name: "Dashboard",
          path: "/dashboard",
        },
        {
          icon: <Users />,
          name: "Users",
          path: "/users",
        },
        {
          icon: <Combine />,
          name: "Units",
          path: "/units",
        },
        {
          icon: <Microchip />,
          name: "Gateway Settings",
          path: "/rtu-settings",
        },
        {
          icon: <Gauge />,
          name: "Analyzers",
          path: "/analyzers",
        },
        {
          icon: <Logs />,
          name: "Trend Log",
          path: "/trend-log",
        },
        {
          icon: <ServerCog />,
          name: "System Logs",
          path: "/system-logs",
        },
        {
          icon: <Mail />,
          name: "Mail Settings",
          path: "/mail-settings",
        },
        {
          icon: <Siren />,
          name: "Alert Rules",
          path: "/alert-rules",
        }
      ];
    }
    if (user.permissions.dashboard) {
      items.push({
        icon: <Home />,
        name: "Dashboard",
        path: "/dashboard",
      });
    }
    if (user.permissions.units) {
      items.push({
        icon: <Combine />,
        name: "Units",
        path: "/units",
      });
    }
    if (user.permissions.users) {
      items.push({
        icon: <Users />,
        name: "Users",
        path: "/users",
      });
    }
    if (user.permissions.trendLog) {
      items.push({
        icon: <Logs />,
        name: "Trend Log",
        path: "/trend-log",
      });
    }
    return items;
  }, []);

  const navItems: NavItem[] = useMemo(() => [
    ...getMainMenuItems(user, isAdmin),
    ...getBuildingMenuItems(user, buildings, isAdmin),
  ], [user, buildings, isAdmin, getBuildingMenuItems]);


  // Binaları getiren fonksiyon
  const fetchBuildings = async () => {
    try {
      const res = await fetch('/api/units');
      const data = await res.json();
      setBuildings(data.buildings || []);
    } catch (error) {
      console.error('Failed to fetch buildings:', error);
    }
  };

  useEffect(() => {
    // Sayfa yüklendiğinde binaları getir
    fetchBuildings();

    // İkon ve diğer değişiklikleri dinle
    const handleUpdate = () => {
      console.log('Event received, refreshing buildings...');
      fetchBuildings();
    };

    // Event listener'ları ekle
    eventEmitter.on(EVENTS.ICON_UPDATED, handleUpdate);
    eventEmitter.on(EVENTS.BUILDING_UPDATED, handleUpdate);
    eventEmitter.on(EVENTS.FLOOR_UPDATED, handleUpdate);
    eventEmitter.on(EVENTS.ROOM_UPDATED, handleUpdate);

    // Bina işlemleri
    eventEmitter.on(EVENTS.BUILDING_ADDED, handleUpdate);
    eventEmitter.on(EVENTS.BUILDING_RENAMED, handleUpdate);
    eventEmitter.on(EVENTS.BUILDING_DELETED, handleUpdate);

    // Kat işlemleri
    eventEmitter.on(EVENTS.FLOOR_ADDED, handleUpdate);
    eventEmitter.on(EVENTS.FLOOR_RENAMED, handleUpdate);
    eventEmitter.on(EVENTS.FLOOR_DELETED, handleUpdate);

    // Oda işlemleri
    eventEmitter.on(EVENTS.ROOM_ADDED, handleUpdate);
    eventEmitter.on(EVENTS.ROOM_RENAMED, handleUpdate);
    eventEmitter.on(EVENTS.ROOM_DELETED, handleUpdate);

    // Component unmount olduğunda event listener'ları temizle
    return () => {
      eventEmitter.off(EVENTS.ICON_UPDATED, handleUpdate);
      eventEmitter.off(EVENTS.BUILDING_UPDATED, handleUpdate);
      eventEmitter.off(EVENTS.FLOOR_UPDATED, handleUpdate);
      eventEmitter.off(EVENTS.ROOM_UPDATED, handleUpdate);

      // Bina işlemleri
      eventEmitter.off(EVENTS.BUILDING_ADDED, handleUpdate);
      eventEmitter.off(EVENTS.BUILDING_RENAMED, handleUpdate);
      eventEmitter.off(EVENTS.BUILDING_DELETED, handleUpdate);

      // Kat işlemleri
      eventEmitter.off(EVENTS.FLOOR_ADDED, handleUpdate);
      eventEmitter.off(EVENTS.FLOOR_RENAMED, handleUpdate);
      eventEmitter.off(EVENTS.FLOOR_DELETED, handleUpdate);

      // Oda işlemleri
      eventEmitter.off(EVENTS.ROOM_ADDED, handleUpdate);
      eventEmitter.off(EVENTS.ROOM_RENAMED, handleUpdate);
      eventEmitter.off(EVENTS.ROOM_DELETED, handleUpdate);
    };
  }, []);

  const handleSubmenuToggle = (itemKey: string, level: number) => {
    setOpenSubmenus((prev) => {
      // Eğer zaten açıksa, kapat
      if (prev.includes(itemKey)) {
        return prev.filter((key) => key !== itemKey);
      } 
      
      // Değilse, aynı seviyedeki diğer menüleri kapat ve bunu aç
      const newOpenSubmenus = [...prev];
      
      // Eğer level 0 ise (ana binalar seviyesi), diğer tüm binaları kapat
      if (level === 0) {
        // Level 0 olan tüm menüleri ve onların alt menülerini kapat
        const levelZeroItems = prev.filter(key => key.startsWith('0-'));
        levelZeroItems.forEach(key => {
          // Bu level 0 menüsünü ve tüm alt menülerini kaldır
          newOpenSubmenus.splice(newOpenSubmenus.indexOf(key), 1);
          
          // Alt menüleri de kaldır (1-X, 2-X gibi)
          const childItemsToRemove = newOpenSubmenus.filter(childKey => 
            childKey.startsWith(`1-`) && childKey.includes(key.split('-')[1])
          );
          childItemsToRemove.forEach(childKey => {
            newOpenSubmenus.splice(newOpenSubmenus.indexOf(childKey), 1);
          });
        });
      } else {
        // Alt seviyeler için, aynı seviyedeki ve aynı üst menüye ait diğer menüleri kapat
        const [currentLevel, currentIndex] = itemKey.split('-').map(Number);
        
        // Aynı seviyedeki ve aynı üst menüye ait diğer menüleri bul ve kapat
        const siblingItems = prev.filter(key => {
          const [keyLevel, keyIndex] = key.split('-').map(Number);
          return keyLevel === currentLevel && keyIndex !== currentIndex && 
                 key.startsWith(`${currentLevel}-`);
        });
        
        siblingItems.forEach(key => {
          newOpenSubmenus.splice(newOpenSubmenus.indexOf(key), 1);
        });
      }
      
      // Yeni menüyü aç
      newOpenSubmenus.push(itemKey);
      return newOpenSubmenus;
    });
  };

  const handleToggle = () => {
    if (window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  const renderMenuItems = (items: NavItem[] = [], level = 0) => {
    return items.map((item, index) => {
      const hasSubItems = item.subItems && item.subItems.length > 0;
      const isActiveItem = item.path ? isActive(item.path) : false;
      const itemKey = `${level}-${index}`;

      return (
        <div key={itemKey} className="relative w-full">
          <div className="flex items-center w-full">
            {item.path ? (
              <Link
                href={item.path}
                className={`flex-1 flex items-center px-4 py-3 text-sm rounded-lg transition-colors w-full ${isActiveItem
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  } ${level > 0 ? 'pl-8' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {item.icon && <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>}
                  {<span className="truncate">{item.name}</span>}
                </div>
              </Link>
            ) : (
              <div className={`flex-1 flex items-center px-4 py-3 text-sm rounded-lg transition-colors w-full ${isActiveItem
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                } ${level > 0 ? 'pl-8' : ''}`}>
                <div className="flex items-center gap-3">
                  {item.icon && <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>}
                  {<span className="truncate">{item.name}</span>}
                </div>
              </div>
            )}

            {hasSubItems && isExpanded && (
              <button
                onClick={() => handleSubmenuToggle(itemKey, level)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex-shrink-0"
              >
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${openSubmenus.includes(itemKey) ? 'rotate-180' : ''
                  }`} />
              </button>
            )}
          </div>

          {hasSubItems && isExpanded && (
            <div className={`overflow-hidden transition-all duration-300 w-full ${openSubmenus.includes(itemKey) ? 'max-h-screen' : 'max-h-0'
              }`}>
              <div className="pl-4 w-full">
                {renderMenuItems(item.subItems, level + 1)}
              </div>
            </div>
          )}
        </div>
      );
    });
  };



  // Sayfa değiştiğinde alt menüleri otomatik açmak için pathname'i izleyen bir useEffect
  useEffect(() => {
    // Mevcut URL'ye göre hangi menülerin açık olması gerektiğini belirle
    const newOpenSubmenus: string[] = [];

    const checkItemsForPath = (items: NavItem[] = [], level = 0) => {
      items.forEach((item, index) => {
        const itemKey = `${level}-${index}`;
        const hasSubItems = item.subItems && item.subItems.length > 0;

        // Bu öğe aktif mi kontrol et
        const isActiveItem = item.path ? isActive(item.path) : false;

        // Alt öğeleri kontrol et
        if (hasSubItems) {
          // Alt öğelerde aktif olan var mı veya alt öğelerin alt öğelerinde aktif olan var mı kontrol et
          const hasActiveChildRecursive = (items: NavItem[] = []): boolean => {
            for (const subItem of items) {
              // Bu alt öğe aktif mi?
              if (subItem.path && isActive(subItem.path)) {
                return true;
              }

              // Bu alt öğenin alt öğeleri var mı ve onlarda aktif olan var mı?
              if (subItem.subItems && subItem.subItems.length > 0) {
                if (hasActiveChildRecursive(subItem.subItems)) {
                  return true;
                }
              }
            }
            return false;
          };

          // Eğer kendisi aktifse veya alt öğelerinde (herhangi bir seviyede) aktif olan varsa menüyü aç
          const hasActiveChildDeep = hasActiveChildRecursive(item.subItems);

          if (isActiveItem || hasActiveChildDeep) {
            newOpenSubmenus.push(itemKey);
          }

          // Alt öğeleri de kontrol et
          checkItemsForPath(item.subItems, level + 1);
        }
      });
    };

    // Ana menü öğelerini kontrol et
    checkItemsForPath(navItems, 0);

    // Bina menü öğelerini kontrol et
    const buildingItems = getBuildingMenuItems(user, buildings, isAdmin ?? false);
    checkItemsForPath(buildingItems, 0);

    // Açık menüleri güncelle
    setOpenSubmenus(newOpenSubmenus);

  }, [pathname, navItems, buildings, user, isAdmin, isActive, getBuildingMenuItems]);

  

  // Koşullu render için kontrol
  if (isAuthLoading) {
    return <Spinner variant="bars" fullPage />
  }


  return (
    <aside
      className={`fixed flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-99999 border-r border-gray-200 
        ${isExpanded || isMobileOpen
          ? "w-[390px]"
          : isHovered
            ? "w-[390px]"
            : "w-[90px]"
        }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(false)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`py-4 flex flex-row  items-center w-full ${!isExpanded && !isHovered ? "lg:justify-center" : "justify-between"
          }`}
      >
        {isExpanded || isHovered || isMobileOpen ? (
          <div className="w-full flex items-center">
            <EditableTitle className="flex-1" defaultTitle="Admin" />
          </div>
        ) : (
          null
          // <Image
          //   className="max-h-16"
          //   src="/images/logo/logo-icon.svg"
          //   alt="Logo"
          //   width={32}
          //   height={32}
          // />
        )}
        <button
          className="items-center justify-center w-10 h-10 text-gray-500 border-gray-200 rounded-lg z-99999 dark:border-gray-800 flex dark:text-gray-400 lg:h-11 lg:w-11 border"
          onClick={handleToggle}
          aria-label="Toggle Sidebar"
        >
          {isMobileOpen || isExpanded || isHovered ? (
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg
              width="16"
              height="12"
              viewBox="0 0 16 12"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M0.583252 1C0.583252 0.585788 0.919038 0.25 1.33325 0.25H14.6666C15.0808 0.25 15.4166 0.585786 15.4166 1C15.4166 1.41421 15.0808 1.75 14.6666 1.75L1.33325 1.75C0.919038 1.75 0.583252 1.41422 0.583252 1ZM0.583252 11C0.583252 10.5858 0.919038 10.25 1.33325 10.25L14.6666 10.25C15.0808 10.25 15.4166 10.5858 15.4166 11C15.4166 11.4142 15.0808 11.75 14.6666 11.75L1.33325 11.75C0.919038 11.75 0.583252 11.4142 0.583252 11ZM1.33325 5.25C0.919038 5.25 0.583252 5.58579 0.583252 6C0.583252 6.41421 0.919038 6.75 1.33325 6.75L7.99992 6.75C8.41413 6.75 8.74992 6.41421 8.74992 6C8.74992 5.58579 8.41413 5.25 7.99992 5.25L1.33325 5.25Z"
                fill="currentColor"
              />
            </svg>
          )}
          {/* Cross Icon */}
        </button>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar justify-between h-full">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-1 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "justify-start"
                  }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(getMainMenuItems(user, isAdmin))}
              <h2
                className={`mb-1 mt-8 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded && !isHovered
                  ? "lg:justify-center"
                  : "justify-start"
                  }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Buildings"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(getBuildingMenuItems(user, buildings, isAdmin))}
            </div>
            {/* <div className="">
              <h2
                className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${
                  !isExpanded && !isHovered
                    ? "lg:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Others"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(othersItems)}
            </div> */}
          </div>
        </nav>
        {license && (
          <div className="mt-6 mb-6 flex flex-col">
            <Typography variant="h5" className="text-gray-500">License Info:</Typography>
            <Typography variant="small" className="text-gray-500">License max devices: {license.maxDevices}</Typography>
            <Typography variant="small" className="text-gray-500">Used devices: {license.usedAnalyzers}</Typography>
            <GhostButton
              onClick={() => router.push('/update-license')}
              className="mt-2"
            >
              Update License
            </GhostButton>
          </div>
        )}
        {/* {isExpanded || isHovered || isMobileOpen ? null : null} */}
      </div>
    </aside>
  );
};

export default AppSidebar;
