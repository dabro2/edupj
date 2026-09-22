import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { PdfElement, PageInfo, OriginalTextItem } from '../types';

let cachedFontBytes: Uint8Array | null = null;

function containsKorean(text: string): boolean {
  return /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(text);
}

async function loadFontBytes(): Promise<Uint8Array> {
  if (cachedFontBytes) return cachedFontBytes;
  const base = (import.meta as any).env?.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : base + '/';
  const urlsToTry = [
    normalizedBase + 'NanumGothic-Regular.ttf',
    '/NanumGothic-Regular.ttf',
    'NanumGothic-Regular.ttf',
  ];
  let lastError: Error | null = null;
  for (const url of urlsToTry) {
    try {
      console.log('[폰트로드] 폰트 요청 시도:', url);
      const res = await fetch(url);
      console.log('[폰트로드] 요청', url, '상태:', res.status, '성공:', res.ok);
      if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      console.log('[폰트로드] 폰트 바이트', bytes.length, '출처:', url);
      if (bytes.length < 100000) throw new Error(`폰트 파일이 너무 작음 (${bytes.length}바이트, ${url})`);
      cachedFontBytes = bytes;
      return bytes;
    } catch (e) {
      console.warn('[폰트로드] 폰트 요청 실패:', url, e);
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError || new Error('Failed to load Korean font');
}

async function getKoreanFont(pdfDoc: PDFDocument) {
  const bytes = await loadFontBytes();
  (pdfDoc as any).registerFontkit(fontkit);
  // subset:true 로 embed 시 NanumGothic 같은 CJK 폰트에서 일부 글리프가 누락되어
  // 한글 렌더링이 깨지거나 수정된 텍스트가 빈칸으로 보이는 문제가 있음.
  // 파일 크기는 커지지만 렌더링 정확성을 위해 subset 없이 전체 폰트를 임베드.
  const font = await pdfDoc.embedFont(bytes, { subset: false });
  return font;
}

export async function exportPdf(
  originalBytes: Uint8Array,
  pages: PageInfo[],
  elements: PdfElement[],
  originalTexts: OriginalTextItem[]
): Promise<Uint8Array> {
  console.log('[내보내기] 시작 ============================');
  console.log('[내보내기] 원본 바이트:', originalBytes.length);
  console.log('[내보내기] 페이지 수:', pages.length);
  console.log('[내보내기] 요소 수:', elements.length);
  console.log('[내보내기] 원본 텍스트 항목 수:', originalTexts.length);

  const pdfDoc = await PDFDocument.load(originalBytes);
  const newPdfDoc = await PDFDocument.create();

  const changedTexts = originalTexts.filter((t) => t._changed);
  console.log('[내보내기] 수정된 텍스트 수:', changedTexts.length);
  changedTexts.forEach((t, i) => {
    console.log(`[내보내기] 수정된 텍스트 #${i}:`, {
      id: t.id,
      페이지: t.pageIndex,
      내용: `"${t.content}"`,
      좌표: { x: t.x, y: t.y, 너비: t.width, 높이: t.height },
      폰트크기: t.fontSize,
    });
  });

  const hasKorean = [...elements.filter(e => e.type==='text').map(e => (e as any).content as string), ...originalTexts.filter(t=>t._changed).map(t=>t.content)].some(containsKorean);
  console.log('[내보내기] 한글 포함 여부:', hasKorean);
  let activeFont: Awaited<ReturnType<typeof getKoreanFont>> | null = null;
  let isFallback = false;

  try {
    activeFont = await getKoreanFont(newPdfDoc);
    console.log('[내보내기] 한글 폰트 로드 성공');
  } catch (e) {
    console.error('[내보내기] 한글 폰트 로드 실패:', e);
    if (hasKorean) {
      throw new Error(`한글 폰트(NanumGothic) 로드에 실패했습니다. 새로고침 후 다시 시도해주세요. 오류: ${e instanceof Error ? e.message : String(e)}`);
    }
    console.warn('[내보내기] 한글 불필요, Helvetica로 대체');
    activeFont = (await newPdfDoc.embedFont(StandardFonts.Helvetica)) as any;
    isFallback = true;
  }

  console.log('[내보내기] 페이지 복사 시작...');
  for (let i = 0; i < pages.length; i++) {
    const pageInfo = pages[i];
    console.log(`[내보내기] 페이지 #${i}:`, {
      originalIndex: pageInfo.originalIndex,
      isNewPage: pageInfo.isNewPage,
      크기: { w: pageInfo.width, h: pageInfo.height },
      회전: pageInfo.rotation,
    });
    if (pageInfo.isNewPage) {
      const newPage = newPdfDoc.addPage([pageInfo.width, pageInfo.height]);
      if (pageInfo.rotation !== 0) {
        newPage.setRotation((pageInfo.rotation / 90) as any);
      }
      continue;
    }
    let originalPageIndex = pageInfo.originalIndex;
    if (originalPageIndex === undefined) {
      originalPageIndex = i;
      console.warn(`[내보내기] ⚠️ originalIndex undefined, 인덱스 ${i}로 대체`);
    }
    if (originalPageIndex < 0 || originalPageIndex >= pdfDoc.getPageCount()) {
      console.warn(`[내보내기] ⚠️ originalIndex ${originalPageIndex} 범위 초과, 빈 페이지 생성`);
      const newPage = newPdfDoc.addPage([pageInfo.width, pageInfo.height]);
      if (pageInfo.rotation !== 0) {
        newPage.setRotation((pageInfo.rotation / 90) as any);
      }
      continue;
    }
    const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [originalPageIndex]);
    if (pageInfo.rotation !== 0) {
      copiedPage.setRotation((pageInfo.rotation / 90) as any);
    }
    newPdfDoc.addPage(copiedPage);
  }
  console.log('[내보내기] 페이지 복사 완료, 총 페이지:', newPdfDoc.getPageCount());

  console.log('[내보내기] 수정된 텍스트 그리기 시작...');
  for (let i = 0; i < changedTexts.length; i++) {
    const text = changedTexts[i];
    const pageIndex = text.pageIndex;
    console.log(`[내보내기] 텍스트 #${i} 그리기:`, {
      내용: `"${text.content}"`,
      페이지인덱스: pageIndex,
      PDF페이지수: newPdfDoc.getPageCount(),
    });
    if (pageIndex >= newPdfDoc.getPageCount()) {
      console.warn(`[내보내기] ⚠️ 페이지 ${pageIndex} 초과, 건너뜀`);
      continue;
    }
    const page = newPdfDoc.getPage(pageIndex);
    const { height } = page.getSize();
    console.log(`[내보내기] 페이지 ${pageIndex} 높이:`, height);

    try {
      if (isFallback && containsKorean(text.content)) {
        throw new Error('Fallback 폰트는 한글 인코딩 불가');
      }
      activeFont!.widthOfTextAtSize(text.content, text.fontSize);
      console.log(`[내보내기] 폰트 인코딩 확인 통과`);
    } catch (e) {
      console.error('[내보내기] ❌ 폰트 인코딩 실패:', text.content, e);
      throw new Error(`폰트가 텍스트를 인코딩할 수 없습니다: "${text.content}" - ${e instanceof Error ? e.message : String(e)}`);
    }

    let neededWidth = text.width;
    try {
      const w = activeFont!.widthOfTextAtSize(text.content, text.fontSize);
      neededWidth = Math.max(text.width, w);
      console.log(`[내보내기] 텍스트 너비: 원본=${text.width}, 계산=${w}, 사용=${neededWidth}`);
    } catch {}

    const lines = text.content.split('\n');
    const lineHeight = text.fontSize * 1.2;
    const totalHeight = lines.length * lineHeight;
    const rectWidth = neededWidth + 4;
    const rectHeight = Math.max(text.height, totalHeight) + 4;

    const rectX = text.x - 2;
    const rectY = height - text.y - 2 - (rectHeight - text.height - 4);
    console.log(`[내보내기] ⬜ 사각형: x=${rectX.toFixed(2)} y=${rectY.toFixed(2)} w=${rectWidth.toFixed(2)} h=${rectHeight.toFixed(2)}`);
    page.drawRectangle({
      x: rectX,
      y: rectY,
      width: rectWidth,
      height: rectHeight,
      color: rgb(1, 1, 1),
    });
    console.log(`[내보내기] ⬜ 사각형 그림 (흰색)`);

    try {
      lines.forEach((line, idx) => {
        if (!line) return;
        const textX = text.x;
        const textY = height - text.y - idx * lineHeight;
        console.log(`[내보내기] ✏️ 텍스트 그리기: "${line}" x=${textX.toFixed(2)} y=${textY.toFixed(2)} 크기=${text.fontSize}`);
        page.drawText(line, {
          x: textX,
          y: textY,
          size: text.fontSize,
          font: activeFont!,
          color: rgb(0, 0, 0),
        });
      });
      console.log(`[내보내기] ✅ 텍스트 "${text.content}" 그리기 성공`);
    } catch (e) {
      console.error('[내보내기] ❌ 텍스트 그리기 실패:', text.content, e);
      if (isFallback && containsKorean(text.content)) {
        throw new Error(`한글 폰트 실패로 "${text.content}" 저장 불가: ${e instanceof Error ? e.message : String(e)}`);
      }
      throw e;
    }
  }

  console.log('[내보내기] 요소 그리기 시작...');
  for (const element of elements) {
    const pageIndex = element.pageIndex;
    if (pageIndex >= newPdfDoc.getPageCount()) continue;
    const page = newPdfDoc.getPage(pageIndex);
    const { height } = page.getSize();

    if (element.type === 'text') {
      const fontSize = element.fontSize || 16;
      const colorHex = element.fontColor || '#000000';
      const r = parseInt(colorHex.slice(1, 3), 16) / 255;
      const g = parseInt(colorHex.slice(3, 5), 16) / 255;
      const b = parseInt(colorHex.slice(5, 7), 16) / 255;
      if (isFallback && containsKorean(element.content)) {
        throw new Error(`한글 폰트 없이 한글 텍스트 저장 불가: "${element.content}"`);
      }
      try {
        const lines = element.content.split('\n');
        lines.forEach((line, idx) => {
          if (!line) return;
          page.drawText(line, {
            x: element.x,
            y: height - element.y - fontSize - idx * fontSize * 1.2,
            size: fontSize,
            font: activeFont!,
            color: rgb(r, g, b),
          });
        });
      } catch (e) {
        console.error('[내보내기] 요소 그리기 실패:', element.content, e);
        if (isFallback && containsKorean(element.content)) {
          throw new Error(`한글 폰트 실패로 "${element.content}" 저장 불가: ${e instanceof Error ? e.message : String(e)}`);
        }
        throw e;
      }
    } else if (element.type === 'image') {
      try {
        const base64 = element.imageData.split(',')[1] || element.imageData;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        let image;
        if (element.imageData.includes('image/png')) {
          image = await newPdfDoc.embedPng(bytes);
        } else {
          image = await newPdfDoc.embedJpg(bytes);
        }
        page.drawImage(image, {
          x: element.x,
          y: height - element.y - element.height,
          width: element.width,
          height: element.height,
        });
      } catch (e) {
        console.error('[내보내기] 이미지 삽입 실패:', e);
      }
    }
  }

  console.log('[내보내기] PDF 저장 중...');
  const result = await newPdfDoc.save();
  console.log('[내보내기] 완료! 출력 파일 크기:', result.length, '바이트');
  console.log('[내보내기] ============================');
  return result;
}

export function downloadBlob(data: Uint8Array, filename: string) {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
