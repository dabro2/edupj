import { useState, useRef, useEffect } from 'react';
import type { ImageElement } from '../types';
import { usePdfStore } from '../store/usePdfStore';

interface ImageElementProps {
  element: ImageElement;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<ImageElement>) => void;
  zoom: number;
}

export function ImageElementComponent({
  element,
  isSelected,
  onSelect,
  onUpdate,
  zoom,
}: ImageElementProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const deleteElement = usePdfStore((s) => s.deleteElement);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    if (e.shiftKey) {
      setIsResizing(true);
      setResizeStart({ x: e.clientX, y: e.clientY, width: element.width, height: element.height });
    }
  };

  useEffect(() => {
    if (!isResizing || !resizeStart) return;
    const handleMouseMove = (e: MouseEvent) => {
      const dx = (e.clientX - resizeStart.x) / zoom;
      const newWidth = Math.max(50, resizeStart.width + dx);
      const aspectRatio = element.originalWidth / element.originalHeight;
      const newHeight = newWidth / aspectRatio;
      onUpdate({ width: newWidth, height: newHeight });
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeStart(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeStart, zoom, element.originalWidth, element.originalHeight, onUpdate]);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', element.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        left: `${element.x * zoom}px`,
        top: `${element.y * zoom}px`,
        width: `${element.width * zoom}px`,
        height: `${element.height * zoom}px`,
        cursor: isResizing ? 'nwse-resize' : 'move',
      }}
      className={`group ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
      onClick={handleMouseDown}
      draggable={!isResizing}
      onDragStart={handleDragStart}
    >
      <img src={element.imageData} alt="Inserted" className="w-full h-full object-contain pointer-events-none" draggable={false} />
      {isSelected && !isResizing && (
        <>
          <div
            className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-nwse-resize"
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsResizing(true);
              setResizeStart({ x: e.clientX, y: e.clientY, width: element.width, height: element.height });
            }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); deleteElement(element.id); }}
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        </>
      )}
    </div>
  );
}
