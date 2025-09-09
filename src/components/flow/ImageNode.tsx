import React, { memo, useEffect } from 'react';
import { NodeProps, NodeToolbar, Position } from 'reactflow';
import { NodeResizer } from '@reactflow/node-resizer';
import { Node } from 'reactflow';
import '@reactflow/node-resizer/dist/style.css';
import { Edit, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
interface ImageNodeData {
  backgroundColor?: string;
  backgroundImage?: string;
  opacity?: number;
  navigationUrl?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

const ImageNode = memo((node: NodeProps<ImageNodeData>) => {
  const { isAdmin } = useAuth()
  const router = useRouter();
  const createBacgroundColorWithOpacity = (backgroundColorInHex: string, opacity: number) => {
    return backgroundColorInHex + Math.round(opacity * 255 / 100).toString(16);
  }
  const style: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: createBacgroundColorWithOpacity(node.data.backgroundColor || 'transparent', node.data.opacity || 100),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    border: node.selected && isAdmin ? '6px solid #f00' : 'none',
    borderRadius: '5px',
    padding: '0',
    position: 'relative',
    overflow: 'hidden',
    minWidth: '64px',
    minHeight: '64px',
    cursor: node.data.navigationUrl ? 'pointer' : 'default'
  };

  const handleNodeClick = async (e: React.MouseEvent) => {
    //console.warn("node clicked", node.data.navigationUrl)
    if (isAdmin) {
      return
    }
    if (node.data.navigationUrl) {
      router.push(`/buildings/${node.data.navigationUrl}`);
    }
    //      console.log("node clicked", navigationUrl);
    //     if (navigationUrl) {
    //       e.stopPropagation(); // React Flow'un olay yönetimini engelle
    //       console.log("router pushing", navigationUrl);
    //       const result = await showConfirmAlert(
    //         "Navigate to unit?",
    //         `This node has navigation to ${getSelectedItemName(navigationUrl)}.
    // Are you sure you want to navigate to this unit?`,
    //         "Yes",
    //         "Cancel",
    //       );
    //       if (result.isConfirmed) {
    //         router.push(`/units/${navigationUrl}`);
    //       }
    //     }
  };
  return (
    <>
      {isAdmin && (
        <NodeToolbar isVisible={node.selected} position={Position.Top}>
          <div className="h-6 flex flex-row items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                node.data.onEdit?.();
              }}
              className=" z-50 p-1 bg-warning-500 hover:bg-warning-600 text-white rounded-md items-center justify-center"
              style={{ height: '100%', aspectRatio: '1/1' }}
            >
              <Edit size={"100%"} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                node.data.onDelete?.();
              }}
              className="flex z-50 mr-2 p-1 bg-error-500 hover:bg-error-600 text-white rounded-md items-center justify-center"
              style={{ height: '100%', aspectRatio: '1/1' }}
            >
              <Trash2 size={"100%"} />
            </button>
          </div>
        </NodeToolbar>
      )}
      {/* <NodeResizer
        minWidth={64}
        minHeight={64}
        isVisible={node.selected}
        keepAspectRatio={node.data.backgroundImage ? true : false}
        handleStyle={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: '#ff0071',
          border: '1px solid #ddd',
          cursor: 'resize',
          zIndex: 9999
        }} /> */}
      <div className="group" style={style}
        onClick={handleNodeClick}>
        {node.data.backgroundImage && (
          <img
            src={node.data.backgroundImage}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: node.data.opacity ? node.data.opacity / 100 : 1,
              zIndex: 1
            }}
          />
        )}


      </div>
    </>
  );
});

ImageNode.displayName = 'ImageNode';

export default ImageNode;
