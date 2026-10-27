// 個人情報の処理は端末内で完結する。撮影画像や抽出値をサーバーへ送信しない。

let currentProcedure = null;
let shakenshoLoaded = false;
let shakenshoData = null;
let generatedBlobUrls = [];
let shakenshoImportRun = 0;

const JURYOZEI_CHECK = "✓";

const DOC_CONFIG = {
  "keizoku-kensa": { build: buildKeizokuPayload, fill: PdfGen.fillKeizokuKensa },
  "iten-touroku": { build: buildItenPayload, fill: PdfGen.fillItenTouroku },
  "ininjo": { build: buildIninjoPayload, fill: PdfGen.fillIninjo },
  "juryozei-nofusho": { build: buildJuryozeiPayload, fill: PdfGen.fillJuryozeiNofusho },
  "shako-nagano": { build: buildShakoPayload, fill: PdfGen.fillShako },
  "massho-application": { build: buildMasshoPayload, fill: PdfGen.fillMasshoApplication },
  "massho-fee": { build: buildMasshoPayload, fill: PdfGen.fillMasshoFee },
  "massho-ininjo": { build: buildMasshoPayload, fill: PdfGen.fillMasshoIninjo },
};

// 実機での不具合調査用: DevToolsを繋がなくても画面上でエラー内容が分かるよう、
// 捕捉されなかったエラー・Promiseの拒否をすべて#statusに表示する。
window.addEventListener("error", (e) => {
  setStatus("エラー: " + e.message + " (" + (e.filename || "").split("/").pop() + ":" + e.lineno + ")", "error");
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  const msg = reason && reason.message ? reason.message : String(reason);
  setStatus("エラー(未処理): " + msg, "error");
});

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
  document.getElementById("shakoVehicleFields").style.display = key === "shako" ? "" : "none";
  document.getElementById("shakoDetails").style.display = key === "shako" ? "" : "none";
  document.getElementById("registrationFields").style.display = key === "shako" ? "none" : "";
  document.getElementById("masshoDetails").style.display = key === "massho" ? "" : "none";
  resetMasshoFields();
  resetWeightTax();
  if (key === "shako") {
    document.querySelectorAll('[data-shako]').forEach(el => {el.value="";});
    document.getElementById("shakoReplaceFields").style.display="none";
    updateShakoPolice();
  }

  Object.keys(activeCameraStreams).forEach((k) => closeCameraForRole(k));
  const roleContainer = document.getElementById("roleFieldsContainer");
  roleContainer.innerHTML = "";
  currentProcedure.roles.forEach((r) => {
    const div = document.createElement("div");
    div.className = "identity-role";
    div.innerHTML =
      '<h3>'+r.label+'</h3>'+
      (r.key.includes('shoyusha') || r.key==='massho_owner'?'<p class="privacy-note">この欄は所有者の情報です。車検証からコピーする使用者と異なる場合は、所有者の氏名・住所を入力してください。</p>':'')+
      '<div class="doc-choice" role="group" aria-label="'+r.label+'の入力方法">'+
      '<label><input type="radio" name="identityMethod_'+r.key+'" value="vehicle" onchange="setIdentityMethod(\''+r.key+'\',this.value)" /> 車検証からコピー</label>'+
      '<label><input type="radio" name="identityMethod_'+r.key+'" value="manual" checked onchange="setIdentityMethod(\''+r.key+'\',this.value)" /> 直接入力</label>'+
      '<label><input type="radio" name="identityMethod_'+r.key+'" value="ocr" onchange="setIdentityMethod(\''+r.key+'\',this.value)" /> 住民票・印鑑証明をカメラで読み取る</label></div>'+
      '<div id="vehiclePanel_'+r.key+'" style="display:none">'+
      '<p class="privacy-note" id="vehicleCopyStatus_'+r.key+'" role="status">②で読み込んだ車検証の「使用者の氏名又は名称」「使用者の住所」をコピーします。</p>'+
      '<button type="button" class="secondary" onclick="copyVehicleUserToRole(\''+r.key+'\')">車検証から再コピー</button></div>'+
      '<div id="ocrPanel_'+r.key+'" style="display:none">'+
      '<p class="privacy-note">住民票または印鑑証明書を撮影するか、保存した写真を選んでください。</p>'+
      '<div class="camera-area" id="cameraArea_' + r.key + '" style="display:none">' +
      '<video id="cameraVideo_' + r.key + '" autoplay playsinline></video>' +
      '<canvas id="cameraCanvas_' + r.key + '"></canvas>' +
      "</div>" +
      '<button onclick="openCameraForRole(\'' + r.key + "')\">カメラを起動して撮影する</button>" +
      '<button class="secondary" id="ocrRunButton_' + r.key + '" style="display:none" onclick="captureFromCameraForRole(\'' + r.key + "')\">この内容で撮影してOCR実行</button>" +
      '<label>保存した写真から読み取る<input type="file" accept="image/*" id="ocrPhoto_' + r.key +
        '" onchange="readPhotoForRole(\'' + r.key + '\',this)" /></label>' +
      '<div id="ocrResult_' + r.key + '" aria-live="polite"></div>' +
      '<p id="ocrDebug_' + r.key + '" style="display:none; font-size:11px; color:#888; margin-top:6px; white-space:pre-wrap;"></p>'+
      '<p class="privacy-note">写真は端末内で処理します。読み取った氏名・住所は、下の欄で確認・修正してください。</p></div>'+
      '<label for="role_'+r.key+'_shimei">'+r.label+' 氏名</label>'+
      '<input type="text" id="role_' + r.key + '_shimei" />' +
      '<label for="role_'+r.key+'_jusho">'+r.label+' 住所</label>'+
      '<input type="text" id="role_' + r.key + '_jusho" />';
    roleContainer.appendChild(div);
  });
  document.getElementById("stepOcr").style.display = currentProcedure.roles.length ? "" : "none";

  const docContainer = document.getElementById("docChoice");
  docContainer.innerHTML = "";
  currentProcedure.documents.forEach((d) => {
    const label = document.createElement("label");
    label.innerHTML = '<input type="checkbox" id="doc_' + d.id + '" ' + (d.defaultChecked === false ? '' : 'checked') + ' /> ' + d.label;
    docContainer.appendChild(label);
  });

  if (key === "massho") updateMasshoMethod();
  document.getElementById("checklistBlock").style.display = currentProcedure.show_checklist ? "" : "none";
  document.getElementById("juryozeiBlock").style.display = currentProcedure.documents.some((d) => d.id === "juryozei-nofusho") ? "" : "none";

  shakenshoLoaded = false;
  applyPendingShakenshoIfAny();
  updateWeightTax();
  setStatus("「" + currentProcedure.label + "」を選択しました。必要な情報を入力してください。", "ok");
}

function setIdentityMethod(key,method) {
  const panel=document.getElementById('ocrPanel_'+key);
  panel.style.display=method==='ocr'?'':'none';
  document.getElementById('vehiclePanel_'+key).style.display=method==='vehicle'?'':'none';
  document.getElementById('stepShakensho').style.display=currentProcedure.needs_shakensho || document.querySelector('input[name^="identityMethod_"][value="vehicle"]:checked')?'':'none';
  const result=document.getElementById('ocrResult_'+key);
  result.ocrRun=(result.ocrRun || 0)+1;
  if(method!=='ocr'){
    closeCameraForRole(key);
    result.replaceChildren();
    document.getElementById('ocrPhoto_'+key).value='';
    if(method==='vehicle')copyVehicleUserToRole(key);
    else setStatus('直接入力に切り替えました。氏名・住所はそのまま編集できます。','ok');
  }
}

function copyVehicleUserToRole(key) {
  const status=document.getElementById('vehicleCopyStatus_'+key);
  if(!shakenshoData){
    status.textContent='車検証情報がまだありません。②で車検証を読み込むと、使用者の氏名・住所が反映されます。';
    setStatus(status.textContent,'error');return;
  }
  const name=(shakenshoData.shiyousha_shimei || '').trim();
  const address=(shakenshoData.shiyousha_jusho || '').trim();
  if(!name || !address){
    status.textContent='車検証の使用者氏名・住所を取得できていません。車検証情報を確認するか、直接入力してください。';
    setStatus(status.textContent,'error');return;
  }
  setRoleValue(key,'shimei',name);setRoleValue(key,'jusho',address);
  status.textContent='車検証の使用者の氏名・住所をコピーしました。申請書に記入する方と一致するか確認してください。';
  setStatus(status.textContent,'ok');
}

// --- 車検証データ(Web Share Target経由で受信済みのものを反映) ---

async function importShakenshoFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  input.value = ""; // 同じファイルの再選択も受け付ける。
  const run = ++shakenshoImportRun;
  const message = document.getElementById("shakenshoFileStatus");
  message.textContent = "車検証データを読み込んでいます…";
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("ファイルが大きすぎます（上限5MB）。車検証のJSONファイルを選択してください。");
    const data = Shakensho.parseShakenshoJson(await file.text());
    if (run !== shakenshoImportRun) return;
    const hasVehicleInput = ["shatai_bangou", "touroku_jimusho", "touroku_bunrui", "touroku_kana", "touroku_ichirenban"]
      .some(id => document.getElementById(id).value.trim());
    if ((shakenshoData || hasVehicleInput) && !window.confirm("車検証データと車両情報を入れ替えます。「車検証からコピー」を選択中の氏名・住所も更新します。続けますか？")) {
      message.textContent = "取り込みを取り消しました。現在の入力は変更していません。";
      return;
    }
    shakenshoData = data;
    // 車両が変わった際、車庫証明の旧車両情報を残さない。
    if (currentProcedure?.key === "shako") {
      for (const field of ["maker", "model", "length", "width", "height", "base_address", "current_plate"])
        document.getElementById("shako_" + field).value = "";
    }
    applyPendingShakenshoIfAny();
    message.textContent = "車検証データを取り込みました。④の車両情報を確認してください。氏名・住所を反映する場合は③で「車検証からコピー」を選択してください。";
    setStatus("車検証データを取り込みました。内容を確認してください。", "ok");
  } catch (e) {
    if (run !== shakenshoImportRun) return;
    message.textContent = "取り込めませんでした。" + e.message + " 現在の入力は変更していません。";
    setStatus(message.textContent, "error");
  }
}

function applyShakenshoData(data) {
  shakenshoData=data;
  document.getElementById("shatai_bangou").value = data.shatai_bangou || "";
  const parts = data.touroku_bangou_parts || Shakensho.splitRegistrationNumber(data.touroku_bangou_zenbun, data.touroku_bangou_qr_fixed);
  document.getElementById("touroku_jimusho").value = parts.jimusho || "";
  document.getElementById("touroku_bunrui").value = parts.bunrui || "";
  document.getElementById("touroku_kana").value = parts.kana || "";
  document.getElementById("touroku_ichirenban").value = parts.ichirenban || "";
  currentProcedure.roles.forEach((r) => {
    if(document.querySelector('input[name="identityMethod_'+r.key+'"]:checked')?.value==='vehicle')copyVehicleUserToRole(r.key);
  });
  if (currentProcedure.key === "shako") {
    for (const [field,key] of Object.entries({maker:"shamei",model:"katashiki",length:"length_cm",width:"width_cm",height:"height_cm",base_address:"use_base_address"})) {
      const el=document.getElementById("shako_"+field);
      if (!el.value) el.value=data[key] || "";
    }
    const currentPlate=document.getElementById("shako_current_plate");
    if(!currentPlate.value) currentPlate.value=[parts.jimusho,parts.bunrui,parts.kana,parts.ichirenban].filter(Boolean).join(" ");
  }
  shakenshoLoaded = true;
  const el = document.getElementById("shakenshoStatus");
  el.className = "detected";
  el.innerText = "車検証を検出しました: " + (data.shiyousha_shimei || data.shoyusha_shimei || "(氏名未取得)") + " 様";
  updateWeightTax();
}

function applyPendingShakenshoIfAny() {
  if (!currentProcedure) return;
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
  // 既存のカメラを解放してから背面カメラを要求する。
  Object.keys(activeCameraStreams).forEach((roleKey) => closeCameraForRole(roleKey));
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {
      facingMode: { exact: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 },
    } });
    if(area!==document.getElementById('cameraArea_'+key) || document.querySelector('input[name="identityMethod_'+key+'"]:checked')?.value!=='ocr'){
      stream.getTracks().forEach(t=>t.stop());return;
    }
    activeCameraStreams[key] = stream;
    document.getElementById("cameraVideo_" + key).srcObject = stream;
    area.style.display = "block";
    document.getElementById("ocrRunButton_" + key).style.display = "";
  } catch (e) {
    setStatus(e.name === "OverconstrainedError" || e.name === "NotFoundError"
      ? "背面カメラを起動できませんでした。スマホの標準ブラウザで開き、背面カメラが利用できるか確認してください。"
      : "カメラを起動できませんでした: " + e.message, "error");
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
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
    setStatus("カメラの準備中です。映像が表示されてから撮影してください。", "error");
    return;
  }
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  closeCameraForRole(key);
  try {
    await recognizeSourceForRole(key, canvas);
  } finally {
    canvas.width = canvas.height = 0;
  }
}

async function readPhotoForRole(key, input) {
  const file = input.files && input.files[0];
  if (!file) return;
  closeCameraForRole(key);
  try {
    await recognizeSourceForRole(key, file);
  } finally {
    input.value = "";
  }
}

async function recognizeSourceForRole(key, source) {
  const resultArea = document.getElementById("ocrResult_" + key);
  const run=resultArea.ocrRun=(resultArea.ocrRun || 0)+1;
  const isCurrent=()=>resultArea.isConnected && document.getElementById('ocrResult_'+key)===resultArea && resultArea.ocrRun===run;
  resultArea.replaceChildren();
  setStatus("氏名・住所の欄を探して読み取っています。しばらくお待ちください。");
  let bitmap;
  try {
    bitmap = await createImageBitmap(source);
    const { fields, candidates } = await Ocr.readFields(bitmap, message => {if(isCurrent())setStatus(message);});
    if(!isCurrent())return;
    // 前の撮影結果が今回の読取値に見えないよう、未検出欄も更新する。
    setRoleValue(key, "shimei", "");
    setRoleValue(key, "jusho", "");
    if (fields.shimei) setRoleValue(key, "shimei", fields.shimei);
    if (fields.jusho) setRoleValue(key, "jusho", fields.jusho);
    const dbg = document.getElementById("ocrDebug_" + key);
    dbg.style.display = "none";
    dbg.textContent = "";
    renderOcrCandidates(resultArea, key, candidates);
    if (!candidates.length) {
      setStatus("氏名・住所の欄を特定できませんでした。書類を正面から大きく撮り直すか、手入力してください。", "error");
    } else if (candidates.filter((c) => c.key === "shimei").length > 1 ||
               candidates.filter((c) => c.key === "jusho").length > 1) {
      setStatus("複数の候補があります。切り出した画像を確認して対象を選んでください。");
    } else if (!fields.shimei || !fields.jusho) {
      setStatus("読み取れない欄があります。切り出した画像と入力内容を確認し、不足分を手入力してください。", "error");
    } else {
      setStatus("OCR完了。切り出した画像と氏名・住所を必ず確認してください。", "ok");
    }
  } catch (e) {
    if(isCurrent())setStatus("OCRに失敗しました: " + e.message, "error");
  } finally {
    if (bitmap) bitmap.close();
  }
}

function renderOcrCandidates(container, roleKey, candidates) {
  for (const key of ["jusho", "shimei"]) {
    const values = candidates.filter((candidate) => candidate.key === key);
    if (!values.length) continue;
    const label = document.createElement("label");
    label.textContent = key === "jusho" ? "住所欄の読み取り結果" : "氏名欄の読み取り結果";
    container.appendChild(label);
    if (values.some((candidate) => candidate.clippedRight)) {
      const note = document.createElement("p");
      note.textContent = "欄の右端が写っていないため、画像の端まで読み取りました。文字の末尾が欠けていないか確認してください。";
      note.style.cssText = "font-size:13px;color:#805000";
      container.appendChild(note);
    }
    const image = document.createElement("img");
    image.alt = key === "jusho" ? "切り出した住所欄" : "切り出した氏名欄";
    image.style.cssText = "display:block;max-width:100%;max-height:180px;margin:8px 0;border:1px solid #ccc";
    if (values.length > 1) {
      const select = document.createElement("select");
      select.style.cssText = "display:block;width:100%;margin-top:6px;padding:10px;font-size:16px";
      select.setAttribute("aria-label", key === "jusho" ? "使用する住所を選択" : "対象者の氏名を選択");
      select.appendChild(new Option("対象を選んでください", ""));
      values.forEach((candidate, index) => {
        const option = new Option((index + 1) + ": " + (candidate.text || "読取不可・画像を確認してください"), String(index));
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        const candidate = select.value === "" ? null : values[Number(select.value)];
        setRoleValue(roleKey, key, candidate ? candidate.text : "");
        image.style.display = candidate ? "block" : "none";
        if (candidate) image.src = candidate.preview;
      });
      label.appendChild(select);
      image.style.display = "none";
    } else {
      image.src = values[0].preview;
    }
    container.appendChild(image);
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
  const tax=updateWeightTax();
  payload.juryozei_amount=tax.amount;
  payload.juryozei_weight_kg=tax.weightKg;
  payload.juryozei_exempt=tax.status==='confirmed' && tax.category==='exempt';
  return payload;
}

function resetWeightTax() {
  const today=new Date();
  document.getElementById('juryozei_inspection_date').value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
  for(const [name,value] of Object.entries({juryozeiKikan:'2nen',juryozeiJika:'jika',juryozeiKubun:'you'}))document.querySelector('input[name="'+name+'"][value="'+value+'"]').checked=true;
  document.getElementById('weightTaxStatus').textContent='';
}
function updateWeightTax() {
  const tax=WeightTax.assess(shakenshoData,{procedure:currentProcedure?.key,
    date:document.getElementById('juryozei_inspection_date').value,
    period:document.querySelector('input[name="juryozeiKikan"]:checked').value,
    jika:document.querySelector('input[name="juryozeiJika"]:checked').value,
    kubun:document.querySelector('input[name="juryozeiKubun"]:checked').value,
    vin:document.getElementById('shatai_bangou').value});
  const text=tax.status==='confirmed'
    ? '自動判定：'+(tax.category==='exempt'?'免税（0円）':tax.amount.toLocaleString('ja-JP')+'円')+'。'+tax.reason+'。'
    : '税額要確認：'+tax.reason+' 納付税額欄は空欄で印刷します。';
  document.getElementById('weightTaxStatus').textContent=text+(tax.weightKg?' 車両重量：'+tax.weightKg+'kg。':'');
  return tax;
}

function loadShopSettings() {
  try {
    return JSON.parse(localStorage.getItem("shopSettings") || "{}");
  } catch (e) {
    return {};
  }
}

function buildShakoPayload() {
  if(shakenshoData && shakenshoData.is_kei_jidosha) throw new Error("この申請書は普通車用です。軽自動車の届出書には対応していません。");
  const data={vin:document.getElementById("shatai_bangou").value,
    applicant_name:getRoleValue("shako_applicant","shimei"),applicant_address:getRoleValue("shako_applicant","jusho")};
  document.querySelectorAll('[data-shako]').forEach(el=>{data[el.id.replace(/^shako_/,"")]=el.value;});
  return Shako.prepare(data);
}

function copyApplicantAddressToGarage() {
  const address=getRoleValue('shako_applicant','jusho').trim();
  if(!address){
    setStatus('先に③の申請者住所を入力してください。','error');
    document.getElementById('role_shako_applicant_jusho').focus();
    return;
  }
  const garage=document.getElementById('shako_garage_address');
  if(garage.value.trim() && garage.value.trim()!==address && !window.confirm('入力済みの保管場所を申請者住所で上書きしますか？\n駐車場名・区画番号も置き換わります。'))return;
  garage.value=address;
  updateShakoPolice();
  setStatus('申請者住所を保管場所にコピーしました。実際の駐車場の住所を確認し、必要なら駐車場名・区画番号を追記してください。','ok');
}

function updateShakoPolice() {
  const field=document.getElementById('shako_police');
  const result=PoliceJurisdictions.resolve(document.getElementById('shako_garage_address').value);
  // 住所が変わったら手入力値も含めて再判定し、前の住所の宛先を残さない。
  field.value=result.station;
  field.dataset.jurisdictionStatus=result.status;
  document.getElementById('shakoPoliceStatus').textContent=result.message;
}
function markPoliceManual() {
  const field=document.getElementById('shako_police');
  const result=PoliceJurisdictions.resolve(document.getElementById('shako_garage_address').value);
  field.dataset.jurisdictionStatus='manual';
  document.getElementById('shakoPoliceStatus').textContent=field.value.trim()
    ? '警察署を手入力しています。保管場所の管轄と一致しているか確認してください。'+(result.status==='matched'?' この住所の自動判定は'+result.station+'警察署です。':'')
    : result.message;
}

function resetMasshoFields() {
  document.querySelectorAll('[data-massho]').forEach(el=>{el.value=el.dataset.default || '';});
  document.getElementById('masshoAgentFields').style.display='none';
}
function updateMasshoMethod() {
  const proxy=document.getElementById('massho_method').value==='proxy';
  document.getElementById('masshoAgentFields').style.display=proxy?'':'none';
  const checkbox=document.getElementById('doc_massho-ininjo');
  if(checkbox){checkbox.checked=proxy;checkbox.disabled=!proxy;}
  if(proxy){
    const settings=loadShopSettings();
    for(const field of ['name','address']){
      const el=document.getElementById('massho_agent_'+field);
      if(!el.value)el.value=settings['agent_'+field] || '';
    }
  }
}
function buildMasshoPayload() {
  const data={is_kei:!!(shakenshoData && shakenshoData.is_kei_jidosha),
    vin:document.getElementById('shatai_bangou').value,
    owner_name:getRoleValue('massho_owner','shimei'),owner_address:getRoleValue('massho_owner','jusho')};
  for(const [key,id] of Object.entries({jurisdiction:'jimusho',classification:'bunrui',kana:'kana',serial:'ichirenban'}))data[key]=document.getElementById('touroku_'+id).value;
  document.querySelectorAll('[data-massho]').forEach(el=>{data[el.id.replace(/^massho_/,'')]=el.value;});
  return Massho.prepare(data);
}

// --- 生成・プレビュー・印刷(すべて端末内。サーバーへの送信は無い) ---

function renderResultBlock(label, blob, note='') {
  const container = document.getElementById("previewArea");
  const url = URL.createObjectURL(blob);
  generatedBlobUrls.push(url);
  const block = document.createElement("div");
  block.className = "doc-result";
  const frameId = "pdfFrame_" + Math.random().toString(36).slice(2);
  block.innerHTML =
    "<h4>" + label + "</h4>" +
    '<iframe id="' + frameId + '" src="' + url + '"></iframe>' +
    '<p><button onclick="openPdfForPrint(\'' + url + "')\">この書類を開いて印刷する</button></p>" +
    '<p class="privacy-note">開いた画面右上のアイコン(印刷または共有)から印刷してください。</p>';
  container.appendChild(block);
  if(note){const p=document.createElement('p');p.className='privacy-note';p.textContent=note;block.insertBefore(p,block.querySelector('iframe'));}
}

function openPdfForPrint(url) {
  // ページに埋め込んだiframeからの印刷(iframe.contentWindow.print())は、
  // スマホのChromeでは正しく動作しないことがある(既知の制約)。そのため、
  // PDFをブラウザの新しいタブで開き、Chrome純正のPDFビューアの印刷ボタンを
  // 使ってもらう方式にしている。ユーザー操作(クリック)から直接呼ぶことで
  // ポップアップブロックを回避している。
  const win = window.open(url, "_blank");
  if (!win) {
    setStatus("新しいタブを開けませんでした。ポップアップブロックの設定をご確認ください。", "error");
  }
}

async function generateOne(cfg, label) {
  const data = cfg.build();
  const bytes = await cfg.fill(data);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const note=cfg===DOC_CONFIG['juryozei-nofusho']
    ? data.juryozei_amount===null?'税額要確認：納付税額欄は空欄です。税額を確認して、印刷物に手書きしてください。'
      :data.juryozei_exempt?'免税と判定しました。納付税額欄に0、備考欄に免税を印字しています。':'納付税額欄に自動判定した金額を印字しています。'
    :'';
  renderResultBlock(label, blob,note);
}

async function generateSelected() {
  try {
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
    setStatus("PDF生成中...(" + checked.length + "件)");
    for (const doc of checked) {
      setStatus("PDF生成中...(" + doc.label + ")");
      await generateOne(DOC_CONFIG[doc.id], doc.label);
    }
    document.getElementById("previewArea").insertAdjacentHTML(
      "beforeend",
      '<p><button class="danger" onclick="finishAndCleanup()">印刷完了・次のお客様へ</button></p>' +
        '<p class="privacy-note">※このボタンを押すと画面がリセットされ、この端末に残っているデータ(車検証・撮影内容・生成PDF)がすべて破棄されます。</p>'
    );
    setStatus("生成完了。内容を確認して印刷してください。", "ok");
  } catch (e) {
    setStatus("PDF生成に失敗: " + e.message + (e.stack ? " [" + e.stack.split("\n")[1] + "]" : ""), "error");
  }
}

function finishAndCleanup() {
  shakenshoImportRun++;
  document.getElementById("shakenshoFile").value = "";
  document.getElementById("shakenshoFileStatus").textContent = "";
  document.getElementById("shakenshoStatus").textContent = "車検証データをファイルまたはAndroidの共有から取り込んでください。";
  document.getElementById("shakenshoStatus").className = "waiting";
  Object.keys(activeCameraStreams).forEach((key) => closeCameraForRole(key));
  document.querySelectorAll('[id^="ocrResult_"]').forEach((area) => area.replaceChildren());
  document.querySelectorAll('[data-shako]').forEach(el=>{el.value="";});
  document.getElementById('shakoPoliceStatus').textContent='';
  document.getElementById('shako_police').removeAttribute('data-jurisdiction-status');
  resetMasshoFields();
  resetWeightTax();
  document.getElementById("roleFieldsContainer").replaceChildren();
  for(const id of ["shatai_bangou","touroku_jimusho","touroku_bunrui","touroku_kana","touroku_ichirenban"]) document.getElementById(id).value="";
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
