// 실제 앱 모듈(store + pdfLoader + exportPdf)을 Node에서 그대로 실행하는 통합 테스트
import fs from 'node:fs';
import path from 'node:path';

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import { usePdfStore } from './src/store/usePdfStore';
import { extractPageTexts } from './src/utils/pdfLoader';
import { exportPdf } from './src/utils/exportPdf';

const FONT_PATH = path.join(process.env.TEMP, 'opencode', 'NanumGothic-Regular.ttf');

// fetch 심(shim): '/NanumGothic-Regular.ttf' → 실제 파일 반환
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input);
  if (url.endsWith('NanumGothic-Regular.ttf')) {
    const bytes = fs.readFileSync(FONT_PATH);
    return new Response(new Uint8Array(bytes), { status: 200 });
  }
  return realFetch(input as any, init as any);
};

// DOMMatrix 심 (레거시 빌드에는 불필요; 제거)
void 0;

// ── 샘플 PDF 생성 ──
async function makeSample(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595, 842]);
  const nanum = await doc.embedFont(fs.readFileSync(FONT_PATH), { subset: true });
  const lines = [
    { str: '운영 체제 정보 Windows 11 Pro', y: 700, size: 14 },
    { str: '시스템 제조업체 Intel Corporation', y: 680, size: 14 },
    { str: '주요 프로세서 Intel(R) Core(TM) i5', y: 660, size: 14 },
  ];
  for (const l of lines) page.drawText(l.str, { x: 72, y: l.y, size: l.size, font: nanum, color: rgb(0,0,0) });
  return doc.save();
}

// pdfjs로 재추출 헬퍼
async function reExtract(bytes: Uint8Array) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const p = await pdf.getPage(1);
  const vp = p.getViewport({ scale: 1 });
  const tc = await p.getTextContent();
  const items: string[] = [];
  for (const it of tc.items) {
    if ('str' in it && it.str) {
      const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
      items.push(`${it.str} @${tx[4].toFixed(1)},${tx[5].toFixed(1)}`);
    }
  }
  return items;
}

const bytes = await makeSample();
const pristine = bytes.slice();
console.log('샘플 생성 OK', bytes.length);

const store = usePdfStore.getState();
store.setPdf(pristine.slice(), 'sample.pdf', [
  { id: 'page-1', width: 595, height: 842, rotation: 0, originalIndex: 0 },
]);

// 프로덕션 CanvasViewer와 동일하게 추출하되, Node 환경이므로 legacy 프록시를 실제 extractPageTexts에 전달
console.log('추출 시작...');
const pdfLoaded = await pdfjsLib.getDocument({ data: pristine.slice() }).promise;
const texts = await extractPageTexts(pdfLoaded, 1);
console.log('추출 결과:');
texts.forEach((t) => console.log(`  [${t.id}] "${t.content}" y=${t.y.toFixed(1)} fs=${t.fontSize.toFixed(1)} w=${t.width.toFixed(1)}`));

const mapped = texts.map((t) => ({ ...t, pageIndex: 0 }));
store.setOriginalTexts(mapped);

// ── 편집 ──
const target = usePdfStore.getState().originalTexts[0];
console.log('\n편집 전:', JSON.stringify(target.content));
store.updateOriginalText(target.id, '운영 체제 정보 Windows 11 Home (수정됨)');
console.log('편집 후:', JSON.stringify(usePdfStore.getState().originalTexts[0].content), 'changed=', usePdfStore.getState().originalTexts[0]._changed);

// ── 다른 페이지 이동 후 복귀 시뮬레이션(추출 재실행 + 병합) ──
const textsFresh = await extractPageTexts(pdfLoaded, 1);
store.setOriginalTexts(textsFresh.map((t) => ({ ...t, pageIndex: 0 })));
console.log('\n재추출 병합 후 0번 항목:', JSON.stringify(usePdfStore.getState().originalTexts[0].content), 'changed=', usePdfStore.getState().originalTexts[0]._changed);

// ── 실제 exportPdf 호출 ──
const st = usePdfStore.getState();
const out = await exportPdf(pristine.slice(), st.pages, st.elements, st.originalTexts);
console.log('\n내보내기 완료', out.length, 'bytes');
const items = await reExtract(out);
console.log('내보낸 PDF 텍스트 아이템:');
items.forEach((i) => console.log('  ', i));

const edited = '운영 체제 정보 Windows 11 Home (수정됨)';
console.log('\n결과:', items.some((i) => i.includes(edited)) ? '✅ 수정 텍스트 존재' : '❌ 수정 텍스트 없음(삭제됨)');
console.log('        ', items.some((i) => i.startsWith('운영 체제 정보 Windows 11 Pro @')) ? '⚠️ 원문 그리기 데이터 잔존' : '원문 없음');