import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export async function loadPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useWorkerFetch: false,
    useSystemFonts: true,
  });
  return await loadingTask.promise;
}

export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 1
): Promise<void> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
}

export async function renderPageThumbnail(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  maxWidth: number = 150
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  await page.render({ canvas, viewport: scaledViewport }).promise;
  return canvas.toDataURL('image/png');
}

export async function getPageDimensions(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<{ width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height };
}

export async function extractPageTexts(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<Array<{ id: string; pageIndex: number; x: number; y: number; width: number; height: number; content: string; fontSize: number }>> {
  const page = await pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const items: Array<{ id: string; pageIndex: number; x: number; y: number; width: number; height: number; content: string; fontSize: number }> = [];

  let currentLine = '';
  let currentX = 0;
  let currentY = 0;
  let currentWidth = 0;
  let currentHeight = 0;
  let currentFontSize = 0;
  let lastXEnd = 0;

  const flushLine = () => {
    if (currentLine.trim()) {
      const id = `orig-${pageNumber}-${items.length}`;
      items.push({
        id,
        pageIndex: pageNumber - 1,
        x: currentX,
        y: currentY,
        width: currentWidth,
        height: currentHeight,
        content: currentLine.trim(),
        fontSize: currentFontSize,
      });
      console.log(`[텍스트추출] 항목 추가: 아이디="${id}" 내용="${currentLine.trim()}" x=${currentX.toFixed(2)} y=${currentY.toFixed(2)} 너비=${currentWidth.toFixed(2)} 높이=${currentHeight.toFixed(2)} 크기=${currentFontSize.toFixed(1)}`);
    }
    currentLine = '';
    currentWidth = 0;
    currentHeight = 0;
    lastXEnd = 0;
  };

  for (const item of textContent.items) {
    if ('str' in item && item.str) {
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const x = tx[4];
      const y = tx[5];
      const fontSize = Math.sqrt(item.transform[2] ** 2 + item.transform[3] ** 2) || 12;
      const height = fontSize;
      const itemWidth = item.width || item.str.length * fontSize * 0.6;

      // Detect new line by Y difference
      if (currentLine && Math.abs(y - currentY) > fontSize * 0.5) {
        flushLine();
      }

      if (!currentLine) {
        currentX = x;
        currentY = y;
        currentFontSize = fontSize;
        currentLine = item.str;
        lastXEnd = x + itemWidth;
        currentWidth = itemWidth;
        currentHeight = height;
      } else {
        // Check if there is a gap indicating a space
        const gap = x - lastXEnd;
        // If gap is significant, insert space (heuristic: > 1/4 fontSize)
        if (gap > fontSize * 0.15) {
          // Only add space if not already spaced
          if (!currentLine.endsWith(' ') && !item.str.startsWith(' ')) {
            currentLine += ' ';
            currentWidth += fontSize * 0.25;
          }
        }
        currentLine += item.str;
        // Update width to encompass new item
        const newEnd = x + itemWidth;
        currentWidth = Math.max(currentWidth, newEnd - currentX);
        currentHeight = Math.max(currentHeight, height);
        currentFontSize = Math.max(currentFontSize, fontSize);
        lastXEnd = newEnd;
      }
    }
  }

  flushLine();
  console.log(`[텍스트추출] 페이지 ${pageNumber} 완료: ${items.length}개 항목 추출`);
  return items;
}
