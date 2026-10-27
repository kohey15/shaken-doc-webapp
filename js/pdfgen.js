// 申請書PDFへのデータ差し込み。app/pdf_fill.py (PyMuPDF版)からロジックを移植し、
// ブラウザ内で完結するpdf-libに置き換えたもの。
//
// 座標変換について: js/pdf_fields.js の数値はPyMuPDF座標系(左上原点、y=下方向)のまま
// 保持している。pdf-libは左下原点・y=上方向のため、この関数群の中で
// `pdfLibY = pageHeight - pymupdfY` の変換を行う(較正値そのものは一切変更しない)。

const { PDFDocument, rgb } = PDFLib;

let fontBytesPromise = null;
function getFontBytes() {
  if (!fontBytesPromise) {
    fontBytesPromise = fetch("./assets/fonts/NotoSansJP-Regular-static.ttf").then((r) => r.arrayBuffer());
  }
  return fontBytesPromise;
}

// NotoSansJP-Regular-static.ttf は、元の可変フォント(NotoSansJP-VF.ttf)から
// fonttoolsでウェイト400(Regular)を固定インスタンス化したもの(pdf-libは可変フォントを
// 正しく扱えないため)。
//
// 重要: embedFontの `subset: true` は使わない。実機検証の結果、pdf-lib 1.17.1 +
// @pdf-lib/fontkit 1.1.1 の組み合わせでは、日本語のようにグリフ数の多いフォントを
// サブセット化すると大半の文字が欠落する(1文字ずつ描画しても再現する、既知の
// ライブラリ側の不具合)。フルフォント埋め込み(subset: false)にすると欠落は起きない。
// ファイルサイズは1書類あたり約3.4MBに増えるが、印刷は端末内で完結するため実用上
// 問題ない(生成後にBlob URLはfinishAndCleanup()で破棄される)。

function drawGridText(page, boxes, text, fontsize, font, pageHeight) {
  const chars = Array.from(text || "");
  boxes.forEach((box, i) => {
    const ch = chars[i];
    if (!ch) return;
    const [x0, y0, x1, y1] = box;
    const cx = (x0 + x1) / 2;
    const cyPdf = pageHeight - (y0 + y1) / 2;
    const tx = cx - fontsize * 0.32;
    const ty = cyPdf - fontsize * 0.35;
    page.drawText(ch, { x: tx, y: ty, size: fontsize, font, color: rgb(0, 0, 0) });
  });
}

function drawLineText(page, pos, text, fontsize, font, maxWidth, pageHeight) {
  if (!text) return;
  const [x, yPymupdf] = pos;
  const y = pageHeight - yPymupdf;
  let size = fontsize;
  while (size > 6 && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
}

async function fillDocument(templateUrl, gridFields, lineFields, data, decorate = null) {
  const [templateBytes, fontBytes] = await Promise.all([
    fetch(templateUrl).then((r) => r.arrayBuffer()),
    getFontBytes(),
  ]);
  const pdfDoc = await PDFDocument.load(templateBytes);
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, { subset: false });
  const page = pdfDoc.getPage(0);
  const pageHeight = page.getHeight();

  for (const [fieldName, cfg] of Object.entries(gridFields || {})) {
    const value = data[fieldName];
    if (value) drawGridText(page, cfg.boxes, String(value), cfg.fontsize, font, pageHeight);
  }
  for (const [fieldName, cfg] of Object.entries(lineFields || {})) {
    const value = data[fieldName];
    if (value) drawLineText(page, cfg.pos, String(value), cfg.fontsize, font, cfg.max_width, pageHeight);
  }

  if(decorate)await decorate(pdfDoc,page,font);
  return pdfDoc.save();
}

async function fillKeizokuKensa(data) {
  return fillDocument("./templates/keizoku_kensa_3_normalized.pdf", PdfFields.KEIZOKU_GRID_FIELDS, PdfFields.KEIZOKU_LINE_FIELDS, data);
}

async function fillItenTouroku(data) {
  return fillDocument("./templates/iten_touroku_1_normalized.pdf", PdfFields.ITEN_GRID_FIELDS, PdfFields.ITEN_LINE_FIELDS, data);
}

async function fillJuryozeiNofusho(data) {
  return fillDocument("./templates/juryozei_nofusho_1.pdf", PdfFields.JURYOZEI_GRID_FIELDS, PdfFields.JURYOZEI_LINE_FIELDS, data,async(doc,page,japaneseFont)=>{
    const font=await doc.embedFont('Helvetica'),h=page.getHeight();
    // 新規欄の追加。既存の較正座標は変更しない。数値はASCIIフォントで欠落を防ぐ。
    if(Number.isInteger(data.juryozei_amount) && data.juryozei_amount>=0){
      const text=String(data.juryozei_amount),size=12;
      page.drawText(text,{x:765-font.widthOfTextAtSize(text,size),y:h-185,size,font,color:rgb(0,0,0)});
    }
    if(Number.isInteger(data.juryozei_weight_kg) && data.juryozei_weight_kg>0){
      const text=String(data.juryozei_weight_kg),size=11;
      page.drawText(text,{x:477-font.widthOfTextAtSize(text,size),y:h-215,size,font,color:rgb(0,0,0)});
    }
    if(data.juryozei_exempt)page.drawText('免税',{x:65,y:h-340,size:11,font:japaneseFont,color:rgb(0,0,0)});
  });
}

async function fillIninjo(data) {
  return fillDocument("./templates/ininjo.pdf", {}, PdfFields.ININJO_LINE_FIELDS, data);
}

async function fillShako(data) {
  return Shako.fillPdf(data, { PDFDocument, rgb, fontkit, getFontBytes });
}
function fillMassho(kind,data) {
  return Massho.fillPdf(kind,data,{ PDFDocument,rgb,fontkit,getFontBytes,ininjoFields:PdfFields.ININJO_LINE_FIELDS });
}
const fillMasshoApplication=data=>fillMassho('application',data);
const fillMasshoFee=data=>fillMassho('fee',data);
const fillMasshoIninjo=data=>fillMassho('delegation',data);
window.PdfGen = { fillKeizokuKensa, fillItenTouroku, fillJuryozeiNofusho, fillIninjo, fillShako, fillMasshoApplication, fillMasshoFee, fillMasshoIninjo };
