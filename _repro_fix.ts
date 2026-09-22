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
  // Use subset false for pristine to ensure correct baseline; but pristine font doesn't matter, we just test export
  const font = await doc.embedFont(fs.readFileSync(FONT_PATH), { subset: false });
  const page = doc.addPage([595,842]);
  page.drawText('운영 체제 정보 Windows 11 Pro', { x:72, y:700, size:14, font });
  page.drawText('시스템 제조업체 Intel Corporation', { x:72, y:680, size:14, font });
  page.drawText('주요 프로세서 Intel(R) Core(TM) i5', { x:72, y:660, size:14, font });
  return doc.save();
}

const bytes = await makeSample();
console.log('pristine bytes', bytes.length);
const store = usePdfStore.getState();
store.setPdf(bytes.slice(), 'sample.pdf', [{id:'page-1', width:595,height:842,rotation:0,originalIndex:0}]);
const pdfLoaded = await pdfjsLib.getDocument({data: bytes.slice()}).promise;
const texts = await extractPageTexts(pdfLoaded,1);
console.log('extracted', texts.map(t=>`"${t.content}" y=${t.y}`));
store.setOriginalTexts(texts.map(t=>({...t,pageIndex:0})));
const target = usePdfStore.getState().originalTexts[0];
console.log('editing', target.content);
store.updateOriginalText(target.id, '운영 체제 정보 Windows 11 Home (수정됨) 한글정상확인');
const st = usePdfStore.getState();
console.log('changed count', st.originalTexts.filter(t=>t._changed).length);
const out = await exportPdf(bytes.slice(), st.pages, st.elements, st.originalTexts);
console.log('exported bytes', out.length);
fs.writeFileSync(path.join(process.env.TEMP!, 'opencode', 'fix_out.pdf'), out);
console.log('saved to fix_out.pdf');

const outPdf = await pdfjsLib.getDocument({data: out.slice()}).promise;
const page = await outPdf.getPage(1);
const opList = await page.getOperatorList();
const OPS:any = pdfjsLib.OPS;
const names = Object.fromEntries(Object.entries(OPS).map(([k,v])=>[v,k]));
let showTexts:any[]=[];
for(let i=0;i<opList.fnArray.length;i++){
  if(names[opList.fnArray[i]]==='showText'){
    const glyphs = opList.argsArray[i][0];
    const str = glyphs.map((g:any)=>g.unicode).join('');
    const trueCnt = glyphs.filter((g:any)=>g.isInFont).length;
    const falseCnt = glyphs.filter((g:any)=>!g.isInFont).length;
    console.log(`showText "${str}" isInFont true=${trueCnt} false=${falseCnt}`);
    showTexts.push(str);
  }
}
const hasEdited = showTexts.some(s=>s.includes('운영 체제 정보 Windows 11 Home (수정됨)'));
console.log(' edited visible in showText?', hasEdited ? '✅ YES' : '❌ NO');

// Check that edited Korean glyphs are isInFont true (except spaces)
const editedOpIdx = opList.fnArray.findIndex((fn:any,i:number)=> names[fn]==='showText' && opList.argsArray[i][0].map((g:any)=>g.unicode).join('').includes('한글정상확인'));
if(editedOpIdx!==-1){
  const glyphs = opList.argsArray[editedOpIdx][0];
  const koreanGlyphs = glyphs.filter((g:any)=> /[\uAC00-\uD7A3]/.test(g.unicode));
  const kTrue = koreanGlyphs.filter((g:any)=>g.isInFont).length;
  const kFalse = koreanGlyphs.filter((g:any)=>!g.isInFont).length;
  console.log(`Korean glyphs in edited: true=${kTrue} false=${kFalse} total=${koreanGlyphs.length}`);
  console.log(kFalse===0 ? '✅ 한글 글리프 모두 isInFont true (렌더링 정상)' : '❌ 일부 한글 글리프 isInFont false (렌더링 깨짐)');
} else {
  console.log('edited op not found for 한글정상확인');
}
const tc = await page.getTextContent();
console.log('textContent strings:', (tc.items as any[]).filter((it:any)=>'str' in it).map((it:any)=>`"${it.str}"`).join(' | '));
