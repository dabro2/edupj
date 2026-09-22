import { useEffect, useRef, useCallback, useState } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import { loadPdf, renderPageToCanvas, extractPageTexts } from '../utils/pdfLoader';
import { TextElementComponent } from './TextElement';
import { ImageElementComponent } from './ImageElement';
import { OriginalTextOverlay } from './OriginalTextOverlay';
import type { TextElement, ImageElement } from '../types';
import type { PDFDocumentProxy } from 'pdfjs-dist';

const RENDER_SCALE = 1.5;

export function CanvasViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const {
    pdfBytes,
    pages,
    currentPage,
    zoom,
    selectedTool,
    elements,
    originalTexts,
    selectedElementId,
    addElement,
    updateElement,
    deleteElement,
    selectElement,
    setOriginalTexts,
  } = usePdfStore();

  const [renderKey, setRenderKey] = useState(0);

  const currentPageInfo = pages[currentPage];
  const originalPageNumber = currentPageInfo?.originalIndex !== undefined ? currentPageInfo.originalIndex + 1 : currentPage + 1;
  const isNewPage = currentPageInfo?.isNewPage;

  useEffect(() => {
    if (!pdfBytes || !canvasRef.current) return;
    if (isNewPage || !currentPageInfo) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = (currentPageInfo?.width || 595) * zoom * RENDER_SCALE;
        canvas.height = (currentPageInfo?.height || 842) * zoom * RENDER_SCALE;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }
    let cancelled = false;
    const renderPage = async () => {
      try {
        const doc = await loadPdf(pdfBytes);
        if (cancelled) return;
        pdfDocRef.current = doc;
        if (canvasRef.current) {
          await renderPageToCanvas(doc, originalPageNumber, canvasRef.current, zoom * RENDER_SCALE);
        }
      } catch (err) {
        console.error('[렌더링] PDF 렌더 오류:', err);
      }
    };
    renderPage();
    return () => { cancelled = true; };
  }, [pdfBytes, currentPage, zoom, renderKey, originalPageNumber, isNewPage, currentPageInfo]);

  useEffect(() => {
    if (!pdfBytes) return;
    if (isNewPage || !currentPageInfo) {
      setOriginalTexts([]);
      return;
    }
    let cancelled = false;
    const extract = async () => {
      try {
        const doc = await loadPdf(pdfBytes);
        if (cancelled) return;
        pdfDocRef.current = doc;
        const texts = await extractPageTexts(doc, originalPageNumber);
        const mapped = texts.map(t => ({ ...t, pageIndex: currentPage }));
        console.log('[텍스트추출] 페이지', currentPage, '원본페이지', originalPageNumber, '추출된 항목:', mapped.length);
        if (!cancelled) {
          setOriginalTexts(mapped);
        }
      } catch (err) {
        console.error('[텍스트추출] ❌ 추출 에러:', err);
      }
    };
    extract();
    return () => { cancelled = true; };
  }, [pdfBytes, currentPage, originalPageNumber, isNewPage, currentPageInfo, setOriginalTexts]);

  const getPageCoords = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scale = zoom * RENDER_SCALE;
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }, [zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (selectedTool === 'text') {
      const coords = getPageCoords(e);
      const newElement: TextElement = {
        id: `text-${Date.now()}`,
        type: 'text',
        pageIndex: currentPage,
        x: coords.x,
        y: coords.y,
        content: '새 텍스트',
        fontFamily: 'Helvetica',
        fontSize: 16,
        fontColor: '#000000',
        bold: false,
        italic: false,
      };
      addElement(newElement);
      selectElement(newElement.id);
    } else if (selectedTool === 'image') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/jpg';
      input.onchange = (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (readEvent) => {
          const imageData = readEvent.target?.result as string;
          const img = new Image();
          img.onload = () => {
            const coords = getPageCoords(e);
            const maxWidth = 200;
            const scaleFactor = img.width > maxWidth ? maxWidth / img.width : 1;
            const newElement: ImageElement = {
              id: `image-${Date.now()}`,
              type: 'image',
              pageIndex: currentPage,
              x: coords.x,
              y: coords.y,
              width: img.width * scaleFactor,
              height: img.height * scaleFactor,
              imageData,
              originalWidth: img.width,
              originalHeight: img.height,
            };
            addElement(newElement);
            selectElement(newElement.id);
          };
          img.src = imageData;
        };
        reader.readAsDataURL(file);
      };
      input.click();
    } else if (selectedTool === 'rotate') {
      const { rotatePage } = usePdfStore.getState();
      rotatePage(currentPage, 90);
      setRenderKey((k) => k + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedElementId) {
        deleteElement(selectedElementId);
      }
    }
  };

  const currentPageElements = elements.filter((el) => el.pageIndex === currentPage);
  const currentPageTexts = originalTexts.filter((t) => t.pageIndex === currentPage);
  const displayScale = zoom * RENDER_SCALE;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-gray-600 flex items-center justify-center p-4"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="relative inline-block shadow-2xl">
        <canvas
          ref={canvasRef}
          className="block bg-white"
          style={{
            cursor: selectedTool === 'text' ? 'text' :
                    selectedTool === 'image' ? 'copy' :
                    selectedTool === 'rotate' ? 'crosshair' :
                    'default',
          }}
          onMouseDown={handleMouseDown}
        />

        {currentPageTexts.map((item) => (
          <OriginalTextOverlay
            key={item.id}
            item={item}
            zoom={displayScale}
          />
        ))}

        {currentPageElements.map((element) => {
          if (element.type === 'text') {
            return (
              <TextElementComponent
                key={element.id}
                element={element}
                isSelected={selectedElementId === element.id}
                onSelect={() => selectElement(element.id)}
                onUpdate={(updates) => updateElement(element.id, updates)}
                zoom={displayScale}
              />
            );
          } else if (element.type === 'image') {
            return (
              <ImageElementComponent
                key={element.id}
                element={element}
                isSelected={selectedElementId === element.id}
                onSelect={() => selectElement(element.id)}
                onUpdate={(updates) => updateElement(element.id, updates)}
                zoom={displayScale}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
