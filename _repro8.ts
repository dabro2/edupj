import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const FONT_PATH = path.join(process.env.TEMP!, 'opencode', 'NanumGothic-Regular.ttf');
const fontBytes = fs.readFileSync(FONT_PATH);
async function testSubset(subset: boolean) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset });
  const page = doc.addPage([595,842]);
  const txt = '운영 체제 정보 Windows 11 Home (수정됨) 한글테스트';
  console.log(`\n=== subset=${subset} txt="${txt}" font width test ===`);
  try {
    console.log('width', font.widthOfTextAtSize(txt, 14));
  } catch(e){ console.log('width fail', e); }
  page.drawText(txt, { x:72, y:700, size:14, font, color: rgb(0,0,0)});
  const bytes = await doc.save();
  const pdf = await pdfjsLib.getDocument({data: bytes}).promise;
  const p = await pdf.getPage(1);
  const opList = await p.getOperatorList();
  const OPS:any = pdfjsLib.OPS;
  const names = Object.fromEntries(Object.entries(OPS).map(([k,v])=>[v,k]));
  for(let i=0;i<opList.fnArray.length;i++) {
    if (names[opList.fnArray[i]]==='showText') {
      const glyphs = opList.argsArray[i][0];
      console.log(`showText glyphs=${glyphs.length} first isInFont counts true=${glyphs.filter((g:any)=>g.isInFont).length} false=${glyphs.filter((g:any)=>!g.isInFont).length}`);
      glyphs.forEach((g:any,idx:number)=>{
        if (idx<30) console.log(`  ${idx} unicode=${g.unicode} isInFont=${g.isInFont} fontChar=${JSON.stringify(g.fontChar)}`);
      });
    }
  }
  const tc = await p.getTextContent();
  console.log('textContent items', (tc.items as any[]).filter((it:any)=>'str' in it).map((it:any)=>it.str).join(' | '));
}
await testSubset(true);
await testSubset(false);
