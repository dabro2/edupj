import { useState, useRef, useEffect } from 'react';
import type { OriginalTextItem } from '../types';
import { usePdfStore } from '../store/usePdfStore';

interface OriginalTextOverlayProps {
  item: OriginalTextItem;
  zoom: number;
}

export function OriginalTextOverlay({ item, zoom }: OriginalTextOverlayProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(item.content);
  const updateOriginalText = usePdfStore((s) => s.updateOriginalText);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Sync editContent when item.content changes externally (e.g., undo)
  useEffect(() => {
    if (!isEditing) setEditContent(item.content);
  }, [item.content, isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditContent(item.content);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editContent !== item.content) {
      console.log('[텍스트편집] ✏️ 편집 저장:', {
        id: item.id,
        원본: `"${item.content}"`,
        수정後: `"${editContent}"`,
        페이지: item.pageIndex,
        좌표: { x: item.x, y: item.y },
      });
      updateOriginalText(item.id, editContent);
    } else {
      console.log('[텍스트편집] 변경 없음, 건너뜀');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditContent(item.content);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: `${item.x * zoom}px`,
        top: `${(item.y - item.height) * zoom}px`,
        minWidth: `${item.width * zoom}px`,
        minHeight: `${item.height * zoom}px`,
        cursor: 'text',
        zIndex: 5,
      }}
      onDoubleClick={handleDoubleClick}
    >
      {isEditing ? (
        <textarea
          ref={inputRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="bg-yellow-100 border border-yellow-500 rounded px-1 resize-none outline-none"
          style={{
            fontSize: `${item.fontSize * zoom}px`,
            fontFamily: 'Helvetica, Arial, sans-serif',
            minWidth: `${Math.max(item.width * zoom, 60)}px`,
            minHeight: `${item.height * zoom + 4}px`,
            lineHeight: 1.2,
          }}
        />
      ) : (
        <div
          className={`rounded px-0.5 transition-colors ${
            item._changed ? 'bg-yellow-100' : 'hover:bg-yellow-200/40'
          }`}
          style={{
            fontSize: `${item.fontSize * zoom}px`,
            fontFamily: 'Helvetica, Arial, sans-serif',
            lineHeight: 1.2,
            whiteSpace: 'pre-wrap',
            color: item._changed ? 'black' : 'transparent',
            caretColor: 'black',
          }}
          title="더블클릭하여 편집"
        >
          {item.content}
        </div>
      )}
    </div>
  );
}
