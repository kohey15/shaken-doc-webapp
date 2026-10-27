// PP-OCRv5 runs in a local Web Worker. Neither photos nor extracted personal data are uploaded.
// Model assets are downloaded from this app's own origin and cached by the service worker.

function normalizeFieldValue(text) {
  return (text || '').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '');
}

function nodeFromItem(item) {
  if (!item || !Array.isArray(item.poly) || item.poly.length !== 4 || typeof item.text !== 'string') return null;
  if (!item.poly.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return null;
  const xs = item.poly.map(p => p[0]), ys = item.poly.map(p => p[1]);
  const bbox = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  return { ...item, text: normalizeFieldValue(item.text), bbox,
    cx: xs.reduce((a,b) => a+b, 0) / 4, cy: ys.reduce((a,b) => a+b, 0) / 4,
    h: Math.max(1, (Math.hypot(xs[0]-xs[3],ys[0]-ys[3]) + Math.hypot(xs[1]-xs[2],ys[1]-ys[2])) / 2) };
}

const FIELD_LABEL_RE = /^(?:氏名(?:の振[り]?仮名)?|住所|現住所|転入前住所|従前の住所|旧住所|前住所|本籍|筆頭者|世帯主|世带主|生年月日|性別|性别|続柄|旧氏(?:の振[り]?仮名)?|個人番号|住民票コード|登録番号|交付年月日|発行年月日)(?:$|[：:])/;
const PLACEHOLDER_RE = /^(?:[【】\[\]＊*]+|[【\[]?(?:以下余白|空欄|余白)[】\]]?)$/;

function isOtherField(node) {
  return FIELD_LABEL_RE.test(node.text) || /^(?:性別|性别|続柄|個人番号|住民票コード)/.test(node.text);
}

function splitInlineLabel(node) {
  // Some layouts produce a single recognized line for both the label and its value.
  const match = node.text.match(/^(氏名|住所|現住所)[：:]?(.+)$/);
  if (!match || /^(?:の|を|コード|番号|変更|異動)/.test(match[2])) return [node];
  const index = match[1].length + (/^[：:]/.test(node.text.slice(match[1].length)) ? 1 : 0);
  const ratio = index / node.text.length;
  const [a,b,c,d] = node.poly;
  const upper = [a[0]+(b[0]-a[0])*ratio, a[1]+(b[1]-a[1])*ratio];
  const lower = [d[0]+(c[0]-d[0])*ratio, d[1]+(c[1]-d[1])*ratio];
  return [nodeFromItem({...node,text:match[1],poly:[a,upper,lower,d]}),
    nodeFromItem({...node,text:match[2],poly:[upper,b,c,lower]})];
}

function labelAxis(label) {
  const [a,b] = label.poly;
  const dx = b[0]-a[0], dy = b[1]-a[1], length = Math.hypot(dx,dy);
  // A vertically printed label still points to a value to its right.
  if (!length || Math.abs(dy) > Math.abs(dx)) return {x:1,y:0};
  const sign = dx < 0 ? -1 : 1;
  return {x:dx/length*sign,y:dy/length*sign};
}

function positionFrom(label, node, axis) {
  const dx=node.cx-label.cx, dy=node.cy-label.cy;
  return { along:dx*axis.x+dy*axis.y, cross:-dx*axis.y+dy*axis.x };
}

function geometryFields(items) {
  const nodes = (items || []).map(nodeFromItem).filter(Boolean).flatMap(splitInlineLabel)
    .filter(n => !/^(?:住民票(?:の写し)?|印鑑登録証明書|印鑑証明書)$/.test(n.text));
  const labels = nodes.filter(n => ['氏名','住所','現住所'].includes(n.text));
  const result = [];
  for (const label of labels) {
    const key = label.text === '氏名' ? 'shimei' : 'jusho';
    const axis = labelAxis(label);
    const labelHalf = Math.max(1,(label.bbox.x1-label.bbox.x0)/2);
    const row = nodes.filter(n => n !== label).map(node => ({node,...positionFrom(label,node,axis)}))
      .filter(p => p.along > labelHalf && p.node.bbox.x1 > label.bbox.x1 &&
        Math.abs(p.cross) < Math.max(label.h,p.node.h)*0.75)
      .sort((a,b) => a.along-b.along);
    const selected = [];
    for (const item of row) {
      if (isOtherField(item.node)) break;
      const previous = selected[selected.length-1];
      if (previous && item.node.bbox.x0 < previous.bbox.x1-Math.max(previous.h,item.node.h)*0.25) continue;
      const gap = previous ? item.node.bbox.x0-previous.bbox.x1 : item.node.bbox.x0-label.bbox.x1;
      if (gap > Math.max(label.h,item.node.h)* (previous ? 3 : 6)) break;
      selected.push(item.node);
    }
    if (!selected.length || selected.every(n => PLACEHOLDER_RE.test(n.text))) continue;

    // Join aligned address continuation lines, stopping before any following field's label.
    if (key === 'jusho') {
      const startX = selected[0].bbox.x0;
      // 長い住所行の傾きの方が、短いラベルの傾きより安定する。
      const continuationAxis = labelAxis(selected.reduce((a,b) =>
        a.bbox.x1-a.bbox.x0 > b.bbox.x1-b.bbox.x0 ? a : b));
      for (let count=0; count<5; count++) {
        const last=selected[selected.length-1];
        const lastPos=positionFrom(label,last,continuationAxis);
        const next=nodes.filter(n => !selected.includes(n) && !isOtherField(n) && !PLACEHOLDER_RE.test(n.text))
          .map(node => ({node,...positionFrom(label,node,continuationAxis)}))
          .filter(p => p.cross > lastPos.cross + Math.max(last.h,p.node.h)*0.65 &&
            p.cross < lastPos.cross + Math.max(last.h,p.node.h)*2.3 &&
            Math.abs(p.node.bbox.x0-startX) < Math.max(last.h,p.node.h)*1.5)
          .sort((a,b) => a.cross-b.cross)[0];
        if (!next) break;
        const separator=nodes.some(n => n !== label &&
          (isOtherField(n) || n.bbox.x1 < startX-Math.max(last.h,n.h)*0.25) &&
          n.bbox.x0 < next.node.bbox.x1 &&
          positionFrom(label,n,continuationAxis).cross > lastPos.cross + last.h*0.4 &&
          positionFrom(label,n,continuationAxis).cross < next.cross + next.node.h*0.5);
        if (separator) break;
        selected.push(next.node);
      }
    }
    const text=selected.filter(n => !PLACEHOLDER_RE.test(n.text)).map(n => n.text).join('');
    if (!text || PLACEHOLDER_RE.test(text)) continue;
    result.push({key,text,score:Math.min(label.score ?? 0,...selected.map(n=>n.score ?? 0)),
      poly:selected.length===1?selected[0].poly:null,
      bbox:{x0:Math.min(...selected.map(n=>n.bbox.x0)),y0:Math.min(...selected.map(n=>n.bbox.y0)),
        x1:Math.max(...selected.map(n=>n.bbox.x1)),y1:Math.max(...selected.map(n=>n.bbox.y1))}});
  }
  return result;
}

function chooseFields(candidates) {
  const fields={shimei:'',jusho:''};
  for (const key of ['shimei','jusho']) {
    const matches=candidates.filter(c=>c.key===key);
    if (matches.length===1) fields[key]=matches[0].text;
  }
  return fields;
}

function extractPersonFields(rawText) {
  const candidates=[];
  for (const line of rawText.split(/\r?\n/)) {
    const match=normalizeFieldValue(line).match(/^(氏名|住所|現住所)[：:]?(.+)$/);
    if (!match) continue;
    const text=match[2].split(/生年月日|世帯主|本籍|旧氏|続柄|個人番号/)[0];
    if (text && !/^(?:の|を)/.test(text)) candidates.push({key:match[1]==='氏名'?'shimei':'jusho',text});
  }
  return chooseFields(candidates);
}

const OCR_ASSET_CACHE='ocr-assets-v5';
const OCR_WORKER_VERSION='20261026.1';
let worker=null, workerStartup=null, workerScriptUrl=null, nextId=0;
async function cachedAssetResponse(url) {
  const cache=typeof caches!=='undefined'?await caches.open(OCR_ASSET_CACHE):null;
  const cached=cache?await cache.match(url):null;
  if(cached) return cached;
  const response=await fetch(url);
  if(cache&&response.ok) {try {await cache.put(url,response.clone());}catch { /* Online recognition still works when storage is full. */ }}
  return response;
}
const pending=new Map();
function failWorker(message) {
  if (worker) worker.terminate();
  worker=null;
  workerStartup=null;
  if (workerScriptUrl) URL.revokeObjectURL(workerScriptUrl);
  workerScriptUrl=null;
  for (const task of pending.values()) {clearTimeout(task.timer);task.reject(new Error(message));}
  pending.clear();
}
async function getWorker() {
  if (worker) return worker;
  if (!workerStartup) workerStartup=(async()=>{
    const url=new URL('./assets/ocr/v5/worker.js?v='+OCR_WORKER_VERSION,document.baseURI).href;
    const response=await cachedAssetResponse(url);
    if (!response.ok) throw new Error('認識プログラムを読み込めませんでした。通信を確認してください。');
    // A self-contained bundle can boot from its local cache even while offline.
    const code=(await response.text()).replaceAll('import.meta.url',JSON.stringify(url));
    workerScriptUrl=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    worker=new Worker(workerScriptUrl,{type:'module'});
    worker.onmessage=({data})=>{
      const task=pending.get(data.id);
      if (!task) return;
      if (data.type==='progress') {if(task.onProgress) task.onProgress(data.message);return;}
      clearTimeout(task.timer);pending.delete(data.id);
      if(data.type==='error') task.reject(new Error('認識データの読み込み、または文字認識に失敗しました。通信を確認して再度お試しください。 ('+data.message+')'));
      else task.resolve(data.result);
    };
    worker.onerror=()=>failWorker('文字認識を起動できませんでした。ブラウザを開き直し、再度お試しください。');
    return worker;
  })().catch(error=>{failWorker(error.message);throw error;});
  return workerStartup;
}

async function recognize(canvas,onProgress) {
  if(onProgress) onProgress('認識データを準備しています。初回は通信に時間がかかることがあります。');
  const target=await getWorker();
  return new Promise((resolve,reject)=>{
    const id=++nextId;
    const timer=setTimeout(()=>failWorker('文字認識に時間がかかりすぎたため停止しました。通信を確認して再度お試しください。'),240000);
    pending.set(id,{resolve,reject,timer,onProgress});
    try {
      const image=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
      target.postMessage({id,width:image.width,height:image.height,buffer:image.data.buffer},[image.data.buffer]);
    }
    catch(error) {clearTimeout(timer);pending.delete(id);reject(error);}
  });
}

async function recognizeFields(bitmap,onProgress) {
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,3200/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
  try {
    const result=await recognize(canvas,onProgress);
    const candidates=geometryFields(result.items).map(candidate=>{
      const r=candidate.bbox, margin=8;
      const x=Math.max(0,Math.floor(r.x0)-margin),y=Math.max(0,Math.floor(r.y0)-margin);
      const w=Math.min(canvas.width-x,Math.ceil(r.x1)-x+margin),h=Math.min(canvas.height-y,Math.ceil(r.y1)-y+margin);
      const crop=document.createElement('canvas');crop.width=w;crop.height=h;
      const ctx=crop.getContext('2d');
      if (candidate.poly) {
        const [a,b,,d]=candidate.poly;
        const bx=b[0]-a[0],by=b[1]-a[1],dx=d[0]-a[0],dy=d[1]-a[1];
        const det=bx*dy-by*dx;
        if (Math.abs(det)>1) {
          const pw=Math.hypot(bx,by),ph=Math.hypot(dx,dy);
          crop.width=Math.ceil(pw)+margin*2;crop.height=Math.ceil(ph)+margin*2;
          const ta=pw*dy/det,tb=-ph*by/det,tc=-pw*dx/det,td=ph*bx/det;
          ctx.fillStyle='white';ctx.fillRect(0,0,crop.width,crop.height);
          ctx.setTransform(ta,tb,tc,td,margin-ta*a[0]-tc*a[1],margin-tb*a[0]-td*a[1]);
          ctx.drawImage(canvas,0,0);
        } else ctx.drawImage(canvas,x,y,w,h,0,0,w,h);
      } else ctx.drawImage(canvas,x,y,w,h,0,0,w,h);
      return {...candidate,preview:crop.toDataURL('image/png'),clippedRight:r.x1>=canvas.width-4};
    });
    return {fields:chooseFields(candidates),candidates};
  } finally {canvas.width=canvas.height=0;}
}

let ocrQueue=Promise.resolve();
function readFields(bitmap,onProgress) {
  const task=ocrQueue.then(()=>recognizeFields(bitmap,onProgress));
  ocrQueue=task.catch(()=>{});
  return task;
}
function runOcr(bitmap) {
  return readFields(bitmap).then(({fields})=>'氏名 '+fields.shimei+'\n住所 '+fields.jusho);
}
window.Ocr={readFields,runOcr,extractPersonFields};
