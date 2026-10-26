// 本人確認書類(住民票・印鑑証明書のみ対応)のOCR。
// app/ocr.py (Pythonサーバー版、Tesseract)からロジックを移植し、Tesseract.js(ブラウザ内WASM実行)
// に置き換えたもの。個人情報は一切サーバーに送らず、すべて端末内で処理する。
//
// 提示された印鑑証明書式では罫線を検出し、縦書きラベルと印影を除いて個別認識する。

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

function extractPersonFields(rawText) {
  return extractLabeledPersonFields(rawText);
}

// 住所・氏名ラベルの右側（同じOCR行）だけを抽出する。
function extractLabeledPersonFields(rawText) {
  const lines = rawText.split(/\r?\n/).map((line) => line
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")).filter(Boolean);
  const result = { shimei: "", jusho: "" };
  const labels = /ふりがな|フリガナ|氏名|生年月日|住所|従前|前住所|旧住所|本籍|筆頭者|世帯主|続柄|性別|男女の別|個人番号|住民票コード|登録番号|交付|発行|この写し|以上/;
  const names = lines.filter((line) => /^(?:氏名|名前)/.test(line));
  // 世帯票は対象者を特定できないため、自動入力を控える。
  if (names.length > 1) return result;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(氏名|現住所|住所)[：:]?(.*)$/);
    if (!match) continue;
    const key = match[1] === "氏名" ? "shimei" : "jusho";
    if (result[key]) continue;
    let value = match[2];
    value = value.split(labels)[0].replace(/^[：:]+/, "");
    result[key] = value;
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

// 縮小したグレー画像上の水平線から、添付書式の外枠と2本の内罫線を探す。
// 座標の固定切り抜きはしない。書式・傾きが一致しない場合はnullを返す。
function detectSealFields(gray, width, height) {
  const lines = [];
  for (let y = 0; y < height; y++) {
    let start = -1, last = -1;
    for (let x = 0; x <= width + 2; x++) {
      if (x < width && gray[y * width + x] < 180) {
        if (start < 0) start = x;
        last = x;
      } else if (start >= 0 && x - last > 2) {
        if (last - start > width * 0.35) lines.push({ x: start, end: last, y });
        start = -1;
      }
    }
  }
  const candidates = [];
  const tolerance = Math.max(3, width * 0.012);
  for (const top of lines) {
    const span = top.end - top.x;
    if (span < width * 0.45) continue;
    for (const bottom of lines) {
      const h = bottom.y - top.y;
      if (h < span * 0.22 || h > span * 0.65 ||
          Math.abs(bottom.x - top.x) > tolerance || Math.abs(bottom.end - top.end) > tolerance) continue;
      const inner = lines.filter((line) => line.y > top.y + h * 0.22 && line.y < top.y + h * 0.78 &&
        Math.abs(line.end - top.end) < tolerance &&
        line.x > top.x + span * 0.18 && line.x < top.x + span * 0.35);
      const rows = [];
      for (const line of inner) {
        if (!rows.length || line.y - rows[rows.length - 1].y > 3) rows.push(line);
      }
      if (rows.length !== 2 || rows[1].y - rows[0].y < h * 0.1) continue;
      // 値の左罫線は、外枠の約3割の位置。縦書きラベル列の右端を実測する。
      let valueX = -1;
      for (let x = Math.ceil(top.x + span * 0.28); x < top.x + span * 0.42; x++) {
        let count = 0;
        for (let y = top.y + 2; y < bottom.y - 2; y++) {
          if (gray[y * width + x] < 180) count++;
        }
        if (count > h * 0.8) valueX = x;
      }
      if (valueX < 0) continue;
      const inset = Math.max(3, span * 0.012);
      candidates.push({
        shimei: { x: valueX + inset, y: top.y + inset,
          width: top.end - valueX - inset * 2, height: rows[0].y - top.y - inset * 2 },
        jusho: { x: valueX + inset, y: rows[1].y + inset,
          width: top.end - valueX - inset * 2, height: bottom.y - rows[1].y - inset * 2 },
        area: span * h,
      });
    }
  }
  return candidates.sort((a, b) => b.area - a.area)[0] || null;
}

function findSealRegions(canvas) {
  const small = document.createElement("canvas");
  const scale = Math.min(1, 900 / canvas.width);
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  const ctx = small.getContext("2d");
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  const pixels = ctx.getImageData(0, 0, small.width, small.height).data;
  const gray = new Uint8Array(small.width * small.height);
  for (let i = 0; i < gray.length; i++) gray[i] = pixels[i * 4];
  const regions = detectSealFields(gray, small.width, small.height);
  if (!regions) return null;
  const result = {};
  for (const key of ["shimei", "jusho"]) {
    const r = regions[key];
    const crop = document.createElement("canvas");
    crop.width = Math.round(r.width / scale) + 32;
    crop.height = Math.round(r.height / scale) + 32;
    const out = crop.getContext("2d");
    out.fillStyle = "white";
    out.fillRect(0, 0, crop.width, crop.height);
    out.drawImage(canvas, r.x / scale, r.y / scale, r.width / scale, r.height / scale,
      16, 16, crop.width - 32, crop.height - 32);
    result[key] = crop;
  }
  return result;
}

async function recognizePerson(imageBitmap) {
  const canvas = preprocessToCanvas(imageBitmap);
  const worker = await getWorker();
  const regions = findSealRegions(canvas);
  if (regions) {
    const values = {};
    for (const key of ["shimei", "jusho"]) {
      // 住所は複数行を許可。氏名も空白を含めた1つの文字列として認識。
      await worker.setParameters({ tessedit_pageseg_mode: key === "shimei" ? "7" : "6" });
      const { data } = await worker.recognize(regions[key]);
      values[key] = normalizeCircledDigits(data.text || "").replace(/\s+/g, "");
    }
    return "氏名 " + values.shimei + "\n住所 " + values.jusho;
  }
  await worker.setParameters({ tessedit_pageseg_mode: "6" });
  const { data } = await worker.recognize(canvas);
  let text = normalizeCircledDigits(data.text || "");
  text = redactMyNumber(text);
  return text;
}

// 複数のカメラ欄から同時に呼ばれても、共有workerの設定が混ざらないよう直列化する。
let ocrQueue = Promise.resolve();
function runOcr(imageBitmap) {
  const pending = ocrQueue.then(() => recognizePerson(imageBitmap));
  ocrQueue = pending.catch(() => {});
  return pending;
}

window.Ocr = { runOcr, extractPersonFields };



