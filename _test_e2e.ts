/**
 * E2E 테스트: PDF 열고 라인 수정 → 저장 → 재오픈 검증
 * 1) 수정된 라인 사라지지 않음
 * 2) 한글 폰트 정상
 */
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPageTexts } from './src/utils/pdfLoader';
import { exportPdf } from './src/utils/exportPdf';
import { usePdfStore } from './src/store/usePdfStore';

const FONT_PATH = path.join(process.env.TEMP!, 'opencode', 'NanumGothic-Regular.ttf');

// Node 환경 fetch shim
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input);
  if (url.endsWith('NanumGothic-Regular.ttf')) {
    const bytes = fs.readFileSync(FONT_PATH);
    return new Response(new Uint8Array(bytes), { status: 200 });
  }
  return realFetch(input as any, init as any);
};

function resetStore() {
  const s = usePdfStore.getState();
  s.setPdf(new Uint8Array(), '', []);
  // clear originalTexts/elements via setPdf
  usePdfStore.setState({ originalTexts: [], elements: [], pages: [], undoStack: [], redoStack: [] });
}

async function makeSamplePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // 원본 PDF도 전체 폰트 임베드 (subset:false) 로 생성하여 정상 한글 표시 가정
  const font = await doc.embedFont(fs.readFileSync(FONT_PATH), { subset: false });
  const page = doc.addPage([595, 842]);
  const lines = [
    { str: '운영 체제 정보 Windows 11 Pro', y: 700 },
    { str: '시스템 제조업체 Intel Corporation', y: 680 },
    { str: '주요 프로세서 Intel(R) Core(TM) i5', y: 660 },
    { str: '메모리 16GB DDR4', y: 640 },
  ];
  for (const l of lines) {
    page.drawText(l.str, { x: 72, y: l.y, size: 14, font, color: rgb(0, 0, 0) });
  }
  // 2페이지 추가
  const page2 = doc.addPage([595, 842]);
  page2.drawText('두 번째 페이지 한글 테스트: 서울시 강남구', { x: 72, y: 700, size: 14, font });
  page2.drawText('영문 혼용: Hello Seoul 2025', { x: 72, y: 680, size: 14, font });
  return doc.save();
}

async function verifyIsInFont(bytes: Uint8Array, targetKoreanSub: string) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const page = await pdf.getPage(1);
  const opList = await page.getOperatorList();
  const OPS: any = pdfjsLib.OPS;
  const names = Object.fromEntries(Object.entries(OPS).map(([k, v]) => [v, k]));
  for (let i = 0; i < opList.fnArray.length; i++) {
    if (names[opList.fnArray[i]] === 'showText') {
      const glyphs = opList.argsArray[i][0] as any[];
      const str = glyphs.map((g) => g.unicode).join('');
      if (str.includes(targetKoreanSub)) {
        const koreanGlyphs = glyphs.filter((g) => /[\uAC00-\uD7A3]/.test(g.unicode));
        const trueCnt = koreanGlyphs.filter((g) => g.isInFont).length;
        const falseCnt = koreanGlyphs.filter((g) => !g.isInFont).length;
        return { found: true, str, trueCnt, falseCnt, totalKorean: koreanGlyphs.length };
      }
    }
  }
  return { found: false, str: '', trueCnt: 0, falseCnt: 0, totalKorean: 0 };
}

async function runTests() {
  console.log('=== PDF 편집기 E2E 테스트 시작 ===\n');
  const pristine = await makeSamplePdf();
  console.log(`[준비] 원본 샘플 PDF 생성 완료: ${pristine.length} bytes, 2페이지`);
  fs.writeFileSync(path.join(process.env.TEMP!, 'opencode', 'e2e_pristine.pdf'), pristine);

  // ---- 테스트 1: 단일 라인 수정 후 저장 ----
  console.log('\n--- 테스트 1: 단일 라인 수정 (한글 포함) ---');
  resetStore();
  let store = usePdfStore.getState();
  store.setPdf(pristine.slice(), 'sample.pdf', [
    { id: 'page-1', width: 595, height: 842, rotation: 0, originalIndex: 0 },
    { id: 'page-2', width: 595, height: 842, rotation: 0, originalIndex: 1 },
  ]);
  const pdfLoaded = await pdfjsLib.getDocument({ data: pristine.slice() }).promise;
  const textsP1 = await extractPageTexts(pdfLoaded, 1);
  console.log(`추출된 라인 수(페이지1): ${textsP1.length}`);
  textsP1.forEach((t) => console.log(`  ${t.id}:"${t.content}"`));
  store.setOriginalTexts(textsP1.map((t) => ({ ...t, pageIndex: 0 })));
  // 페이지2도 추출
  const textsP2 = await extractPageTexts(pdfLoaded, 2);
  store.setOriginalTexts(textsP2.map((t) => ({ ...t, pageIndex: 1 })));

  const target = usePdfStore.getState().originalTexts.find((t) => t.content.includes('Windows 11 Pro'))!;
  console.log(`수정 대상: "${target.content}" (id=${target.id})`);
  const editedStr = '운영 체제 정보 Windows 11 Home (수정됨) 한글정상';
  usePdfStore.getState().updateOriginalText(target.id, editedStr);
  console.log(`수정 후: "${editedStr}"`);

  // 저장
  let st = usePdfStore.getState();
  const outBytes = await exportPdf(pristine.slice(), st.pages, st.elements, st.originalTexts);
  console.log(`내보내기 완료: ${outBytes.length} bytes`);
  fs.writeFileSync(path.join(process.env.TEMP!, 'opencode', 'e2e_out1.pdf'), outBytes);

  // 재오픈 검증: getTextContent로 수정 문자열 포함 여부
  const outPdf = await pdfjsLib.getDocument({ data: outBytes.slice() }).promise;
  const outPage1 = await outPdf.getPage(1);
  const tc = await outPage1.getTextContent();
  const allStr = (tc.items as any[]).filter((it) => 'str' in it).map((it) => it.str).join(' | ');
  console.log(`재오픈 textContent: ${allStr}`);
  const hasEdited = allStr.includes(editedStr) || allStr.includes('Windows 11 Home (수정됨)');
  const hasOriginalRemnant = allStr.includes('Windows 11 Pro');
  console.log(`수정된 문자열 포함? ${hasEdited ? '✅ YES' : '❌ NO'}`);
  // 원문이 흰 박스로 가려져 시각적으로는 안 보여야 하지만, 텍스트 스트림에는 여전히 남아있음(현재 구현). 
  // 시각적 검증은 isInFont와 operator 순서로 판단.
  // 사라짐 버그: 수정된 내용이 빈칸/사라짐이면 hasEdited가 false
  const test1Pass = hasEdited;
  console.log(`테스트1 결과: ${test1Pass ? '✅ PASS (수정 내용 유지됨, 사라지지 않음)' : '❌ FAIL (수정 내용 사라짐)'}`);

  // 한글 폰트 검증
  const fontCheck = await verifyIsInFont(outBytes, '한글정상');
  console.log(`한글 글리프 검증: found=${fontCheck.found}, totalKorean=${fontCheck.totalKorean}, true=${fontCheck.trueCnt}, false=${fontCheck.falseCnt}`);
  const koreanPass = fontCheck.found && fontCheck.falseCnt === 0;
  console.log(`한글 폰트 결과: ${koreanPass ? '✅ PASS (모든 한글 글리프 isInFont true)' : '❌ FAIL (깨짐)'}`);

  // 재오픈 후 extractPageTexts로도 edited가 보이는지 (중복 포함이더라도)
  const reExtract = await extractPageTexts(outPdf, 1);
  console.log(`재오픈 후 extractPageTexts 라인 수: ${reExtract.length}`);
  reExtract.forEach((t) => console.log(`  ${t.id}:"${t.content}"`));
  const reHasEdited = reExtract.some((t) => t.content.includes('수정됨'));
  console.log(`재추출에 수정됨 포함? ${reHasEdited ? '✅ YES' : '❌ NO'}`);

  // ---- 테스트 2: 페이지 이동 후 저장 (병합 보존) ----
  console.log('\n--- 테스트 2: 페이지 이동 후 저장 시 수정 보존 ---');
  // 시뮬레이션: 페이지1 수정 후 페이지2로 이동했다가 다시 페이지1로 돌아오는 흐름
  // CanvasViewer의 setOriginalTexts 병합 로직 테스트
  resetStore();
  store = usePdfStore.getState();
  store.setPdf(pristine.slice(), 'sample.pdf', [
    { id: 'page-1', width: 595, height: 842, rotation: 0, originalIndex: 0 },
    { id: 'page-2', width: 595, height: 842, rotation: 0, originalIndex: 1 },
  ]);
  const pdfLoaded2 = await pdfjsLib.getDocument({ data: pristine.slice() }).promise;
  const tP1_first = await extractPageTexts(pdfLoaded2, 1);
  store.setOriginalTexts(tP1_first.map((t) => ({ ...t, pageIndex: 0 })));
  const target2 = usePdfStore.getState().originalTexts[0];
  const edited2 = '운영 체제 정보 Windows 11 Pro → 수정 테스트2';
  store.updateOriginalText(target2.id, edited2);
  console.log(`페이지1 수정: "${edited2}"`);
  // 페이지2로 이동
  const tP2 = await extractPageTexts(pdfLoaded2, 2);
  store.setOriginalTexts(tP2.map((t) => ({ ...t, pageIndex: 1 })));
  console.log(`페이지2 추출 병합 후, 페이지1 수정 유지? ${usePdfStore.getState().originalTexts.find((t) => t.id === target2.id)?.content === edited2 ? '✅ YES' : '❌ NO'}`);
  // 다시 페이지1로 이동 (재추출)
  const tP1_again = await extractPageTexts(pdfLoaded2, 1);
  store.setOriginalTexts(tP1_again.map((t) => ({ ...t, pageIndex: 0 })));
  const after = usePdfStore.getState().originalTexts.find((t) => t.id === target2.id);
  console.log(`재추출 후 페이지1 수정 유지? ${after?.content === edited2 && after?._changed ? '✅ YES' : '❌ NO'}`);
  st = usePdfStore.getState();
  const out2 = await exportPdf(pristine.slice(), st.pages, st.elements, st.originalTexts);
  const outPdf2 = await pdfjsLib.getDocument({ data: out2.slice() }).promise;
  const tc2 = await (await outPdf2.getPage(1)).getTextContent();
  const allStr2 = (tc2.items as any[]).filter((it) => 'str' in it).map((it) => it.str).join(' | ');
  const hasEdited2 = allStr2.includes('수정 테스트2');
  console.log(`저장 후 재오픈에 수정2 포함? ${hasEdited2 ? '✅ YES' : '❌ NO'}`);
  const test2Pass = hasEdited2 && after?.content === edited2;
  console.log(`테스트2 결과: ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);

  // ---- 테스트 3: 영문+한글 혼용 및 특수문자 ----
  console.log('\n--- 테스트 3: 영문/한글/특수문자 혼용 ---');
  resetStore();
  store = usePdfStore.getState();
  store.setPdf(pristine.slice(), 'sample.pdf', [
    { id: 'page-1', width: 595, height: 842, rotation: 0, originalIndex: 0 },
    { id: 'page-2', width: 595, height: 842, rotation: 0, originalIndex: 1 },
  ]);
  const pdfLoaded3 = await pdfjsLib.getDocument({ data: pristine.slice() }).promise;
  const tP1_3 = await extractPageTexts(pdfLoaded3, 1);
  store.setOriginalTexts(tP1_3.map((t) => ({ ...t, pageIndex: 0 })));
  // 두 번째 라인 수정: "시스템 제조업체 Intel Corporation" → 한글+특수문자
  const target3 = usePdfStore.getState().originalTexts.find((t) => t.content.includes('시스템 제조업체'))!;
  const edited3 = '시스템 제조업체 삼성전자(주) ★ 한글+English 123';
  store.updateOriginalText(target3.id, edited3);
  console.log(`수정3: "${edited3}"`);
  st = usePdfStore.getState();
  const out3 = await exportPdf(pristine.slice(), st.pages, st.elements, st.originalTexts);
  const fontCheck3 = await verifyIsInFont(out3, '삼성전자');
  console.log(`한글+특수문자 글리프: totalKorean=${fontCheck3.totalKorean} true=${fontCheck3.trueCnt} false=${fontCheck3.falseCnt}`);
  const outPdf3 = await pdfjsLib.getDocument({ data: out3.slice() }).promise;
  const tc3 = await (await outPdf3.getPage(1)).getTextContent();
  const allStr3 = (tc3.items as any[]).filter((it) => 'str' in it).map((it) => it.str).join(' | ');
  const hasEdited3 = allStr3.includes('삼성전자');
  console.log(`저장 후 포함? ${hasEdited3 ? '✅ YES' : '❌ NO'}`);
  console.log(`테스트3 결과: ${hasEdited3 && fontCheck3.falseCnt === 0 ? '✅ PASS' : '❌ FAIL'}`);

  // ---- 종합 ----
  console.log('\n=== 종합 결과 ===');
  console.log(`테스트1 (단일 라인 수정 유지): ${test1Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`테스트1 한글 폰트: ${koreanPass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`테스트2 (페이지 이동 보존): ${test2Pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`테스트3 (혼용): ${hasEdited3 && fontCheck3.falseCnt === 0 ? '✅ PASS' : '❌ FAIL'}`);
  const allPass = test1Pass && koreanPass && test2Pass && hasEdited3;
  console.log(`\n전체: ${allPass ? '✅ ALL PASS' : '❌ SOME FAIL'}`);
  if (!allPass) process.exit(1);
}

runTests().catch((e) => {
  console.error('테스트 에러', e);
  process.exit(1);
});
