import { useState, useRef, useEffect } from 'react';
import type { TextElement } from '../types';
import { usePdfStore } from '../store/usePdfStore';

interface TextElementProps {
  element: TextElement;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<TextElement>) => void;
  zoom: number;
}

export function TextElementComponent({
  element,
  isSelected,
  onSelect,
  onUpdate,
  zoom,
}: TextElementProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(element.content);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const deleteElement = usePdfStore((s) => s.deleteElement);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) setEditContent(element.content);
  }, [element.content, isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditContent(element.content);
  };

  const handleBlur = () => {
    setIsEditing(false);
    if (editContent !== element.content) {
      onUpdate({ content: editContent });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditContent(element.content);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', element.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    left: `${element.x * zoom}px`,
    top: `${element.y * zoom}px`,
    fontFamily: element.fontFamily,
    fontSize: `${element.fontSize * zoom}px`,
    color: element.fontColor,
    fontWeight: element.bold ? 'bold' : 'normal',
    fontStyle: element.italic ? 'italic' : 'normal',
    cursor: 'move',
    userSelect: 'none',
    minWidth: '20px',
    minHeight: `${element.fontSize * zoom}px`,
  };

  return (
    <div
      style={style}
      className={`group ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={handleDoubleClick}
      draggable={!isEditing}
      onDragStart={handleDragStart}
    >
      {isEditing ? (
        <textarea
          ref={inputRef}
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="bg-white/90 border border-blue-500 rounded px-1 resize-none outline-none"
          style={{
            fontFamily: element.fontFamily,
            fontSize: `${element.fontSize * zoom}px`,
            color: element.fontColor,
            fontWeight: element.bold ? 'bold' : 'normal',
            fontStyle: element.italic ? 'italic' : 'normal',
            minWidth: '100px',
            minHeight: `${element.fontSize * zoom + 8}px`,
          }}
        />
      ) : (
        <span className="whitespace-pre-wrap">{element.content}</span>
      )}
      
      {isSelected && !isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteElement(element.id);
          }}
          className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}
