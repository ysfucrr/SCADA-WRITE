"use client";
import { DnDProvider } from '@/components/flow/DnDContext';
import { User } from 'lucide-react';
import { use, useEffect, useState } from "react";
import {
    ReactFlowProvider
} from 'reactflow';


import PageBreadCrumb from '@/components/common/PageBreadCrumb';
import { UnitFlow } from '@/components/flow/FlowComponent';
import { Spinner } from '@/components/ui/spinner';
import { Heading3, Paragraph } from '@/components/ui/typography';
import { useAuth } from '@/hooks/use-auth';
import { usePathname, useRouter } from 'next/navigation';
import 'reactflow/dist/style.css';



export default function BuildingPage({ params }: { params: Promise<{ building: string, floor: string, room: string }> }) {
    const [pageTitle, setPageTitle] = useState('');
    const { building, floor, room }: { building: string, floor: string, room: string } = use(params)
    const [buildings, setBuildings] = useState<any[]>([]);
    const { user, isLoading, isAdmin } = useAuth();
    const pathname = usePathname();
    const router = useRouter();


    const fetchBuildings = async () => {
        try {
            const response = await fetch('/api/units');
            const data = await response.json();
            setBuildings(data.buildings);
        } catch (error) {
            console.error('Error fetching buildings:', error);
        }
    };
    useEffect(() => {
        fetchBuildings();
    }, []);


    const getSelectedItemName = async () => {
        //console.log("getSelectedItemName", await params)
        const navigationUrl = (await params).building + "/" + (await params).floor + "/" + (await params).room;

        // URL'den ID'leri ayıkla
        const parts = navigationUrl.split('/').filter(p => p);

        if (parts.length === 0) return "";

        // Bina ID'si
        const buildingId = parts[0];
        const building = buildings.find(b => b._id === buildingId || b.id === buildingId);

        if (!building) return "";

        // Sadece bina seçilmişse
        if (parts.length === 1) return building.name;

        // Kat ID'si
        const floorId = parts[1];
        const floor = building.floors.find((f: any) => f._id === floorId || f.id === floorId);
        //console.log("floor", floor)
        if (!floor) return building.name;

        // Sadece kat seçilmişse
        if (parts.length === 2) return `${building.name} > ${floor.name}`;

        // Oda ID'si
        const roomId = parts[2];
        //console.log("room id", roomId)
        //console.log("floor", floor)
        const room = floor.rooms.find((r: any) => r._id === roomId || r.id === roomId);
        //console.log("room", room)   
        if (!room) return `${building.name} > ${floor.name}`;

        return `${building.name} > ${floor.name} > ${room.name}`;
    };

    useEffect(() => {
        async function getPageTitle() {
            const title = await getSelectedItemName();
            setPageTitle(title);
        }
        getPageTitle();
    }, [params, buildings]);
    if (isLoading) {
        return <Spinner variant="bars" fullPage />
    }


    return (
        <div className="flex flex-col h-full">
            <PageBreadCrumb pageTitle={pageTitle} />
            <ReactFlowProvider>
                <DnDProvider>
                    <UnitFlow building={building} floor={floor} room={room} />
                </DnDProvider>
            </ReactFlowProvider>
        </div>
    );
}