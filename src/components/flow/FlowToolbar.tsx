import { Grid2x2CheckIcon, Grid3x3Icon, ImageIcon, ImageOffIcon, Type, ImagePlus, ListPlus } from "lucide-react";
import { useState, useRef, useCallback, useEffect, Dispatch, SetStateAction } from "react";
import { DraggableToolbarItem } from "./DraggableToolbarItem";
import { Node } from "reactflow";

export const FlowToolbar = ({
    onToggleGrid,
    showGrid,
    onSave,
    setEditingNode,
    onSetBackground,
    onRemoveBackground,
    hasBackground
}: {
    onToggleGrid: () => void;
    showGrid: boolean;
    onSave: () => void;
    setEditingNode: Dispatch<SetStateAction<Node | undefined>>
    onSetBackground: () => void;
    onRemoveBackground: () => void;
    hasBackground: boolean;
}) => {
    const [position, setPosition] = useState({ x: 20, y: 20 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [isHovered, setIsHovered] = useState(false);
    const toolbarRef = useRef<HTMLDivElement>(null);

    // Sürükleme işlemini başlat
    const handleMouseDown = (e: React.MouseEvent) => {

        // Başlık çubuğuna tıklandığında sürüklemeyi başlat
        if (e.currentTarget.classList.contains('toolbar-handle')) {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);

            if (toolbarRef.current) {
                const rect = toolbarRef.current.getBoundingClientRect();
                setDragOffset({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                });
            }
        }
    };

    // ReactFlow container'ın gerçek pozisyonunu hesapla
    const getFlowContainerOffset = useCallback(() => {
        const flowContainer = document.querySelector('.react-flow');
        if (!flowContainer) return { x: 0, y: 0 };

        const flowRect = flowContainer.getBoundingClientRect();
        return {
            x: flowRect.left,
            y: flowRect.top
        };
    }, []);

    // Sürükleme işlemini güncelle
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging && toolbarRef.current) {
            e.preventDefault();

            // Flow container offset'ini hesapla
            const flowOffset = getFlowContainerOffset();

            // Mouse pozisyonundan flow container offset'ini çıkar
            const relativeX = e.clientX - flowOffset.x - dragOffset.x;
            const relativeY = e.clientY - flowOffset.y - dragOffset.y;

            // ReactFlow container sınırları içinde kalmayı sağla
            const flowContainer = document.querySelector('.react-flow');
            if (flowContainer) {
                const flowRect = flowContainer.getBoundingClientRect();
                const toolbarRect = toolbarRef.current.getBoundingClientRect();

                const maxX = flowRect.width - toolbarRect.width;
                const maxY = flowRect.height - toolbarRect.height;

                setPosition({
                    x: Math.max(0, Math.min(relativeX, maxX)),
                    y: Math.max(0, Math.min(relativeY, maxY))
                });
            } else {
                // Container bulunamazsa yine de pozisyonu güncelle
                setPosition({ x: relativeX, y: relativeY });
            }
        }
    }, [isDragging, dragOffset, getFlowContainerOffset]);

    // Sürükleme işlemini bitir
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Event listener'ları ekle/kaldır
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Hover durumunu yönet
    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => setIsHovered(false);

    return (
        <div
            ref={toolbarRef}
            className="group z-10 bg-white dark:bg-gray-600 shadow-xl rounded-lg flex flex-col overflow-hidden"
            style={{
                position: 'absolute',
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: isHovered ? '160px' : '44px',
                transition: isDragging ? 'none' : 'width 0.3s ease'
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Sürüklenebilir başlık çubuğu */}
            <div
                className="toolbar-handle h-8 bg-blue-600 dark:bg-blue-700 flex items-center justify-center text-white font-medium cursor-move w-full hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors"
                onMouseDown={handleMouseDown}
            >
                <span className={isHovered ? 'block' : 'hidden'}>Tools</span>
            </div>

            <div className="p-1 flex flex-col gap-1">

                <button
                    onClick={onToggleGrid}
                    className="flex items-center gap-2 p-2 h-8 hover:bg-gray-100 dark:hover:bg-gray-700 rounded w-full text-left text-gray-800 dark:text-white"
                >
                    {showGrid ? <Grid2x2CheckIcon className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" /> : <Grid3x3Icon className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />}
                    <span className="hidden group-hover:block text-gray-800 dark:text-white">{showGrid ? 'Hide Grid' : 'Show Grid'}</span>
                </button>

                {!hasBackground && <button
                    onClick={onSetBackground}
                    className="flex items-center gap-2 p-2 h-8 hover:bg-gray-100 dark:hover:bg-gray-700 rounded w-full text-left text-gray-800 dark:text-white"
                >
                    <ImageIcon className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />
                    <span className="hidden group-hover:block text-gray-800 dark:text-white">Background</span>
                </button>}

                {hasBackground && (
                    <button
                        onClick={onRemoveBackground}
                        className="flex items-center gap-2 p-2 h-8 hover:bg-gray-100 dark:hover:bg-gray-700 rounded w-full text-left text-gray-800 dark:text-white"
                    >
                        <ImageOffIcon className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />
                        <span className="hidden group-hover:block text-gray-800 dark:text-white">Background</span>
                    </button>
                )}
                {/* <button
                    onClick={onSave}
                    className="flex items-center gap-2 p-2 h-8 hover:bg-gray-100 dark:hover:bg-gray-700 rounded w-full text-left text-gray-800 dark:text-white"
                >
                    <Save className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />
                    <span className="hidden group-hover:block text-gray-800 dark:text-white">Save</span>
                </button> */}

                {/* <DraggableToolbarItem
                    nodeType="groupNode"
                    label="Group"
                    icon={<GroupIcon className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />}
                /> */}

                <DraggableToolbarItem
                    nodeType="textNode"
                    label="Text"
                    icon={<Type className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />}
                />

                <DraggableToolbarItem
                    nodeType="imageNode"
                    label="Image"
                    icon={<ImagePlus className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />}
                />

                {/* <DraggableToolbarItem
                    nodeType="navigationNode"
                    label="Navigation"
                    icon={<Route className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />}
                />

                <DraggableToolbarItem
                    nodeType="analyzerNode"
                    label="Analyzer"
                    icon={<Gauge className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />}
                /> */}

                <DraggableToolbarItem
                    nodeType="registerNode"
                    label="Register"
                    icon={<ListPlus className="w-5 h-5 flex-shrink-0 text-gray-800 dark:text-white" />}
                />
            </div>
        </div>
    );
};