import { useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePdfStore } from '../store/usePdfStore';

function SortableThumbnail({
  pageIndex,
  thumbnail,
  rotation,
}: {
  pageIndex: number;
  thumbnail?: string;
  rotation: number;
}) {
  const { currentPage, setCurrentPage, deletePage, pages } = usePdfStore();
  const isSelected = currentPage === pageIndex;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `page-${pageIndex}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => setCurrentPage(pageIndex)}
      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all group ${
        isSelected ? 'border-blue-500 shadow-lg shadow-blue-500/30' : 'border-gray-700 hover:border-gray-500'
      }`}
    >
      <div className="aspect-[3/4] bg-gray-800 flex items-center justify-center">
        {thumbnail ? (
          <img src={thumbnail} alt={`Page ${pageIndex + 1}`} className="w-full h-full object-contain" style={{ transform: `rotate(${rotation}deg)` }} />
        ) : (
          <span className="text-gray-500 text-sm">로딩 중...</span>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/80 text-white text-xs text-center py-1">{pageIndex + 1}</div>
      {pages.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`페이지 ${pageIndex + 1}을(를) 삭제하시겠습니까?`)) deletePage(pageIndex);
          }}
          className="absolute top-1 right-1 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function Sidebar() {
  const { pages, reorderPages, updatePageThumbnail, pdfBytes } = usePdfStore();
  const hasLoadedThumbnails = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!pdfBytes || hasLoadedThumbnails.current) return;
    const loadThumbnails = async () => {
      const { loadPdf, renderPageThumbnail } = await import('../utils/pdfLoader');
      const pdf = await loadPdf(new Uint8Array(pdfBytes));
      for (let i = 0; i < pages.length; i++) {
        if (!pages[i].thumbnail) {
          const thumbnail = await renderPageThumbnail(pdf, i + 1, 150);
          updatePageThumbnail(i, thumbnail);
        }
      }
    };
    loadThumbnails();
    hasLoadedThumbnails.current = true;
  }, [pdfBytes]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = pages.findIndex((_, i) => `page-${i}` === active.id);
    const newIndex = pages.findIndex((_, i) => `page-${i}` === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderPages(oldIndex, newIndex);
      hasLoadedThumbnails.current = false;
    }
  };

  return (
    <div className="w-48 bg-gray-800 border-r border-gray-700 overflow-y-auto p-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pages.map((_, i) => `page-${i}`)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {pages.map((page, index) => (
              <SortableThumbnail key={`page-${index}`} pageIndex={index} thumbnail={page.thumbnail} rotation={page.rotation} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
