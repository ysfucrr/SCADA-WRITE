"use client"
import { useTheme } from "@/context/ThemeContext"
import { useAuth } from "@/hooks/use-auth"
import { FullscreenIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import ReactFlow, { Background, BackgroundVariant, Controls, Node, ReactFlowInstance, useEdgesState, useNodes, useNodesState } from "reactflow"
import { showConfirmAlert, showErrorAlert, showToast } from "../ui/alert"
import ConnectionStatus from "../ui/ConnectionStatus"
import BackgroundModal from "./BackgroundModal"
import { useDnD } from "./DnDContext"
import { FlowToolbar } from "./FlowToolbar"
import ImageModal from "./ImageModal"
import ImageNode from "./ImageNode"
import RegisterModal from "./RegisterModal"
import RegisterNodeFactory from "./RegisterNodeFactory"
import TextModal from "./TextModal"
import TextNode from "./TextNode"
import WorkAreaBoundary from "./WorkAreaBoundary"

const xMin = -1920
const yMin = -1080
const xMax = 1920
const yMax = 1080
const groupZIndex = 1000
const imageZIndex = 2000
const registerZIndex = 3000
const textZIndex = 4000

const nodeTypes = {
    // groupNode: memo(GroupNode),
    textNode: memo(TextNode),
    imageNode: memo(ImageNode),
    registerNode: memo(RegisterNodeFactory),
} as const;


let alertDialogOpen = false
// Global değişken: Uygulama genelinde tam ekran durumunu takip etmek için
let lastFullscreenState = false;

export function UnitFlow({ building, floor, room }: { building: string, floor?: string, room?: string }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isPageVisible, setIsPageVisible] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);
    const [forceFullscreen, setForceFullscreen] = useState(false); // Tam ekranı zorlamak için
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const currentNodes = useNodes();
    const [isDraging, setIsDraging] = useState(false);
    // Sürükleme işleminin durumunu takip etmek için ref
    const isDraggingRef = useRef(false);
    const { user, isAdmin, isLoading: isAuthLoading } = useAuth();
    const [isPanning, setIsPanning] = useState(false);

    // Güncel node'ları takip etmek için bir ref kullanıyoruz
    const nodesRef = useRef<Node[]>([]);
    const nodeDragStartPosRef = useRef<{ x: number, y: number } | null>(null);
    // React Flow wrapper ref
    const reactFlowWrapper = useRef<HTMLDivElement>(null);

    const [isEditingNode, setIsEditingNode] = useState(false);
    const [editingNode, setEditingNode] = useState<Node | undefined>(undefined);


    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [isTextModalOpen, setIsTextModalOpen] = useState(false);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
    const [showGrids, setShowGrids] = useState(true);
    const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
    const [backgroundOpacity, setBackgroundOpacity] = useState<number>(100);
    const [backgroundColor, setBackgroundColor] = useState<string>('');
    const [isBackgroundModalOpen, setIsBackgroundModalOpen] = useState<boolean>(false);
    const [nodesLoaded, setNodesLoaded] = useState<boolean>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { isFullScreen, setIsFullScreen } = useTheme();
    // Helper line states for snapping
    interface HelperLineState {
        vertical: number | null;
        horizontal: number | null;
    }
    const [helperLines, setHelperLines] = useState<HelperLineState>({ vertical: null, horizontal: null });
    const snapThreshold = 5; // Snapping threshold in pixels
    // const onConnect = useCallback((params: Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

    // DnD için gerekli olan nodeType'ı almak için useDnD hook'unu kullanıyoruz
    const { nodeType, setNodeType } = useDnD();

    useEffect(() => {
        //console.log("isFullScreen in flow", isFullScreen)
        //console.log("containerRef", containerRef)
        //console.log("reactFlowInstance", reactFlowInstance)
        // setIsFullScreen(isFullScreen);
        if (isFullScreen && containerRef.current && reactFlowInstance.current) {
            // Tam ekran geçişleri için try-catch kullan
            try {
                // Önce tam ekrana geçmeyi dene
                const requestFullscreen = async () => {
                    try {
                        // Kullanıcının etkinleştirdiği tam ekran durumunda, tarayıcı izin verecektir
                        await containerRef.current!.requestFullscreen();
                        console.log("Fullscreen enabled successfully");
                    } catch (error) {
                        // Eğer tam ekrana geçiş başarısız olursa, hata mesajını göster ama uygulamayı çalıştırmaya devam et
                        console.warn("Fullscreen request failed, continuing without fullscreen:", error);
                        // Tam ekran durumunu false olarak ayarla ki kullanıcı diğer sayfaları kullanabilsin
                        setIsFullScreen(false);
                        sessionStorage.setItem('isFullScreen', 'false');
                    }


                    // Tam ekran başarılı veya başarısız olsa da, görünümü ayarla
                    if (reactFlowInstance.current) {
                        console.log("Adjusting view bounds");
                        setTimeout(() => {
                            reactFlowInstance.current!.fitBounds({
                                x: xMin,
                                y: yMin,
                                width: xMax - xMin,
                                height: yMax - yMin,
                            });
                        }, 100);
                    }
                };
                
                // Tam ekran fonksiyonunu çağır
                requestFullscreen();
            } catch (outerError) {
                // Genel bir hata durumunda
                console.error("General error in fullscreen handling:", outerError);
                setIsFullScreen(false);
                sessionStorage.setItem('isFullScreen', 'false');
                
                // Yine de görünümü ayarla
                if (reactFlowInstance.current) {
                    setTimeout(() => {
                        reactFlowInstance.current!.fitBounds({
                            x: xMin,
                            y: yMin,
                            width: xMax - xMin,
                            height: yMax - yMin,
                        });
                    }, 100);
                }
            }
        }
        setIsPanning(true); // Enable panning for all users
    }, [containerRef.current, isFullScreen, reactFlowInstance.current, isAdmin]);
    const saveFlowData = async (newBackgroundImage?: string | null, newOpacity?: number, newBackgroundColor?: string, clearBackground: boolean = false) => {
        if (!user || user.role != "admin") return;
        if (isDraging) return;
        if (alertDialogOpen) return;
        try {

            // Ref'ten güncel node değerlerini al
            const nodesToProcess = nodesRef.current;
            // if (!nodesLoaded && nodesToProcess.length == 0) return
            // Düğümleri kaydetmeden önce onEdit fonksiyonlarını kaldır
            const nodesToSave: any = nodesToProcess.map(node => {
                const { data, ...rest }: any = node;
                if (data) {
                    const { onEdit, onDelete, ...restData }: any = data;
                    return { ...rest, data: restData };
                }
                return node;
            });
            //console.log("nodesToSave", nodesToSave)
            if (room) {
                console.log("room", {
                    _id: room,
                    flowData: {
                        nodes: nodesToSave,
                        edges,
                        flowBackground: clearBackground ? null : newBackgroundImage || backgroundImage,
                        backgroundOpacity: clearBackground ? 100 : newOpacity !== undefined ? newOpacity : backgroundOpacity,
                        backgroundColor: clearBackground ? '' : newBackgroundColor !== undefined ? newBackgroundColor : backgroundColor,
                    }
                })
                const response = await fetch(`/api/units/${building}/floors/${floor}/rooms`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        _id: room,
                        flowData: {
                            nodes: nodesToSave,
                            edges,
                            flowBackground: clearBackground ? null : newBackgroundImage || backgroundImage,
                            backgroundOpacity: clearBackground ? 100 : newOpacity !== undefined ? newOpacity : backgroundOpacity,
                            backgroundColor: clearBackground ? '' : newBackgroundColor !== undefined ? newBackgroundColor : backgroundColor,
                        }
                    })
                });

                if (!response.ok) {
                    showToast('Room data saving failed', 'error');
                    throw new Error('Failed to save flow data');
                }
                setNodesLoaded(true)

            } else if (floor) {
                console.log("trying to save floor")
                const response = await fetch(`/api/units/${building}/floors`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        _id: floor,
                        flowData: {
                            nodes: nodesToSave,
                            edges,
                            flowBackground: clearBackground ? null : newBackgroundImage || backgroundImage,
                            backgroundOpacity: clearBackground ? 100 : newOpacity !== undefined ? newOpacity : backgroundOpacity,
                            backgroundColor: clearBackground ? '' : newBackgroundColor !== undefined ? newBackgroundColor : backgroundColor,
                        }
                    })
                });
                if (!response.ok) {
                    showToast('Floor data saving failed', 'error');
                    throw new Error('Failed to save flow data');
                }
                setNodesLoaded(true)
                
            } else {
                //console.log("trying to save building")
                console.log({
                    _id: building,
                    flowData: {
                        nodes: nodesToSave,
                        edges,
                        flowBackground: clearBackground ? null : newBackgroundImage || backgroundImage,
                        backgroundOpacity: clearBackground ? 100 : newOpacity !== undefined ? newOpacity : backgroundOpacity,
                        backgroundColor: clearBackground ? '' : newBackgroundColor !== undefined ? newBackgroundColor : backgroundColor,
                    }
                })
                const response = await fetch(`/api/units`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },

                    body: JSON.stringify({
                        _id: building,
                        flowData: {
                            nodes: nodesToSave,
                            edges,
                            flowBackground: clearBackground ? null : newBackgroundImage || backgroundImage,
                            backgroundOpacity: clearBackground ? 100 : newOpacity !== undefined ? newOpacity : backgroundOpacity,
                            backgroundColor: clearBackground ? '' : newBackgroundColor !== undefined ? newBackgroundColor : backgroundColor,
                        }
                    })
                });
                if (!response.ok) {
                    if (response.status != 403) {
                        showToast('Building data saving failed', 'error');
                        throw new Error('Failed to save flow data');
                    }
                }
                setNodesLoaded(true)
               
            }

        } catch (error) {
            console.error('Error saving flow data:', error);
            showToast('Building data saving failed', 'error');
        }
    };

    const handleSave = () => saveFlowData();

    const handleToggleGrid = () => setShowGrids(!showGrids);

    const handleSetBackground = () => {
        setIsBackgroundModalOpen(true);
    };

    const handleBackgroundConfirm = (backgroundData: { type: string; color?: string; image?: string; opacity: number }) => {
        //console.log("background data : ", backgroundData);
        if (backgroundData.type === 'image' && backgroundData.image) {
            setBackgroundColor('');
            setBackgroundImage(backgroundData.image);
            setBackgroundOpacity(backgroundData.opacity);
            // Yeni dosya yolunu doğrudan saveFlowData'ya parametre olarak geçir
            saveFlowData(backgroundData.image, backgroundData.opacity);
            showToast('Background image set successfully', 'success');
        } else if (backgroundData.type === 'color' && backgroundData.color) {
            setBackgroundImage('');
            setBackgroundColor(backgroundData.color);
            setBackgroundOpacity(backgroundData.opacity);
            // Renk bilgisini saveFlowData'ya parametre olarak geçir
            saveFlowData('', backgroundData.opacity, backgroundData.color);
            showToast('Background color set successfully', 'success');
        }
    };

    const handleRemoveBackground = () => {
        // Arka plan resmini kaldır
        alertDialogOpen = true;
        showConfirmAlert(
            "Remove background image?",
            "Are you sure you want to remove the background image?",
            "Yes",
            "Cancel",
        ).then(async (result) => {
            if (result.isConfirmed) {
                if (backgroundImage) {
                    const deleteResponse = await fetch('/api/upload', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filePath: backgroundImage })
                    });
                    if (!deleteResponse.ok) {
                        throw new Error('Failed to delete image');
                    }
                }
                alertDialogOpen = false;
                setBackgroundImage(null);
                setBackgroundColor('');
                setBackgroundOpacity(100);

                // null değerini veritabanına kaydet
                saveFlowData(null, 100, '', true);
                showToast('Background image removed', 'success');
            }
            alertDialogOpen = false;
        });
    };
    // Basitleştirilmiş tam ekran yönetimi - gerçek tam ekran + görüntü stilini birlikte kullanır
    const handleToggleFullscreen = () => {
        // Önce içeriği gizle
        setIsPageVisible(false);
        
        if (document.fullscreenElement || forceFullscreen) {
            // Tam ekrandan çıkma
            try {
                // Gerçek tam ekrandan çıkmayı dene
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
                
                // Global değişkeni ve depolamayı güncelle
                lastFullscreenState = false;
                sessionStorage.setItem('isFullScreen', 'false');
                
                // State'leri güncelle
                setForceFullscreen(false);
                setIsFullScreen(false);
                
                // Görünümü yeniden ayarla
                if (reactFlowInstance.current) {
                    setTimeout(() => {
                        reactFlowInstance.current!.fitBounds({
                            x: xMin,
                            y: yMin,
                            width: xMax - xMin,
                            height: yMax - yMin,
                        });
                        // İçeriği yeniden göster
                        setTimeout(() => {
                            setIsPageVisible(true);
                        }, 100);
                    }, 100);
                } else {
                    setIsPageVisible(true);
                }
            } catch (error) {
                console.warn("Error toggling fullscreen:", error);
                setIsPageVisible(true);
            }
        } else {
            // Tam ekrana geçme
            try {
                // Gerçek tam ekrana geçmeyi dene
                if (containerRef.current) {
                    containerRef.current.requestFullscreen().catch(err => {
                        console.warn("Fullscreen API failed:", err);
                        // Gerçek tam ekran başarısız olsa bile UI'yı tam ekran gibi göster
                    });
                }
                
                // Global değişkeni ve depolamayı güncelle
                lastFullscreenState = true;
                sessionStorage.setItem('isFullScreen', 'true');
                
                // State'leri güncelle
                setForceFullscreen(true);
                setIsFullScreen(true);
                
                // Görünümü ayarla
                if (reactFlowInstance.current) {
                    setTimeout(() => {
                        reactFlowInstance.current!.fitBounds({
                            x: xMin,
                            y: yMin,
                            width: xMax - xMin,
                            height: yMax - yMin,
                        });
                        // İçeriği göster
                        setTimeout(() => {
                            setIsPageVisible(true);
                        }, 100);
                    }, 100);
                } else {
                    setIsPageVisible(true);
                }
            } catch (error) {
                console.error("Error toggling fullscreen:", error);
                setIsPageVisible(true);
            }
        }
    }

    // Tam ekrandan çıkıldığını tespit etmek için event listener
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement && reactFlowInstance.current) {
                // Tam ekrandan çıkıldığında fitBounds çağır
                sessionStorage.setItem('isFullScreen', 'false');
                setIsFullScreen(false);
                setTimeout(() => {
                    reactFlowInstance.current!.fitBounds({
                        x: xMin,
                        y: yMin,
                        width: xMax - xMin,
                        height: yMax - yMin,
                    });
                }, 100);
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    // Sürükle-bırak işlemi için onDragOver fonksiyonu
    const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    // Sürükle-bırak işlemi için onDrop fonksiyonu
    const onDrop = useCallback(
        (event: React.DragEvent<HTMLDivElement>) => {
            event.preventDefault();

            // Eğer sürüklenen öğe geçerli değilse işlemi durdur
            if (!nodeType || !reactFlowInstance.current) {
                return;
            }

            // Fare pozisyonunu React Flow koordinat sistemine dönüştür
            const position = reactFlowInstance.current.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });
            //console.log("node type: ", nodeType)
            switch (nodeType) {
                case 'textNode':
                    setIsEditingNode(false);
                    setIsTextModalOpen(true);
                    sessionStorage.setItem('newNodePosition', JSON.stringify(position));
                    break;
                case 'imageNode':
                    setIsEditingNode(false);
                    setIsImageModalOpen(true);
                    sessionStorage.setItem('newNodePosition', JSON.stringify(position));
                    break;
                case 'registerNode':
                    setIsEditingNode(false);
                    setIsRegisterModalOpen(true);
                    sessionStorage.setItem('newNodePosition', JSON.stringify(position));
                    break;
                default:
                    break;
            }
            // İşlem tamamlandığında nodeType'ı temizle
            setNodeType(null);
        },
        [nodeType, reactFlowInstance, setNodeType, setIsEditingNode, setIsGroupModalOpen]
    );




    const handleEditGroup = (node: Node) => {

        console.log('Found node:', node);

        if (node && node.data) {
            //console.log('Node found, opening modal with data:', node.data);
            setEditingNode(node);
            setIsEditingNode(true);
            // setGroupModalInitialData(node.data);
            setIsGroupModalOpen(true);
        } else {
            console.error('Node not found for editing:', node.id);
        }
    };
    const handleDeleteGroup = (node: Node) => {
        console.log("on delete group")
        alertDialogOpen = true;
        showConfirmAlert(
            "Delete group?",
            "Are you sure you want to delete this group?",
            "Yes",
            "Cancel",
        ).then((result) => {
            if (result.isConfirmed) {
                setNodes((nds) => nds.filter(n => n.parentId !== node.id && n.id !== node.id));
            }
            alertDialogOpen = false;
        });
    }

    const handleEditText = (node: Node) => {
        if (node && node.data) {
            //console.log('Node found, opening modal with data:', node);
            setEditingNode(node);
            setIsEditingNode(true);
            setIsTextModalOpen(true);
        } else {
            console.error('Node not found for editing:', node.id);
        }
    };

    const handleDeleteText = (node: Node) => {
        alertDialogOpen = true;
        showConfirmAlert(
            "Delete text?",
            "Are you sure you want to delete this text?",
            "Yes",
            "Cancel",
        ).then((result) => {
            if (result.isConfirmed) {
                setNodes((nds) => nds.filter(n => n.id !== node.id));
            }
            alertDialogOpen = false;
        });
    }

    const handleTextConfirm = (updatedNode: Node) => {
        //console.log('Updated node:', updatedNode);
        if (editingNode) {
            // Mevcut text düğümünü güncelle
            setNodes(nds => nds.map(node => {
                if (node.id === editingNode.id) {
                    return {
                        ...node,
                        width: updatedNode.width,
                        height: updatedNode.height,
                        zIndex: textZIndex,
                        style: {
                            ...updatedNode.style,
                            zIndex: textZIndex,
                            width: updatedNode.width || 150,
                            height: updatedNode.height || 80,
                        },
                        data: {
                            ...updatedNode.data,
                            onEdit: isAdmin ? () => {
                                handleEditText(updatedNode);
                            } : undefined,
                            onDelete: isAdmin ? () => {
                                handleDeleteText(updatedNode);
                            } : undefined
                        }
                    };
                }
                return node;
            }));
        } else {
            // Yeni text node'u oluştur
            const newNodeId = `text-${Date.now()}`;

            // Sürükle-bırak işleminden gelen pozisyonu al veya varsayılan pozisyonu kullan
            let position = { x: 100, y: 100 };
            const savedPosition = sessionStorage.getItem('newNodePosition');

            if (savedPosition) {
                try {
                    position = JSON.parse(savedPosition);
                    // Kullanıldıktan sonra sessionStorage'dan temizle
                    sessionStorage.removeItem('newNodePosition');
                } catch (error) {
                    console.error('Pozisyon bilgisi çözümlenemedi:', error);
                }
            }

            const newNode: Node = {
                id: newNodeId,
                type: 'textNode',
                position: position,
                zIndex: textZIndex,
                width: updatedNode.width,
                height: updatedNode.height,
                style: {
                    ...updatedNode.style,
                    width: updatedNode.width || 150,
                    height: updatedNode.height || 80,
                },
                data: {
                    ...updatedNode.data,
                    onEdit: isAdmin ? () => {
                        handleEditText(newNode);
                    } : undefined,
                    onDelete: isAdmin ? () => {
                        handleDeleteText(newNode);
                    } : undefined
                }
            };

            setNodes(nds => {
                const newNodes = [...nds, newNode];
                return newNodes;
            });
        }

        // Modal'ı kapat
        setIsTextModalOpen(false);
        setEditingNode(undefined);
        // saveFlowData();
    };


    const handleEditImage = (node: Node) => {
        if (node && node.data) {
            //console.log('Node found, opening modal with data:', node.data);
            setEditingNode(node);
            setIsEditingNode(true);
            setIsImageModalOpen(true);
        } else {
            console.error('Node not found for editing:', node.id);
        }
    };

    const handleDeleteImage = (node: Node) => {
        alertDialogOpen = true;
        showConfirmAlert(
            "Delete image?",
            "Are you sure you want to delete this image?",
            "Yes",
            "Cancel",
        ).then(async (result) => {
            if (result.isConfirmed) {
                console.log("node deleted", node.data)
                if (node.data.backgroundImage) {
                    const image = node.data.backgroundImage;
                    const imageId = image.split('/').pop();
                    if (imageId) {
                        const deleteResponse = await fetch('/api/upload', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filePath: imageId })
                        });
                        if (!deleteResponse.ok) {
                            throw new Error('Failed to delete image');
                        }
                    }
                }
                setNodes((nds) => nds.filter(n => n.id !== node.id));
            }
            alertDialogOpen = false;
        });
    }

    const handleImageConfirm = (updatedNode: Node) => {
        //console.log('Updated node:', updatedNode);
        if (editingNode) {
            // Mevcut grup düğümünü güncelle
            setNodes(nds => nds.map(node => {
                if (node.id === editingNode.id) {
                    return {
                        ...node,
                        width: updatedNode.width,
                        height: updatedNode.height,
                        zIndex: imageZIndex,
                        style: {
                            ...updatedNode.style,
                            zIndex: imageZIndex,
                            width: updatedNode.width || 150,
                            height: updatedNode.height || 80,
                        },

                        data: {
                            ...updatedNode.data,
                            opacity: updatedNode.data.opacity,
                            backgroundColor: updatedNode.data.backgroundColor,
                            backgroundImage: updatedNode.data.backgroundImage,
                            onEdit: isAdmin ? () => {
                                handleEditImage(updatedNode);
                            } : undefined,
                            onDelete: isAdmin ? () => {
                                handleDeleteImage(updatedNode);
                            } : undefined
                        }
                    };
                }
                return node;
            }));
        } else {
            // Yeni grup node'u oluştur
            const newGroupId = `image-${Date.now()}`;
            // Sürükle-bırak işleminden gelen pozisyonu al veya varsayılan pozisyonu kullan
            let position = { x: 100, y: 100 };
            const savedPosition = sessionStorage.getItem('newNodePosition');

            if (savedPosition) {
                try {
                    position = JSON.parse(savedPosition);
                    // Kullanıldıktan sonra sessionStorage'dan temizle
                    sessionStorage.removeItem('newNodePosition');
                } catch (error) {
                    console.error('Pozisyon bilgisi çözümlenemedi:', error);
                }
            }

            const newImageNode: Node = {
                ...updatedNode,
                id: newGroupId,
                type: 'imageNode',
                position: position,
                width: updatedNode.width,
                height: updatedNode.height,
                zIndex: imageZIndex,
                style: {
                    ...updatedNode.style,
                    width: updatedNode.width || 150,
                    height: updatedNode.height || 80,
                    zIndex: imageZIndex
                },
                data: {
                    ...updatedNode.data,
                    opacity: updatedNode.data.opacity,
                    backgroundColor: updatedNode.data.backgroundColor,
                    backgroundImage: updatedNode.data.backgroundImage,
                    onEdit: isAdmin ? () => {
                        handleEditImage(newImageNode);
                    } : undefined,
                    onDelete: isAdmin ? () => {
                        handleDeleteImage(newImageNode);
                    } : undefined
                }
            };

            //console.log('Created new image node:', newImageNode);

            setNodes(nds => {
                const newNodes = [...nds, newImageNode];
                return newNodes;
            });
        }

        // Modal'ı kapat
        setIsImageModalOpen(false);
        setEditingNode(undefined);
    };

    const handleEditRegister = (node: Node) => {
        if (node && node.data) {
            //console.log('Node found, opening modal with data:', node);
            setEditingNode(node);
            setIsEditingNode(true);
            setIsRegisterModalOpen(true);
        } else {
            console.error('Node not found for editing:', node.id);
        }
    };
    const handleDeleteRegister = async (node: Node) => {
        const trendLogs = await fetch(`/api/trend-logs`);
        const trendLogsData = await trendLogs.json();
        const trendLog = trendLogsData.find((tl: any) => tl.registerId === node.id);
        if (trendLog) {
            showErrorAlert("This register is used in trend logs");
            return;
        }

        alertDialogOpen = true;
        const result = await showConfirmAlert(
            "Delete register?",
            "Are you sure you want to delete this register?",
            "Yes",
            "Cancel",
        );
        if (result.isConfirmed) {
            await fetch(`/api/registers/${node.id}`, {
                method: 'DELETE',
                body: JSON.stringify({ ...node }),
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            // Delete boolean register icons (read)
            if (node.data.onIcon) {
                console.log('Deleting ON icon:', node.data.onIcon);
                const deleteResponse = await fetch('/api/upload', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: node.data.onIcon.split('/').pop() })
                });
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete ON icon');
                }
                console.log('ON icon deleted successfully');
            }
            if (node.data.offIcon) {
                console.log('Deleting OFF icon:', node.data.offIcon);
                const deleteResponse = await fetch('/api/upload', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: node.data.offIcon.split('/').pop() })
                });
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete OFF icon');
                }
                console.log('OFF icon deleted successfully');
            }

            // Delete write boolean control icons
            if (node.data.writeOnIcon) {
                console.log('Deleting Write ON icon:', node.data.writeOnIcon);
                const deleteResponse = await fetch('/api/upload', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: node.data.writeOnIcon.split('/').pop() })
                });
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete Write ON icon');
                }
                console.log('Write ON icon deleted successfully');
            }
            if (node.data.writeOffIcon) {
                console.log('Deleting Write OFF icon:', node.data.writeOffIcon);
                const deleteResponse = await fetch('/api/upload', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: node.data.writeOffIcon.split('/').pop() })
                });
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete Write OFF icon');
                }
                console.log('Write OFF icon deleted successfully');
            }


            setNodes((nds) => nds.filter(n => n.id !== node.id));
        }
        alertDialogOpen = false;
    }

    const handleRegisterConfirm = (updatedNode: Node) => {
        //console.log("updated node:", updatedNode, editingNode);
        if (editingNode) {
            // Mevcut text düğümünü güncelle
            setNodes(nds => nds.map(node => {
                if (node.id === editingNode.id) {
                    return {
                        ...node,
                        width: updatedNode.width,
                        height: updatedNode.height,
                        style: {
                            ...updatedNode.style,
                            width: updatedNode.width || 150,
                            height: updatedNode.height || 80,
                        },
                        data: {
                            ...updatedNode.data,
                            onEdit: isAdmin ? () => {
                                handleEditRegister(updatedNode);
                            } : undefined,
                            onDelete: isAdmin ? () => {
                                handleDeleteRegister(updatedNode);
                            } : undefined
                        }
                    };
                }
                return node;
            }));
        } else {
            // Yeni text node'u oluştur
            const newNodeId = updatedNode.id;

            // Sürükle-bırak işleminden gelen pozisyonu al veya varsayılan pozisyonu kullan
            let position = { x: 100, y: 100 };
            const savedPosition = sessionStorage.getItem('newNodePosition');

            if (savedPosition) {
                try {
                    position = JSON.parse(savedPosition);
                    // Kullanıldıktan sonra sessionStorage'dan temizle
                    sessionStorage.removeItem('newNodePosition');
                } catch (error) {
                    console.error('Pozisyon bilgisi çözümlenemedi:', error);
                }
            }

            const newNode: Node = {
                ...updatedNode,
                id: newNodeId,
                type: 'registerNode',
                position: position,
                width: updatedNode.width ?? 300,
                height: updatedNode.height ?? 100,
                zIndex: registerZIndex,
                style: {
                    ...updatedNode.style,
                    width: updatedNode.width ?? 300,
                    height: updatedNode.height ?? 100,
                    zIndex: registerZIndex
                },
                data: {
                    ...updatedNode.data,
                    onEdit: isAdmin ? () => {
                        handleEditRegister(newNode);
                    } : undefined,
                    onDelete: isAdmin ? () => {
                        handleDeleteRegister(newNode);
                    } : undefined
                }
            };

            setNodes(nds => {
                const newNodes = [...nds, newNode];
                return newNodes;
            });
        }

        // Modal'ı kapat
        setIsRegisterModalOpen(false);
        setEditingNode(undefined);
    };

    const loadFlowData = async () => {
        try {
            //console.log('Loading flow data for unit:', building);
            setLoading(true);

            const response = await fetch(`/api/units/${building}`);
            console.log('API response status:', response.status);

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            console.log('Full API response:', data);

            if (room) {
                const roomData = data.building.floors.find((f: any) => f._id === floor).rooms.find((r: any) => r._id === room);
                if (!roomData) {
                    console.warn('No room data found for room:', room);
                    setNodes([

                    ]);
                    setEdges([]);
                    return;
                }
                const flowData = roomData.flowData;
                console.log('room Flow data:', flowData);
                if (!flowData) {
                    console.warn('No flowData in response');
                    setNodes([

                    ]);
                    setEdges([]);
                    return;
                }

                setBackgroundImage(flowData.flowBackground);
                setBackgroundOpacity(flowData.backgroundOpacity);
                setBackgroundColor(flowData.backgroundColor);
                const loadedNodes: Node[] = flowData.nodes.map((node: any) => {
                    const newNode = { ...node };

                    // Her node için güncel callback'leri ekle
                    switch (node.type) {
                        case 'textNode':
                            newNode.data = {
                                ...node.data,
                                onEdit: isAdmin ? () => handleEditText(node) : undefined,
                                onDelete: isAdmin ? () => handleDeleteText(node) : undefined
                            };
                            break;
                        case 'imageNode':
                            newNode.data = {
                                ...node.data,
                                onEdit: isAdmin ? () => handleEditImage(node) : undefined,
                                onDelete: isAdmin ? () => handleDeleteImage(node) : undefined
                            };
                            break;
                        case 'registerNode':
                            //console.log("Register node found: ", node);
                            newNode.data = {
                                ...node.data,
                                onEdit: isAdmin ? () => handleEditRegister(node) : undefined,
                                onDelete: isAdmin ? () => handleDeleteRegister(node) : undefined
                            };
                            break;
                        default:
                            break;
                    }
                    return newNode;
                });

                //console.log("Loaded nodes: ", loadedNodes);
                //console.log("Processed nodes: ", loadedNodes);
                setNodes(loadedNodes);
                //console.log('Flow data from API:', flowData);
            } else if (floor) {
                const floorData = data.building.floors.find((f: any) => f._id === floor);
                if (!floorData) {
                    console.warn('No floor data found for floor:', floor);
                    setNodes([

                    ]);
                    setEdges([]);
                    return;
                }
                const flowData = floorData.flowData;
                if (!flowData) {
                    console.warn('No flowData in response');
                    setNodes([

                    ]);
                    setEdges([]);
                    return;
                }
                setBackgroundImage(flowData.flowBackground);
                setBackgroundOpacity(flowData.backgroundOpacity);
                setBackgroundColor(flowData.backgroundColor);
                const loadedNodes: Node[] = flowData.nodes.map((node: any) => {
                    const newNode = { ...node };

                    // Her node için güncel callback'leri ekle
                    switch (node.type) {
                        case 'textNode':
                            newNode.data = {
                                ...node.data,
                                onEdit: isAdmin ? () => handleEditText(node) : undefined,
                                onDelete: isAdmin ? () => handleDeleteText(node) : undefined
                            };
                            break;
                        case 'imageNode':
                            newNode.data = {
                                ...node.data,
                                onEdit: isAdmin ? () => handleEditImage(node) : undefined,
                                onDelete: isAdmin ? () => handleDeleteImage(node) : undefined
                            };
                            break;
                        case 'registerNode':
                            //console.log("Register node found: ", node);
                            newNode.data = {
                                ...node.data,
                                onEdit: isAdmin ? () => handleEditRegister(node) : undefined,
                                onDelete: isAdmin ? () => handleDeleteRegister(node) : undefined
                            };
                            break;
                        default:
                            break;
                    }
                    return newNode;
                });

                //console.log("Loaded nodes: ", loadedNodes);
                //console.log("Processed nodes: ", loadedNodes);
                setNodes(loadedNodes);
                console.log('Flow data from API:', flowData);
            } else if (data?.building?.flowData) {
                const flowData = data.building.flowData;
                console.log('Flow data from API:', flowData);

                setBackgroundImage(flowData.flowBackground);
                setBackgroundOpacity(flowData.backgroundOpacity);
                setBackgroundColor(flowData.backgroundColor);
                const loadedNodes: Node[] = flowData.nodes.map((node: any) => {
                    const newNode = { ...node };

                    // Her node için güncel callback'leri ekle
                    switch (node.type) {
                        // case 'groupNode':
                        //     newNode.data = {
                        //         ...node.data,
                        //         onEdit: () => handleEditGroup(node),
                        //         onDelete: () => handleDeleteGroup(node)
                        //     };
                        //     break;
                        case 'textNode':
                            newNode.data = {
                                ...node.data,
                                onEdit: isAdmin ? () => handleEditText(node) : undefined,
                                onDelete: isAdmin ? () => handleDeleteText(node) : undefined
                            };
                            break;
                        case 'imageNode':
                            newNode.data = {
                                ...node.data,
                                onEdit: isAdmin ? () => handleEditImage(node) : undefined,
                                onDelete: isAdmin ? () => handleDeleteImage(node) : undefined
                            };
                            break;
                        case 'registerNode':
                            //console.log("Register node found: ", node);
                            newNode.data = {
                                ...node.data,
                                onEdit: isAdmin ? () => handleEditRegister(node) : undefined,
                                onDelete: isAdmin ? () => handleDeleteRegister(node) : undefined
                            };
                            break;
                        default:
                            break;
                    }
                    return newNode;
                });

                //console.log("Loaded nodes: ", loadedNodes);
                //console.log("Processed nodes: ", loadedNodes);
                setNodes(loadedNodes);
            }

            setNodesLoaded(true)
            console.log('Flow data loaded successfully');
        } catch (error) {
            console.error('Error loading flow data:', error);
            setError('Failed to load flow data');
        } finally {
            setLoading(false);
        }
    }

    // Optimum sayfa yükleme stratejisi
    useEffect(() => {
        // API'den verileri yükle
        loadFlowData();

        // Sayfayı başlangıçta gizli tut
        setIsPageVisible(false);
        
        // Global değişkeni ve localStorage'ı kontrol et
        const storedIsFullScreen = sessionStorage.getItem('isFullScreen');
        
        // Daha önceki tam ekran durumunu yeni sayfada kullan
        if (storedIsFullScreen === 'true' || lastFullscreenState) {
            // Hem global state'i hem de context state'i güncelle
            lastFullscreenState = true;
            setIsFullScreen(true);
            setForceFullscreen(true);
            
            // Görünümü ayarla
            setTimeout(() => {
                if (reactFlowInstance.current) {
                    reactFlowInstance.current!.fitBounds({
                        x: xMin,
                        y: yMin,
                        width: xMax - xMin,
                        height: yMax - yMin,
                    });
                }
                // Uygun gecikme ile içeriği göster
                setTimeout(() => {
                    setIsPageVisible(true);
                    setIsNavigating(false);
                }, 200); // Önceki süreye geri dönüldü (200ms)
            }, 300); // Önceki süreye geri dönüldü (300ms)
        } else {
            // Tam ekran değilse normal şekilde göster
            setTimeout(() => {
                if (reactFlowInstance.current) {
                    reactFlowInstance.current!.fitBounds({
                        x: xMin,
                        y: yMin,
                        width: xMax - xMin,
                        height: yMax - yMin,
                    });
                }
                setIsPageVisible(true);
                setIsNavigating(false);
            }, 150); // Önceki süreye geri dönüldü (150ms)
        }
    }, [building, floor, room]);


    // Debounce fonksiyonu - belirli bir süre içinde tekrar çağrılırsa önceki çağrıyı iptal eder
    const debounce = (func: Function, delay: number) => {
        let timeoutId: any;
        return (...args: any[]) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func(...args);
            }, delay);
        };
    };

    // Debounce edilmiş saveFlowData fonksiyonu
    const debouncedSaveFlowData = useMemo(
        () => debounce(() => {
            saveFlowData();

        }, 0), // 1 saniye bekle
        []
    );

    // Nodes değiştiğinde güncel durumu logla ve ref'i güncelle
    useEffect(() => {
        if (!nodesLoaded && nodes.length === 0) return;
        // Ref'i güncel node değerleriyle güncelle
        nodesRef.current = nodes;
        if (isDraging) return;
        const timeoutId = setTimeout(() => {
            saveFlowData();
        }, 0); // 1 saniye bekle
        
        return () => clearTimeout(timeoutId);
    }, [nodes, nodesLoaded, isDraging]);


const onNodeDragStart = useCallback((event: React.MouseEvent, node: Node, nodes: Node[]) => {
    setIsDraging(true);
    // Düğümün başlangıç pozisyonunu kaydet
    nodeDragStartPosRef.current = { ...node.position };
    // Store all current nodes in ref for snapping
    nodesRef.current = nodes;
}, []);

    const onNodeDrag = useCallback((event: React.MouseEvent, node: Node, nodes: Node[]) => {
        const movingNode = nodes.find(n => n.id === node.id);
        if (!movingNode) return;
        
        // Reset helper lines state
        let newHelperLines:{vertical:number|null, horizontal:number|null} = { vertical: null, horizontal: null };
        
        // Get dimensions of moving node
        const movingNodeWidth = movingNode.width || 0;
        const movingNodeHeight = movingNode.height || 0;
        
        // Calculate right and bottom edges of the moving node
        const movingNodeRight = movingNode.position.x + movingNodeWidth;
        const movingNodeBottom = movingNode.position.y + movingNodeHeight;
        
        // Center lines of the moving node
        const movingNodeCenterX = movingNode.position.x + (movingNodeWidth / 2);
        const movingNodeCenterY = movingNode.position.y + (movingNodeHeight / 2);
        
        // Keep track of closest snap distance for each axis
        let closestSnapX = Infinity;
        let closestSnapY = Infinity;
        
        // Check for snapping against other nodes
        for (const relatedNode of nodesRef.current) {
            if (relatedNode.id === movingNode.id) continue;
            
            const relatedNodeWidth = relatedNode.width || 0;
            const relatedNodeHeight = relatedNode.height || 0;
            
            // Calculate edges and centers of related node
            const relatedNodeRight = relatedNode.position.x + relatedNodeWidth;
            const relatedNodeBottom = relatedNode.position.y + relatedNodeHeight;
            const relatedNodeCenterX = relatedNode.position.x + (relatedNodeWidth / 2);
            const relatedNodeCenterY = relatedNode.position.y + (relatedNodeHeight / 2);
            
            // === HORIZONTAL (X-AXIS) ALIGNMENTS ===
            
            // Check left-to-left alignment
            const leftToLeftDiff = Math.abs(movingNode.position.x - relatedNode.position.x);
            if (leftToLeftDiff <= snapThreshold && leftToLeftDiff < closestSnapX) {
                closestSnapX = leftToLeftDiff;
                newHelperLines = {...newHelperLines, vertical: relatedNode.position.x};
                movingNode.position.x = relatedNode.position.x;
            }
            
            // Check right-to-right alignment
            const rightToRightDiff = Math.abs(movingNodeRight - relatedNodeRight);
            if (rightToRightDiff <= snapThreshold && rightToRightDiff < closestSnapX) {
                closestSnapX = rightToRightDiff;
                newHelperLines = {...newHelperLines, vertical: relatedNodeRight};
                movingNode.position.x = relatedNodeRight - movingNodeWidth;
            }
            
            // Check left-to-right alignment
            const leftToRightDiff = Math.abs(movingNode.position.x - relatedNodeRight);
            if (leftToRightDiff <= snapThreshold && leftToRightDiff < closestSnapX) {
                closestSnapX = leftToRightDiff;
                newHelperLines = {...newHelperLines, vertical: relatedNodeRight};
                movingNode.position.x = relatedNodeRight;
            }
            
            // Check right-to-left alignment
            const rightToLeftDiff = Math.abs(movingNodeRight - relatedNode.position.x);
            if (rightToLeftDiff <= snapThreshold && rightToLeftDiff < closestSnapX) {
                closestSnapX = rightToLeftDiff;
                newHelperLines = {...newHelperLines, vertical: relatedNode.position.x};
                movingNode.position.x = relatedNode.position.x - movingNodeWidth;
            }
            
            // Check center-to-center horizontal alignment
            const centerXDiff = Math.abs(movingNodeCenterX - relatedNodeCenterX);
            if (centerXDiff <= snapThreshold && centerXDiff < closestSnapX) {
                closestSnapX = centerXDiff;
                newHelperLines = {...newHelperLines, vertical: relatedNodeCenterX};
                movingNode.position.x = relatedNodeCenterX - (movingNodeWidth / 2);
            }
            
            // === VERTICAL (Y-AXIS) ALIGNMENTS ===
            
            // Check top-to-top alignment
            const topToTopDiff = Math.abs(movingNode.position.y - relatedNode.position.y);
            if (topToTopDiff <= snapThreshold && topToTopDiff < closestSnapY) {
                closestSnapY = topToTopDiff;
                newHelperLines = {...newHelperLines, horizontal: relatedNode.position.y};
                movingNode.position.y = relatedNode.position.y;
            }
            
            // Check bottom-to-bottom alignment
            const bottomToBottomDiff = Math.abs(movingNodeBottom - relatedNodeBottom);
            if (bottomToBottomDiff <= snapThreshold && bottomToBottomDiff < closestSnapY) {
                closestSnapY = bottomToBottomDiff;
                newHelperLines = {...newHelperLines, horizontal: relatedNodeBottom};
                movingNode.position.y = relatedNodeBottom - movingNodeHeight;
            }
            
            // Check top-to-bottom alignment
            const topToBottomDiff = Math.abs(movingNode.position.y - relatedNodeBottom);
            if (topToBottomDiff <= snapThreshold && topToBottomDiff < closestSnapY) {
                closestSnapY = topToBottomDiff;
                newHelperLines = {...newHelperLines, horizontal: relatedNodeBottom};
                movingNode.position.y = relatedNodeBottom;
            }
            
            // Check bottom-to-top alignment
            const bottomToTopDiff = Math.abs(movingNodeBottom - relatedNode.position.y);
            if (bottomToTopDiff <= snapThreshold && bottomToTopDiff < closestSnapY) {
                closestSnapY = bottomToTopDiff;
                newHelperLines = {...newHelperLines, horizontal: relatedNode.position.y};
                movingNode.position.y = relatedNode.position.y - movingNodeHeight;
            }
            
            // Check center-to-center vertical alignment
            const centerYDiff = Math.abs(movingNodeCenterY - relatedNodeCenterY);
            if (centerYDiff <= snapThreshold && centerYDiff < closestSnapY) {
                closestSnapY = centerYDiff;
                newHelperLines = {...newHelperLines, horizontal: relatedNodeCenterY};
                movingNode.position.y = relatedNodeCenterY - (movingNodeHeight / 2);
            }
        }
        //console.log("new helper lines: ", newHelperLines)

        // Update helper lines state
        setHelperLines(newHelperLines);
    }, [snapThreshold]);

    const onNodeDragStop = useCallback(async (event: React.MouseEvent, node: Node) => {
        setIsDraging(false);
        // Reset helper lines when drag stops
        setHelperLines({ vertical: null, horizontal: null });
        
        // Eğer zaten sürükleme işlemi devam ediyorsa, işlemi durdur
        // if (isDraggingRef.current) {
        //     console.log('Sürükleme işlemi zaten devam ediyor, tekrar çalıştırmayı engelliyorum');
        //     return;
        // }

        // Düğümün başlangıç pozisyonu ile şu anki pozisyonunu karşılaştır
        // Eğer pozisyon değişmemişse (sadece tıklanmışsa) işlemi durdur
        if (nodeDragStartPosRef.current &&
            node.position.x === nodeDragStartPosRef.current.x &&
            node.position.y === nodeDragStartPosRef.current.y) {
            console.log('Düğüm hareket etmedi, sadece tıklandı. İşlemi durduruyorum.');
            // Başlangıç pozisyonunu temizle
            nodeDragStartPosRef.current = null;
            return;
        }
       
        isDraggingRef.current = true;
       
        setTimeout(() => {
            isDraggingRef.current = false;
            nodeDragStartPosRef.current = null;
            //console.log('Sürükleme işlemi flag sıfırlandı ve başlangıç pozisyonu temizlendi');
        }, 200);
    }, [nodesRef.current]);

    const onNodesDelete = (nodes: Node[]) => {
      
    };
    useEffect(() => {
        if (reactFlowInstance.current) {
            reactFlowInstance.current.fitBounds({ x: xMin, y: yMin, width: xMax - xMin, height: yMax - yMin }, { padding: 0 });
        }
    }, [reactFlowInstance.current]);
    const router = useRouter();

    const HorizontalHelperLine = () => {
        return (
            <div className="absolute left-0 w-full h-1 bg-gray-200 dark:bg-gray-700"
            style={{
                top: helperLines.horizontal + 'px'
            }}
            ></div>
        )
    }
    const VerticalHelperLine = () => {
        return (
            <div className="absolute left-[100px] top-0 h-full w-1 bg-gray-200 dark:bg-gray-700"
            style={{
                left: helperLines.vertical + 'px'
            }}
            ></div>
        )
    }
    return (
        <div
            ref={containerRef}
            className="w-full h-[calc(100vh-168px)] bg-white dark:bg-gray-800 transition-opacity duration-500"
            style={{
                opacity: isPageVisible ? 1 : 0,
                visibility: isPageVisible ? 'visible' : 'hidden'
            }}
        >
            {/* Navigasyon sırasında gösterilecek siyah arka plan */}
            <div
                className="fixed inset-0 bg-black z-[99999] transition-opacity duration-500"
                style={{
                    opacity: isPageVisible ? 0 : 1,
                    visibility: isPageVisible ? 'hidden' : 'visible'
                }}
            />
            {loading && <div className="flex items-center justify-center h-full">Loading...</div>}
            {error && <div className="flex items-center justify-center h-full text-red-500">{error}</div>}
            {!loading && !error && (
                <div className="w-full h-full" ref={reactFlowWrapper}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        // onConnect={onConnect}
                        onNodeDrag={onNodeDrag}
                        onNodeDragStop={onNodeDragStop}
                        onNodeDragStart={onNodeDragStart}
                        onNodesDelete={onNodesDelete}
                        deleteKeyCode={null}
                        snapGrid={[5, 5]}
                        snapToGrid={true}
                        minZoom={0.2}
                        maxZoom={isFullScreen ? 1 : 0.8}
                        // fitView={true}
                        translateExtent={[[-1920, -1080], [1920, 1080]]}
                        nodeExtent={[[-1920, -1080], [1920, 1080]]}
                        // fitViewOptions={{
                        //   padding: 0.1,
                        //   includeHiddenNodes: true
                        // }}
                        onNodeClick={(e, node) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (isAdmin) {
                                return
                            }
                            const navigationUrl = node.data.navigationUrl;
                            if (navigationUrl) {
                                // Navigasyon işlemine hazırlan
                                setIsNavigating(true);
                                
                                // Önce içeriği gizle
                                setIsPageVisible(false);
                                
                                // Tam ekran durumunu sakla - diğer sayfada kullanılacak
                                sessionStorage.setItem('isFullScreen', isFullScreen ? 'true' : 'false');
                                
                                // Siyah ekran gösterimi sonrası sayfayı değiştir
                                setTimeout(() => {
                                    // Navigasyon işlemini gerçekleştir
                                    router.push(`/buildings/${navigationUrl}`);
                                }, 400); // Uzun bir süre siyah ekranı göster ama çok uzun değil
                            }
                        }}
                        panOnDrag={true}
                        panOnScroll={false}
                        zoomOnScroll={false}
                        zoomOnPinch={isAdmin}
                        zoomOnDoubleClick={isAdmin}
                        nodesDraggable={isAdmin}
                        nodesConnectable={isAdmin}
                        elementsSelectable={isAdmin}
                        nodeTypes={nodeTypes} // Sabit nodeTypes referansı
                        proOptions={{ hideAttribution: true }}
                        onInit={instance => {
                            console.warn("instance", instance)
                            reactFlowInstance.current = instance;
                        }}
                        onDragOver={onDragOver}
                        onDragStart={() => {
                            setEditingNode(undefined)
                        }}
                        className={isPanning ? "panning" : ""}
                        onDrop={onDrop}
                        onWheel={(event) => {
                            if (!reactFlowInstance.current) return;
                            const zoom = reactFlowInstance.current.getZoom();
                            // Normalize the deltaY value and apply a very small multiplier for fine-grained control
                            const zoomIncrement = event.deltaY * -0.0001;
                            const newZoom = zoom + zoomIncrement;
                            
                            reactFlowInstance.current.zoomTo(newZoom);
                        }}
                    >
                        {/* Sağ üstte sabit fullscreen butonu */}
                        <div className="absolute top-4 right-4 z-1000">
                            <button
                                onClick={handleToggleFullscreen}
                                className="flex items-center justify-center w-10 h-10 bg-white dark:bg-gray-800 rounded-full shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title="Toggle Fullscreen"
                            >
                                <FullscreenIcon className="w-6 h-6 text-gray-800 dark:text-white" />
                            </button>
                        </div>

                        {isAdmin && <FlowToolbar
                            onToggleGrid={handleToggleGrid}
                            showGrid={showGrids}
                            onSave={handleSave}
                            setEditingNode={setEditingNode}
                            onSetBackground={handleSetBackground}
                            onRemoveBackground={handleRemoveBackground}
                            hasBackground={!!backgroundImage || !!backgroundColor}
                        />}
                        {/* <MiniMap /> */}
                        {isAdmin && <Controls />}
                        {/* Helper lines for node snapping - rendered with container offset correction */}
                        {helperLines.horizontal !== null && reactFlowInstance.current && reactFlowWrapper.current && (
                            <div 
                                className="absolute left-0 w-full h-[1px] pointer-events-none" 
                                style={{
                                    top: '0px', // Başlangıçta bir değer atıyoruz, ref içinde güncelleyeceğiz
                                    backgroundColor: '#FF3030',
                                    boxShadow: '0px 0px 2px #FF0000',
                                    zIndex: 9999
                                }}
                                ref={(el) => {
                                    if (el && reactFlowWrapper.current && reactFlowInstance.current && helperLines.horizontal !== null) {
                                        // React Flow container ve içindeki pane elementinin pozisyonunu al
                                        const rfBounds = reactFlowWrapper.current.getBoundingClientRect();
                                        const rfPane = reactFlowWrapper.current.querySelector('.react-flow__pane');
                                        const paneBounds = rfPane ? rfPane.getBoundingClientRect() : rfBounds;
                                        
                                        // Flow koordinatlarını ekran koordinatlarına dönüştür
                                        const screenPos = reactFlowInstance.current.flowToScreenPosition({x: 0, y: helperLines.horizontal});
                                        
                                        // Yardımcı çizginin pozisyonunu hesapla (ReactFlow container içindeki relatif pozisyon)
                                        const yPos = screenPos.y - rfBounds.top;
                                        
                                        // Yardımcı çizginin konumunu ayarla
                                        el.style.top = `${yPos}px`;
                                        
                                     
                                    }
                                }}
                            />
                        )}
                        {helperLines.vertical !== null && reactFlowInstance.current && reactFlowWrapper.current && (
                            <div 
                                className="absolute top-0 h-full w-[1px] pointer-events-none" 
                                style={{
                                    left: '0px', // Başlangıçta bir değer atıyoruz, ref içinde güncelleyeceğiz
                                    backgroundColor: '#FF3030',
                                    boxShadow: '0px 0px 2px #FF0000',
                                    zIndex: 9999
                                }}
                                ref={(el) => {
                                    if (el && reactFlowWrapper.current && reactFlowInstance.current && helperLines.vertical !== null) {
                                        // React Flow container ve içindeki pane elementinin pozisyonunu al
                                        const rfBounds = reactFlowWrapper.current.getBoundingClientRect();
                                        const rfPane = reactFlowWrapper.current.querySelector('.react-flow__pane');
                                        const paneBounds = rfPane ? rfPane.getBoundingClientRect() : rfBounds;
                                        
                                        // Flow koordinatlarını ekran koordinatlarına dönüştür
                                        const screenPos = reactFlowInstance.current.flowToScreenPosition({x: helperLines.vertical, y: 0});
                                        
                                        // Yardımcı çizginin pozisyonunu hesapla (ReactFlow container içindeki relatif pozisyon)
                                        const xPos = screenPos.x - rfBounds.left;
                                        
                                        // Yardımcı çizginin konumunu ayarla
                                        el.style.left = `${xPos}px`;
                                        
                                     
                                    }
                                }}
                            />
                        )}
                        {/* WebSocket Bağlantı Durumu Göstergesi */}
                        <div className="absolute bottom-4 right-4 z-50">
                            <ConnectionStatus />
                        </div>
                        <WorkAreaBoundary bounds={[[xMin, yMin], [xMax, yMax]]} backgroundImage={backgroundImage} backgroundOpacity={backgroundOpacity} backgroundColor={backgroundColor} />
                        {isAdmin ? <Background
                            color={showGrids ? "#9ca3af" : "transparent"}
                            variant={isAdmin ? BackgroundVariant.Dots : undefined}
                            gap={12}
                            size={1.5}
                        /> : null}
                    </ReactFlow>
                </div>
            )}

            {/* <GroupModal
                isOpen={isGroupModalOpen}
                isEditMode={isEditingNode}
                onClose={() => setIsGroupModalOpen(false)}
                onConfirm={handleGroupConfirm}
                node={editingNode}
            /> */}

            <TextModal
                isOpen={isTextModalOpen}
                isEditMode={isEditingNode}
                onClose={() => setIsTextModalOpen(false)}
                onConfirm={handleTextConfirm}
                node={editingNode}
            />
            <ImageModal
                isOpen={isImageModalOpen}
                isEditMode={isEditingNode}
                onClose={() => setIsImageModalOpen(false)}
                onConfirm={handleImageConfirm}
                node={editingNode}
            />

            <RegisterModal
                isOpen={isRegisterModalOpen}
                onClose={() => setIsRegisterModalOpen(false)}
                onConfirm={handleRegisterConfirm}
                node={editingNode}
                isEditMode={isEditingNode}
            />
            <BackgroundModal
                isOpen={isBackgroundModalOpen}
                onClose={() => setIsBackgroundModalOpen(false)}
                onConfirm={handleBackgroundConfirm}
            />

        </div>
    );
}