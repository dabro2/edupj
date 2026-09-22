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
  const lines = [
    { str: '운영 체제 정보 Windows 11 Pro', y: 700, size: 14 },
    { str: '시스템 제조업체 Intel Corporation', y: 680, size: 14 },
    { str: '주요 프로세서 Intel(R) Core(TM) i5', y: 660, size: 14 },
  ];
  for (const l of lines) page.drawText(l.str, { x: 72, y: l.y, size: l.size, font: nanum, color: rgb(0,0,0) });
  return doc.save();
}
function dumpContent(pdfLibDoc: PDFDocument) {
  // iterate pages and dump operators
  const pages = pdfLibDoc.getPages();
  for (let i=0;i<pages.length;i++) {
    const p = pages[i];
    // access internal content stream via getContentStream? Use pdf-lib internal
    const node: any = (p as any).node;
    console.log('Page', i, 'node keys', Object.keys(node));
    // Try to get contents
    const contents = node.getMaybe('Contents') ?? node.get('Contents');
    console.log('Contents', contents);
    if (contents && typeof contents.lookupMaybe === 'function') { try { console.log(contents.lookupMaybe) } catch(e){} }
  }
}

const bytes = await makeSample();
console.log('sample bytes', bytes.length);
// Save pristine to inspect via pdfjs operators
const store = usePdfStore.getState();
store.setPdf(bytes.slice(), 'sample.pdf', [{ id:'page-1', width:595, height:842, rotation:0, originalIndex:0 }]);
const pdfLoaded = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
const texts = await extractPageTexts(pdfLoaded, 1);
console.log('extracted', texts.map(t=> `${t.id}:"${t.content}" y=${t.y.toFixed(1)}`));
const mapped = texts.map(t=> ({...t, pageIndex:0}));
store.setOriginalTexts(mapped);
const target = usePdfStore.getState().originalTexts[0];
store.updateOriginalText(target.id, '운영 체제 정보 Windows 11 Home (수정됨)');
const st = usePdfStore.getState();
const out = await exportPdf(bytes.slice(), st.pages, st.elements, st.originalTexts);
console.log('out length', out.length);
fs.writeFileSync(path.join(process.env.TEMP!, 'opencode', 'repro3_out.pdf'), out);
console.log('wrote to temp opencode repro3_out.pdf');

// Inspect via pdf-lib load
const outDoc = await PDFDocument.load(out);
const outPages = outDoc.getPages();
console.log('out pages', outPages.length);
const first = outPages[0];
console.log('size', first.getSize());
console.log('rotation', first.getRotation());

// pdfjs operator list
const outPdf = await pdfjsLib.getDocument({ data: out.slice() }).promise;
const page = await outPdf.getPage(1);
const opList = await page.getOperatorList();
console.log('operatorList total', opList.fnArray.length);
const OPS: any = pdfjsLib.OPS;
const opNames = Object.fromEntries(Object.entries(OPS).map(([k,v])=>[v,k]));
let textOps: any[] = [];
for (let i=0;i<opList.fnArray.length;i++) {
  const fn = opList.fnArray[i];
  const args = opList.argsArray[i];
  const name = opNames[fn] || fn;
  if (name==='showText' || name==='showSpacedText' || name==='setFont' || name==='setFillRGBColor' || name==='constructPath' || name==='fill' || name==='rectangle') {
    console.log(`op ${i}: ${name} args=${JSON.stringify(args)?.slice(0,500)}`);
  }
  if (name==='showText' || name==='showSpacedText') textOps.push({i,name,args});
}
console.log('text ops count', textOps.length);

// Also dump raw content via pdfjs page textContent including operator transform?
// Check rectangle presence: search for constructPath rectangle with white color
// For deeper, use pdf-lib to inspect content stream string
// Let's try to decode contents via pdf-lib internals: Save without object streams and inspect string
// Load with update field?
const raw = Buffer.from(out).toString('latin1');
let idx = raw.indexOf('BT');
console.log('BT occurrences', (raw.match(/BT/g)||[]).length);
console.log('q occurrences', (raw.match(/\nq/g)||[]).length);
// Find white rectangle: look for "1 1 1 rg" or "1 g" near rectangle
const whiteIdx = raw.indexOf('1 1 1 rg');
console.log('white rg idx', whiteIdx, raw.slice(whiteIdx-200, whiteIdx+500).replace(/[\x00-\x1F]/g,' '));

// Try to extract stream content by decompress?
