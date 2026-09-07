// 画面のワイヤリング。すべてこの端末(ブラウザ)内だけで完結し、サーバーとは一切通信しない。

let currentProcedure = null;
let shakenshoLoaded = false;
let shakenshoData = null;
let generatedBlobUrls = [];

const JURYOZEI_CHECK = "✓";

const DOC_CONFIG = {
  "keizoku-kensa": { build: buildKeizokuPayload, fill: PdfGen.fillKeizokuKensa },
  "iten-touroku": { build: buildItenPayload, fill: PdfGen.fillItenTouroku },
  "ininjo": { build: buildIninjoPayload, fill: PdfGen.fillIninjo },
  "juryozei-nofusho": { build: buildJuryozeiPayload, fill: PdfGen.fillJuryozeiNofusho },
};

function setStatus(msg, kind) {
  const el = document.getElementById("status");
  el.innerText = msg || "";
  el.className = kind === "error" ? "status-err" : kind === "ok" ? "status-ok" : "";
}

function setRoleValue(key, field, value) {
  const el = document.getElementById("role_" + key + "_" + field);
  if (el) el.value = value;
}
function getRoleValue(key, field) {
  const el = document.getElementById("role_" + key + "_" + field);
  return el ? el.value : "";
}
function hasRole(key) {
  return !!(currentProcedure && currentProcedure.roles.some((r) => r.key === key));
}

function loadProcedures() {
  const container = document.getElementById("procedureChoice");
  container.innerHTML = "";
  Procedures.PROCEDURES.forEach((p) => {
    const active = p.status === "active";
    const label = document.createElement("label");
    if (!active) label.className = "disabled";
    label.innerHTML =
      '<input type="radio" name="procedure" value="' + p.key + '" ' + (active ? "" : "disabled") + " />" +
      "<span>" + p.label + "</span>" +
      (active ? "" : '<span class="badge-soon">準備中</span>');
    label.querySelector("input").addEventListener("change", () => selectProcedure(p.key));
    container.appendChild(label);
  });
}

function selectProcedure(key) {
  currentProcedure = Procedures.PROCEDURES.find((p) => p.key === key);
  if (!currentProcedure) return;

  document.getElementById("wizardSteps").style.display = "";
  document.getElementById("stepShakensho").style.display = currentProcedure.needs_shakensho ? "" : "none";
  document.getElementById("gyomuShubetsuBlock").style.display = key === "keizoku" ? "" : "none";

  Object.keys(activeCameraStreams).forEach((k) => closeCameraForRole(k));
  const ocrRoles = currentProcedure.roles.filter((r) => r.source === "ocr");
  const ocrContainer = document.getElementById("ocrBlocksContainer");
  ocrContainer.innerHTML = "";
  ocrRoles.forEach((r) => {
    const div = document.createElement("div");
    div.className = "role-block";
    div.innerHTML =
      "<label>" + r.label + "の本人確認書類(住民票または印鑑証明書のいずれか)</label>" +
      '<div class="camera-area" id="cameraArea_' + r.key + '">' +
      '<video id="cameraVideo_' + r.key + '" autoplay playsinline></video>' +
      '<canvas id="cameraCanvas_' + r.key + '"></canvas>' +
      "</div>" +
      '<button onclick="openCameraForRole(\'' + r.key + "')\">カメラを起動して撮影する</button>" +
      '<button class="secondary" id="ocrRunButton_' + r.key + '" style="display:none" onclick="captureFromCameraForRole(\'' + r.key + "')\">この内容で撮影してOCR実行</button>" +
      '<p id="ocrDebug_' + r.key + '" style="display:none; font-size:11px; color:#888; margin-top:6px; white-space:pre-wrap;"></p>';
    ocrContainer.appendChild(div);
  });
  document.getElementById("stepOcr").style.display = ocrRoles.length ? "" : "none";

  const roleContainer = document.getElementById("roleFieldsContainer");
  roleContainer.innerHTML = "";
  currentProcedure.roles.forEach((r) => {
    const hint =
      r.source === "shakensho_owner" || r.source === "shakensho_user"
        ? '<span style="color:#888">※車検証から自動入力</span>'
        : '<span style="color:#888">※住民票・印鑑証明書のOCRで自動入力</span>';
    const div = document.createElement("div");
    div.innerHTML =
      "<label>" + r.label + " 氏名 " + hint + "</label>" +
      '<input type="text" id="role_' + r.key + '_shimei" />' +
      "<label>" + r.label + " 住所</label>" +
      '<input type="text" id="role_' + r.key + '_jusho" />';
    roleContainer.appendChild(div);
  });

  const docContainer = document.getElementById("docChoice");
  docContainer.innerHTML = "";
  currentProcedure.documents.forEach((d) => {
    const label = document.createElement("label");
    label.innerHTML = '<input type="checkbox" id="doc_' + d.id + '" checked /> ' + d.label;
    docContainer.appendChild(label);
  });

  document.getElementById("checklistBlock").style.display = currentProcedure.show_checklist ? "" : "none";
  document.getElementById("juryozeiBlock").style.display = currentProcedure.documents.some((d) => d.id === "juryozei-nofusho") ? "" : "none";

  shakenshoLoaded = false;
  applyPendingShakenshoIfAny();
  setStatus("「" + currentProcedure.label + "」を選択しました。必要な情報を読み取ってください。", "ok");
}

// --- 車検証データ(Web Share Target経由で受信済みのものを反映) ---

function applyShakenshoData(data) {
  document.getElementById("shatai_bangou").value = data.shatai_bangou || "";
  const parts = data.touroku_bangou_parts || Shakensho.splitRegistrationNumber(data.touroku_bangou_zenbun, data.touroku_bangou_qr_fixed);
  document.getElementById("touroku_jimusho").value = parts.jimusho || "";
  document.getElementById("touroku_bunrui").value = parts.bunrui || "";
  document.getElementById("touroku_kana").value = parts.kana || "";
  document.getElementById("touroku_ichirenban").value = parts.ichirenban || "";
  currentProcedure.roles.forEach((r) => {
    if (r.source === "shakensho_owner") {
      setRoleValue(r.key, "shimei", data.shoyusha_shimei || "");
      setRoleValue(r.key, "jusho", data.shoyusha_jusho || "");
    } else if (r.source === "shakensho_user") {
      setRoleValue(r.key, "shimei", data.shiyousha_shimei || data.shoyusha_shimei || "");
      setRoleValue(r.key, "jusho", data.shiyousha_jusho || data.shoyusha_jusho || "");
    }
  });
  shakenshoLoaded = true;
  const el = document.getElementById("shakenshoStatus");
  el.className = "detected";
  el.innerText = "車検証を検出しました: " + (data.shiyousha_shimei || data.shoyusha_shimei || "(氏名未取得)") + " 様";
}

function applyPendingShakenshoIfAny() {
  if (!currentProcedure || !currentProcedure.needs_shakensho || shakenshoLoaded) return;
  if (shakenshoData) applyShakenshoData(shakenshoData);
}

async function checkForSharedShakensho() {
  const params = new URLSearchParams(location.search);
  if (params.has("share_failed")) {
    setStatus("車検証データの共有に失敗しました。もう一度お試しください。", "error");
    history.replaceState(null, "", location.pathname);
    return;
  }
  if (!params.has("shared")) return;
  history.replaceState(null, "", location.pathname);
  try {
    const cache = await caches.open("shakensho-share-v1");
    const resp = await cache.match("/__shared-shakensho__");
    if (!resp) return;
    const raw = await resp.json();
    await cache.delete("/__shared-shakensho__");
    shakenshoData = Shakensho.normalizeShakensho(raw);
    applyPendingShakenshoIfAny();
  } catch (e) {
    setStatus("車検証データの読み込みに失敗しました: " + e.message, "error");
  }
}

// --- OCR(住民票・印鑑証明書、スマホのカメラを直接起動) ---

const activeCameraStreams = {};

async function openCameraForRole(key) {
  const area = document.getElementById("cameraArea_" + key);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    activeCameraStreams[key] = stream;
    document.getElementById("cameraVideo_" + key).srcObject = stream;
    area.style.display = "block";
    document.getElementById("ocrRunButton_" + key).style.display = "";
  } catch (e) {
    setStatus("カメラを起動できませんでした: " + e.message, "error");
  }
}

function closeCameraForRole(key) {
  const stream = activeCameraStreams[key];
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    delete activeCameraStreams[key];
  }
  const area = document.getElementById("cameraArea_" + key);
  if (area) area.style.display = "none";
  const btn = document.getElementById("ocrRunButton_" + key);
  if (btn) btn.style.display = "none";
}

async function captureFromCameraForRole(key) {
  const video = document.getElementById("cameraVideo_" + key);
  const canvas = document.getElementById("cameraCanvas_" + key);
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  closeCameraForRole(key);

  setStatus("OCR実行中...(数秒〜十数秒かかります)");
  try {
    const bitmap = await createImageBitmap(canvas);
    const rawText = await Ocr.runOcr(bitmap);
    const fields = Ocr.extractPersonFields(rawText);
    if (fields.shimei) setRoleValue(key, "shimei", fields.shimei);
    if (fields.jusho) setRoleValue(key, "jusho", fields.jusho);
    const dbg = document.getElementById("ocrDebug_" + key);
    if (!fields.shimei && !fields.jusho) {
      setStatus("OCRで氏名・住所を検出できませんでした。下の読み取り結果を見て手入力してください。", "error");
      dbg.style.display = "block";
      dbg.innerText = "(OCRの生の読み取り結果)\n" + (rawText || "(空)");
    } else {
      setStatus("OCR完了。内容を必ず確認・修正してください。", "ok");
      dbg.style.display = "none";
    }
  } catch (e) {
    setStatus("OCRに失敗しました: " + e.message, "error");
  }
}

// --- 書類生成データの組み立て(app/procedures.py・static/index.htmlの元ロジックを移植) ---

function buildKeizokuPayload() {
  const name = getRoleValue("shiyousha", "shimei");
  const addr = getRoleValue("shiyousha", "jusho");
  return {
    moushiten_shimei: name,
    moushiten_jusho: addr,
    jukensha_shimei: name,
    jukensha_jusho: addr,
    shatai_bangou_7: (document.getElementById("shatai_bangou").value || "").slice(-7),
    touroku_jimusho: document.getElementById("touroku_jimusho").value,
    touroku_bunrui: document.getElementById("touroku_bunrui").value,
    touroku_kana: document.getElementById("touroku_kana").value,
    touroku_ichirenban: document.getElementById("touroku_ichirenban").value,
    gyomu_shubetsu: document.getElementById("gyomu_shubetsu").value || "1",
  };
}

function buildItenPayload() {
  const primaryKey = hasRole("shin_shoyusha") ? "shin_shoyusha" : hasRole("shoyusha") ? "shoyusha" : null;
  const primaryName = primaryKey ? getRoleValue(primaryKey, "shimei") : "";
  const primaryAddr = primaryKey ? getRoleValue(primaryKey, "jusho") : "";
  const kyuName = hasRole("kyu_shoyusha") ? getRoleValue("kyu_shoyusha", "shimei") : "";
  const kyuAddr = hasRole("kyu_shoyusha") ? getRoleValue("kyu_shoyusha", "jusho") : "";
  return {
    iten_gyomu_shubetsu: currentProcedure.gyomu_shubetsu || "",
    iten_shatai_bangou: document.getElementById("shatai_bangou").value,
    iten_touroku_jimusho: document.getElementById("touroku_jimusho").value,
    iten_touroku_bunrui: document.getElementById("touroku_bunrui").value,
    iten_touroku_kana: document.getElementById("touroku_kana").value,
    iten_touroku_ichirenban: document.getElementById("touroku_ichirenban").value,
    iten_shoyusha_shimei: primaryName,
    iten_shiyousha_douji_checkbox: "1",
    iten_shinshoyusha_shimei: primaryName,
    iten_shinshoyusha_jusho: primaryAddr,
    iten_shiyousha_shimei: primaryName,
    iten_shiyousha_jusho: primaryAddr,
    iten_kyushoyusha_shimei: kyuName,
    iten_kyushoyusha_jusho: kyuAddr,
    iten_dairinin_shimei: "",
    iten_dairinin_jusho: "",
  };
}

function buildIninjoPayload() {
  const primaryKey = hasRole("shin_shoyusha") ? "shin_shoyusha" : hasRole("shoyusha") ? "shoyusha" : null;
  const primaryName = primaryKey ? getRoleValue(primaryKey, "shimei") : "";
  const primaryAddr = primaryKey ? getRoleValue(primaryKey, "jusho") : "";
  const kyuName = hasRole("kyu_shoyusha") ? getRoleValue("kyu_shoyusha", "shimei") : "";
  const kyuAddr = hasRole("kyu_shoyusha") ? getRoleValue("kyu_shoyusha", "jusho") : "";
  const settings = loadShopSettings();
  const today = new Date();
  const payload = {
    junin_shimei: settings.agent_name || "",
    junin_jusho: settings.agent_address || "",
    shinsei_shubetsu: currentProcedure.label,
    touroku_bangou_or_shatai:
      [
        document.getElementById("touroku_jimusho").value,
        document.getElementById("touroku_bunrui").value,
        document.getElementById("touroku_kana").value,
        document.getElementById("touroku_ichirenban").value,
      ].join("") || document.getElementById("shatai_bangou").value,
    date_year: String(today.getFullYear() - 2018),
    date_month: String(today.getMonth() + 1),
    date_day: String(today.getDate()),
  };
  if (kyuName) {
    payload.ininsha1_shimei = kyuName;
    payload.ininsha1_jusho = kyuAddr;
    payload.ininsha2_shimei = primaryName;
    payload.ininsha2_jusho = primaryAddr;
  } else {
    payload.ininsha1_shimei = primaryName;
    payload.ininsha1_jusho = primaryAddr;
  }
  return payload;
}

function buildJuryozeiPayload() {
  const primaryKey = hasRole("shiyousha") ? "shiyousha" : hasRole("shin_shoyusha") ? "shin_shoyusha" : hasRole("shoyusha") ? "shoyusha" : null;
  const name = primaryKey ? getRoleValue(primaryKey, "shimei") : "";
  const addr = primaryKey ? getRoleValue(primaryKey, "jusho") : "";
  const settings = loadShopSettings();
  const today = new Date();
  const kikan = document.querySelector('input[name="juryozeiKikan"]:checked').value;
  const jika = document.querySelector('input[name="juryozeiJika"]:checked').value;
  const kubun = document.querySelector('input[name="juryozeiKubun"]:checked').value;
  const payload = {
    juryozei_date_year: String(today.getFullYear() - 2018),
    juryozei_date_month: String(today.getMonth() + 1),
    juryozei_date_day: String(today.getDate()),
    juryozei_touroku_or_shatai:
      [
        document.getElementById("touroku_jimusho").value,
        document.getElementById("touroku_bunrui").value,
        document.getElementById("touroku_kana").value,
        document.getElementById("touroku_ichirenban").value,
      ].join("") || document.getElementById("shatai_bangou").value,
    juryozei_shiyousha_shimei: name,
    juryozei_shiyousha_jusho: addr,
    juryozei_dairinin_shimei: settings.agent_name || "",
    juryozei_dairinin_jusho: settings.agent_address || "",
  };
  payload["juryozei_kikan_" + kikan] = JURYOZEI_CHECK;
  payload["juryozei_" + jika] = JURYOZEI_CHECK;
  payload["juryozei_kubun_" + kubun] = JURYOZEI_CHECK;
  return payload;
}

function loadShopSettings() {
  try {
    return JSON.parse(localStorage.getItem("shopSettings") || "{}");
  } catch (e) {
    return {};
  }
}

// --- 生成・プレビュー・印刷(すべて端末内。サーバーへの送信は無い) ---

function renderResultBlock(label, blob) {
  const container = document.getElementById("previewArea");
  const url = URL.createObjectURL(blob);
  generatedBlobUrls.push(url);
  const block = document.createElement("div");
  block.className = "doc-result";
  const frameId = "pdfFrame_" + Math.random().toString(36).slice(2);
  block.innerHTML =
    "<h4>" + label + "</h4>" +
    '<iframe id="' + frameId + '" src="' + url + '"></iframe>' +
    '<p><button onclick="printPdf(\'' + frameId + "')\">この内容で印刷する</button></p>";
  container.appendChild(block);
}

function printPdf(frameId) {
  const frame = document.getElementById(frameId);
  if (frame) frame.contentWindow.print();
}

async function generateOne(cfg, label) {
  const data = cfg.build();
  const bytes = await cfg.fill(data);
  const blob = new Blob([bytes], { type: "application/pdf" });
  renderResultBlock(label, blob);
}

async function generateSelected() {
  if (!currentProcedure) {
    setStatus("手続きの種類を選択してください。", "error");
    return;
  }
  const checked = currentProcedure.documents.filter((d) => document.getElementById("doc_" + d.id).checked);
  if (checked.length === 0) {
    setStatus("作成する書類を1つ以上選んでください。", "error");
    return;
  }
  document.getElementById("previewArea").innerHTML = "";
  generatedBlobUrls.forEach((u) => URL.revokeObjectURL(u));
  generatedBlobUrls = [];
  setStatus("PDF生成中...");
  try {
    for (const doc of checked) {
      await generateOne(DOC_CONFIG[doc.id], doc.label);
    }
    document.getElementById("previewArea").insertAdjacentHTML(
      "beforeend",
      '<p><button class="danger" onclick="finishAndCleanup()">印刷完了・次のお客様へ</button></p>' +
        '<p class="privacy-note">※このボタンを押すと画面がリセットされ、この端末に残っているデータ(車検証・撮影内容・生成PDF)がすべて破棄されます。</p>'
    );
    setStatus("生成完了。内容を確認して印刷してください。", "ok");
  } catch (e) {
    setStatus("PDF生成に失敗: " + e.message, "error");
  }
}

function finishAndCleanup() {
  Object.keys(activeCameraStreams).forEach((key) => closeCameraForRole(key));
  generatedBlobUrls.forEach((u) => URL.revokeObjectURL(u));
  generatedBlobUrls = [];
  document.getElementById("previewArea").innerHTML = "";
  document.getElementById("wizardSteps").style.display = "none";
  document.querySelectorAll('input[name="procedure"]').forEach((r) => {
    r.checked = false;
  });
  currentProcedure = null;
  shakenshoData = null;
  shakenshoLoaded = false;
  setStatus("データを削除しました。次のお客様の対応(手続きの種類選択)に進めます。", "ok");
}

// --- 初期化 ---

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch((e) => console.error("SW registration failed", e));
}

loadProcedures();
checkForSharedShakensho();
