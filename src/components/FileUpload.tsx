import { useCallback } from 'react';
import { usePdfStore } from '../store/usePdfStore';
import { loadPdf, getPageDimensions, renderPageThumbnail } from '../utils/pdfLoader';
import type { PageInfo } from '../types';

export function FileUpload() {
  const { setPdf } = usePdfStore();
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const pdf = await loadPdf(bytes);
      const pages: PageInfo[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const dimensions = await getPageDimensions(pdf, i);
        const thumbnail = await renderPageThumbnail(pdf, i, 150);
        pages.push({ id: `page-${i}`, width: dimensions.width, height: dimensions.height, rotation: 0, thumbnail, originalIndex: i - 1 });
      }
      setPdf(bytes, file.name, pages);
    } catch (error) {
      console.error('PDF 로드 오류:', error);
      alert('PDF 파일을 불러오지 못했습니다. 유효한 PDF인지 확인해주세요.');
    }
  }, [setPdf]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') handleFileUpload(file);
    else alert('PDF 파일만 업로드 가능합니다.');
  }, [handleFileUpload]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFileUpload(file);
    };
    input.click();
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-700" onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="text-center p-8">
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gray-600 flex items-center justify-center">
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">PDF 편집기</h2>
        <p className="text-gray-400 mb-6">PDF 파일을 여기에 드래그 앤 드롭하거나, 클릭하여 파일을 선택하세요</p>
        <button onClick={handleClick} className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-500 transition-colors">PDF 파일 선택</button>
        <div className="mt-8 text-gray-500 text-sm">
          <p>지원 기능:</p>
          <ul className="mt-2 space-y-1">
            <li>• 폰트 커스텀 텍스트 편집</li>
            <li>• 이미지 삽입 및 리사이징</li>
            <li>• 페이지 관리 (순서 변경, 추가, 삭제)</li>
            <li>• 페이지 회전</li>
            <li>• 편집된 PDF 내보내기</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
