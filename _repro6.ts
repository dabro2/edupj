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
  page.drawText('운영 체제 정보 Windows 11 Pro', { x:72, y:700, size:14, font:nanum});
  return doc.save();
}
const bytes = await makeSample();
const store = usePdfStore.getState();
store.setPdf(bytes.slice(), 'sample.pdf', [{id:'page-1', width:595,height:842,rotation:0,originalIndex:0}]);
const pdfLoaded = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
const texts = await extractPageTexts(pdfLoaded,1);
store.setOriginalTexts(texts.map(t=>({...t,pageIndex:0})));
const target= usePdfStore.getState().originalTexts[0];
store.updateOriginalText(target.id, '운영 체제 정보 Windows 11 Home (수정됨) 한글테스트');
const st= usePdfStore.getState();
const out= await exportPdf(bytes.slice(), st.pages, st.elements, st.originalTexts);
const raw = Buffer.from(out).toString('latin1');
function extractFontSections(s: string) {
  // find all Font objects
  const fontRegex = /\/Subtype\s+\/(\w+)[^>]*\/BaseFont\s+\/(\S+)[^>]*\/ToUnicode/g;
  let m;
  while((m=fontRegex.exec(s))!==null) {
    console.log('Font found subtype', m[1], 'base', m[2]);
    console.log(s.slice(m.index-500, m.index+800));
    console.log('---');
  }
}
extractFontSections(raw);
console.log('has ToUnicode', raw.includes('/ToUnicode'));
console.log('has Identity-H', raw.includes('Identity-H'));
console.log('has WinAnsi', raw.includes('WinAnsi'));
console.log('has CID', raw.includes('/CID'));
console.log('has TrueType', raw.includes('TrueType'));
console.log('has Type0', raw.includes('Type0'));

// Print font dict snippets
const fontDictIdx = raw.indexOf('/Type /Font');
console.log(raw.slice(fontDictIdx-200, fontDictIdx+1500));
