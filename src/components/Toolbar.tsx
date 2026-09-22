import { useState } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import type { ToolType } from '../types';
import { exportPdf, downloadBlob } from '../utils/exportPdf';

const tools: { id: ToolType; label: string; icon: string }[] = [
  { id: 'select', label: '선택', icon: '↖' },
  { id: 'text', label: '텍스트', icon: 'T' },
  { id: 'image', label: '이미지', icon: '🖼' },
  { id: 'rotate', label: '회전', icon: '↻' },
];

export function Toolbar() {
  const {
    selectedTool,
    setTool,
    pdfBytes,
    pdfName,
    pages,
    elements,
    originalTexts,
    zoom,
    setZoom,
    currentPage,
    undoStack,
    redoStack,
    undo,
    redo,
  } = usePdfStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const handleExportClick = () => {
    if (!pdfBytes) return;
    const defaultName = pdfName ? pdfName.replace('.pdf', '') : 'document';
    setSaveFileName(defaultName);
    setShowSaveDialog(true);
  };

  const handleExport = async () => {
    if (!pdfBytes || !saveFileName.trim()) return;
    setShowSaveDialog(false);
    setIsExporting(true);
    try {
      console.log('[내보내기 버튼] 클릭됨 ============================');
      console.log('[내보내기 버튼] 원본 바이트:', pdfBytes.length);
      console.log('[내보내기 버튼] 페이지 수:', pages.length);
      console.log('[내보내기 버튼] 요소 수:', elements.length);
      console.log('[내보내기 버튼] 원본 텍스트 수:', originalTexts.length);
      console.log('[내보내기 버튼] 수정된 텍스트:');
      originalTexts.filter(t => t._changed).forEach((t, i) => {
        console.log(`  #${i}: id=${t.id} 페이지=${t.pageIndex} 내용="${t.content}" 좌표=(${t.x},${t.y})`);
      });
      console.log('[내보내기 버튼] 페이지 정보:');
      pages.forEach((p, i) => {
        console.log(`  페이지#${i}: 원본인덱스=${p.originalIndex} 신규페이지=${p.isNewPage} 크기=${p.width}x${p.height}`);
      });
      const exportedBytes = await exportPdf(pdfBytes, pages, elements, originalTexts);
      const fileName = `${saveFileName.trim()}.pdf`;
      downloadBlob(exportedBytes, fileName);
      console.log('[내보내기 버튼] ✅ 완료:', fileName);
    } catch (error) {
      console.error('[내보내기 버튼] ❌ 오류:', error);
      if (error instanceof Error) {
        alert(`PDF 내보내기 오류: ${error.message}`);
      } else {
        alert('PDF 내보내기 중 알 수 없는 오류가 발생했습니다.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-1">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setTool(tool.id)}
              className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                selectedTool === tool.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title={tool.label}
            >
              <span className="mr-1">{tool.icon}</span>
              {tool.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-700">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="px-2 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="실행 취소 (Ctrl+Z)"
          >
            ↩
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="px-2 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="다시 실행 (Ctrl+Y)"
          >
            ↪
          </button>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <button onClick={() => setZoom(zoom - 0.1)} className="px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">-</button>
          <span className="text-gray-300 text-sm min-w-[50px] text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(zoom + 0.1)} className="px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">+</button>
        </div>

        <div className="text-gray-400 text-sm mx-2">페이지 {currentPage + 1} / {pages.length}</div>

        <button
          onClick={handleExportClick}
          disabled={!pdfBytes || isExporting}
          className="px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isExporting ? '내보내는 중...' : 'PDF 내보내기'}
        </button>
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96 shadow-xl">
            <h3 className="text-white text-lg font-bold mb-4">저장 이름 설정</h3>
            <input
              type="text"
              value={saveFileName}
              onChange={(e) => setSaveFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleExport();
                if (e.key === 'Escape') setShowSaveDialog(false);
              }}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none mb-4"
              placeholder="파일 이름을 입력하세요"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveDialog(false)} className="px-4 py-2 bg-gray-600 text-gray-300 rounded hover:bg-gray-500 transition-colors">취소</button>
              <button onClick={handleExport} disabled={!saveFileName.trim()} className="px-4 py-2 bg-green-600 text-white rounded font-medium hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
