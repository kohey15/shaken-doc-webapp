// 本人確認書類(住民票・印鑑証明書のみ対応)のOCR。
// app/ocr.py (Pythonサーバー版、Tesseract)からロジックを移植し、Tesseract.js(ブラウザ内WASM実行)
// に置き換えたもの。個人情報は一切サーバーに送らず、すべて端末内で処理する。
//
// 簡略化した点: サーバー版は複数のPSM(ページ分割モード)を試して信頼度の高い方を採用していたが、
// モバイル端末での実行時間を考慮し、書類(住民票・印鑑証明書)に適した単一のPSMに絞っている。

const UPSCALE_TARGET_LONG_SIDE = 2200;

const CIRCLED_DIGIT_MAP = (() => {
  const map = { "⓪": "0" };
  for (let i = 1; i <= 20; i++) map[String.fromCodePoint(0x2460 + i - 1)] = String(i);
  for (let i = 21; i <= 35; i++) map[String.fromCodePoint(0x3251 + i - 21)] = String(i);
  for (let i = 36; i <= 50; i++) map[String.fromCodePoint(0x32b1 + i - 36)] = String(i);
  return map;
})();

function normalizeCircledDigits(text) {
  return text.replace(/[⓪①-⑳㉑-㉟㊱-㊿]/g, (ch) => CIRCLED_DIGIT_MAP[ch] || ch);
}

const DATE_RE = /(?:明治|大正|昭和|平成|令和)(?:元|\d{1,2})年\s?\d{1,2}月\s?\d{1,2}日|(?:19|20)\d{2}[年./-]\s?\d{1,2}[月./-]\s?\d{1,2}/;
const FURIGANA_ONLY_RE = /^[ァ-ヶーA-Za-z0-9]+$/;
const MY_NUMBER_LABEL_RE = /個人番号|マイナンバー/;
const MY_NUMBER_VALUE_RE = /\d[\d\s-]{10,15}\d/g;

function redactMyNumber(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (MY_NUMBER_LABEL_RE.test(lines[i])) {
      lines[i] = lines[i].replace(MY_NUMBER_VALUE_RE, "[マイナンバー・伏字]");
      if (i + 1 < lines.length) lines[i + 1] = lines[i + 1].replace(MY_NUMBER_VALUE_RE, "[マイナンバー・伏字]");
    }
  }
  return lines.join("\n");
}

function firstNonFuriganaLine(lines, start) {
  for (const j of [start, start + 1]) {
    if (j < lines.length && lines[j] && !FURIGANA_ONLY_RE.test(lines[j])) return lines[j];
  }
  return "";
}

function extractPersonFields(rawText) {
  const rawLines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const lines = rawLines.map((l) => l.replace(/\s+/g, ""));
  const result = { shimei: "", jusho: "", seinengappi: "" };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!result.seinengappi && line.includes("生年月日")) {
      const after = line.split("生年月日")[1] || "";
      let m = after.match(DATE_RE);
      if (!m && i + 1 < lines.length) m = lines[i + 1].match(DATE_RE);
      if (m) result.seinengappi = m[0];
    }
    if (!result.jusho && line.includes("住所")) {
      const after = (line.split("住所")[1] || "").replace(/^[： :]+/, "");
      result.jusho = after || firstNonFuriganaLine(lines, i + 1);
    }
    if (!result.shimei && line.includes("氏名")) {
      const after = (line.split("氏名")[1] || "").replace(/^[： :]+/, "");
      if (after && !FURIGANA_ONLY_RE.test(after)) {
        result.shimei = after;
      } else {
        result.shimei = firstNonFuriganaLine(lines, i + 1);
      }
    }
  }

  if (!result.seinengappi) {
    for (const line of lines.slice(0, 4)) {
      const m = line.match(DATE_RE);
      if (m) {
        result.seinengappi = m[0];
        break;
      }
    }
  }

  return result;
}

function preprocessToCanvas(imageBitmap) {
  const longSide = Math.max(imageBitmap.width, imageBitmap.height);
  const scale = longSide < UPSCALE_TARGET_LONG_SIDE ? UPSCALE_TARGET_LONG_SIDE / longSide : 1;
  const w = Math.round(imageBitmap.width * scale);
  const h = Math.round(imageBitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0, w, h);

  // グレースケール化 + 簡易オートコントラスト(影・逆光による低コントラストの補正)
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  let min = 255;
  let max = 0;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0; i < data.length; i += 4) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[i / 4] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(max - min, 1);
  for (let i = 0; i < gray.length; i++) {
    const stretched = ((gray[i] - min) / range) * 255;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = stretched;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker("jpn", 1, {
      langPath: "./tessdata",
      gzip: false,
    });
  }
  return workerPromise;
}

async function runOcr(imageBitmap) {
  const canvas = preprocessToCanvas(imageBitmap);
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: "6" });
  const { data } = await worker.recognize(canvas);
  let text = normalizeCircledDigits(data.text || "");
  text = redactMyNumber(text);
  return text;
}

window.Ocr = { runOcr, extractPersonFields };
