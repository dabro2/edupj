import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extractPageTexts } from './src/utils/pdfLoader';
import { exportPdf } from './src/utils/exportPdf';
import { usePdfStore } from './src/store/usePdfStore';

const FONT_PATH = path.join(process.env.TEMP!, 'opencode', 'NanumGothic-Regular.ttf');
const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = String(input);
  if (url.endsWith('NanumGothic-Regular.ttf')) {
    const bytes = fs.readFileSync(FONT_PATH);
    return new Response(new Uint8Array(bytes), { status: 200 });
  }
  return realFetch(input as any, init as any);
};

async function makeSample(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595, 842]);
  const nanum = await doc.embedFont(fs.readFileSync(FONT_PATH), { subset: true });
  page.drawText('운영 체제 정보 Windows 11 Pro', { x: 72, y: 700, size: 14, font: nanum });
  page.drawText('시스템 제조업체 Intel Corporation', { x: 72, y: 680, size: 14, font: nanum });
  page.drawText('주요 프로세서 Intel(R) Core(TM) i5', { x: 72, y: 660, size: 14, font: nanum });
  return doc.save();
}
const bytes = await makeSample();
const store = usePdfStore.getState();
store.setPdf(bytes.slice(), 'sample.pdf', [{ id:'page-1', width:595, height:842, rotation:0, originalIndex:0 }]);
const pdfLoaded = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
const texts = await extractPageTexts(pdfLoaded, 1);
store.setOriginalTexts(texts.map(t=> ({...t, pageIndex:0})));
const target = usePdfStore.getState().originalTexts[0];
console.log('target before', target);
store.updateOriginalText(target.id, '운영 체제 정보 Windows 11 Home (수정됨)');
const st = usePdfStore.getState();
const out = await exportPdf(bytes.slice(), st.pages, st.elements, st.originalTexts);
const outPdf = await pdfjsLib.getDocument({ data: out.slice() }).promise;
const page = await outPdf.getPage(1);
const tc = await page.getTextContent();
for (const it of tc.items as any[]) {
  if ('str' in it) {
    console.log(`str="${it.str}" font=${it.fontName} dir=${it.dir} transform=${JSON.stringify(it.transform)}`);
  }
}
const opList = await page.getOperatorList();
const OPS: any = pdfjsLib.OPS;
const opNames = Object.fromEntries(Object.entries(OPS).map(([k,v])=>[v,k]));
for (let i=0;i<opList.fnArray.length;i++) {
  const name = opNames[opList.fnArray[i]];
  if (name==='showText') {
    const args = opList.argsArray[i];
    // args is array with one element array of glyphs
    const glyphs = args[0];
    const str = glyphs.map((g:any)=>g.unicode).join('');
    const isInFontArr = glyphs.map((g:any)=> g.isInFont?'1':'0').join('');
    console.log(`showText ${i}: "${str}" isInFont=${isInFontArr.slice(0,50)} font transform pending`);
  }
}
