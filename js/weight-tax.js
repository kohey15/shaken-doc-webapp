// 継続検査・登録車・自家用乗用車（1/2年、車両重量3t以下）の確定可能な条件のみ。
// 2026-05-01～2028-04-30の税額表と判定フロー。根拠と対応範囲はREADMEを参照。
(() => {
  const clean=v=>String(v ?? '').normalize('NFKC').replace(/\s/g,'').toUpperCase();
  const monthIndex=d=>d.getUTCFullYear()*12+d.getUTCMonth();
  function isoDate(value) {
    const m=String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;
    const [y,mo,day]=m.slice(1).map(Number),d=new Date(Date.UTC(y,mo-1,day));
    return d.getUTCFullYear()===y && d.getUTCMonth()===mo-1 && d.getUTCDate()===day?d:null;
  }
  function eraDate(era,year,month,day='1') {
    const eras={令和:[2018,2019,2026+100],平成:[1988,1989,2019],昭和:[1925,1926,1989]};
    const e=eras[clean(era)];
    if(!e || !/^\d+$/.test(clean(year)) || Number(clean(year))<1)return null;
    const y=e[0]+Number(clean(year)),mo=Number(clean(month)),dd=Number(clean(day));
    const d=isoDate(`${y}-${String(mo).padStart(2,'0')}-${String(dd).padStart(2,'0')}`);
    if(!d || y<e[1] || y>e[2])return null;
    if(clean(era)==='令和' && y===2019 && mo<5)return null;
    if(clean(era)==='平成' && y===2019 && mo>4)return null;
    if(clean(era)==='昭和' && y===1989 && mo>1)return null;
    return d;
  }
  function validWeight(data) {
    const raw=clean(data?.weight_kg);
    // 二段記載・括弧付き重量は課税重量を一意に決めない。
    if(clean(data?.weight_note) || !/^\d{1,5}$/.test(raw))return null;
    const n=Number(raw);return n>0 && n<=3000?n:null;
  }
  function ageBand(first,inspection) {
    const months=monthIndex(inspection)-monthIndex(first);
    // 国交省の交付年月基準：12年10か月／17年10か月から適用。
    return months>=214?'over18':months>=154?'over13':'under13';
  }
  function fuelRatios(notes,era,year) {
    const re=new RegExp('(?:'+era+'|'+(era==='令和'?'R':'H')+')'+year+'年度燃費基準(?:(\\d+(?:\\.\\d+)?)%(超過)?達成|達成率(\\d+(?:\\.\\d+)?)%)','g');
    return [...notes.matchAll(re)].map(m=>Number(m[1] || m[3])+(m[2]?100:0));
  }
  function initialCertificate(data,first,inspection) {
    const grant=eraDate(data.grant_era,data.grant_year,data.grant_month,data.grant_day);
    const expiry=eraDate(data.expiry_era,data.expiry_year,data.expiry_month,data.expiry_day);
    // 初度登録月に交付された、3年有効の証明書だけを初回継続の根拠にする。
    if(!grant || !expiry || monthIndex(grant)!==monthIndex(first))return false;
    const end=new Date(Date.UTC(grant.getUTCFullYear()+3,grant.getUTCMonth(),grant.getUTCDate()-1));
    if(Math.abs(expiry-end)>86400000)return false;
    return inspection>=grant && inspection<=new Date(expiry.getTime()+15*86400000);
  }
  function assess(data,options={}) {
    let weightKg=null;
    const unknown=reason=>({status:'review',amount:null,category:null,reason,weightKg});
    if(options.procedure!=='keizoku')return unknown('継続車検以外の税額は自動判定しません。');
    if(!data)return unknown('車検証情報を読み込んでください。');
    if(clean(data.registration_type)!=='01' || data.is_kei_jidosha || clean(data.vehicle_use)!=='乗用' || clean(data.private_business)!=='自家用')return unknown('自動判定の対象は登録車の自家用乗用車です。');
    if(options.jika!=='jika' || options.kubun!=='you' || !['1nen','2nen'].includes(options.period))return unknown('選択した車両区分・有効期間は自動判定の対象外です。');
    if(!clean(data.shatai_bangou) || clean(data.shatai_bangou)!==clean(options.vin))return unknown('車台番号が読み込んだ車検証と一致しません。');
    weightKg=validWeight(data);
    const date=String(options.date || ''),inspection=isoDate(date);
    if(!inspection)return unknown('検査予定日を入力してください。');
    if(date<'2026-05-01' || date>'2028-04-30')return unknown('検査予定日が収録した税制の期間外です。');
    const weight=weightKg;if(!weight)return unknown('車両重量が未取得・二段記載、または3tを超えています。');
    const first=eraDate(data.first_era,data.first_year,data.first_month);
    if(!first || first>inspection)return unknown('初度登録年月が未取得、または検査予定日と整合しません。');
    const notes=clean(data.tax_notes),model=clean(data.katashiki);
    if(!data.tax_notes_present)return unknown('車検証の備考情報を取得できていません。');
    if(!model || /改|免除|非課税|減免|特例|特別|障害|外交|並行|試作|職権|不明|基準緩和|バリアフリー|他あり|未記録|省略/.test(notes+model))return unknown('改造・特例・省略された備考等の確認が必要です。');
    const fuel=clean(data.fuel),prefix=model.split('-')[0];
    if(/^[3-6]/.test(prefix) && first.getUTCFullYear()<2018)return unknown('型式と初度登録年月の整合を確認してください。');
    const result=(category,reason)=>{
      const units=Math.ceil(weight/500),years=options.period==='2nen'?2:1;
      const rates={exempt:0,eco:2500,under13:4100,over13:5700,over18:6300};
      return {status:'confirmed',amount:units*years*rates[category],category,weightKg:weight,reason};
    };
    if(fuel==='電気' && prefix==='ZAA') {
      if(first>=new Date(Date.UTC(2023,4,1)) && initialCertificate(data,first,inspection))return result('exempt','電気自動車・新車の3年有効車検証による初回継続検査（免税）');
      return unknown('電気自動車の初回継続検査・免税条件を確認してください。');
    }
    if(!['ガソリン','LPG','ガソリン・電気','LPG・電気'].includes(fuel))return unknown('この燃料の税区分は公式照会等で確認してください。');
    // これらはH17・75%低減/H21適合/H30・50%低減のいずれにも該当しない。
    if(/^(?:ABA|CBA|AAA|CAA|3BA|4BA|3AA|4AA)$/.test(prefix)){
      if(/燃費基準|排出ガス.*(?:75%低減|50%低減)|免税|本則税率/.test(notes))return unknown('型式と備考の適用条件を照合する必要があります。');
      const band=ageBand(first,inspection);
      return result(band,'型式の排出ガス識別記号と初度登録年月によるエコカー外の判定');
    }
    if(!/^[56][AB]A$/.test(prefix))return unknown('燃費・排出ガス基準から税区分を確定できません。');
    // H30・50/75%低減のガソリン/LPG。二つの燃費基準の根拠がある場合のみ。
    const ratios=fuelRatios(notes,'令和',12),unique=[...new Set(ratios)];
    const r20=[...fuelRatios(notes,'令和',2),...fuelRatios(notes,'平成',32)];
    const achieved20=/(?:令和2|平成32|R2|H32)年度燃費基準達成(?:車|$|[、,。])/.test(notes) || r20.some(n=>n>=100 && n<=300);
    if(unique.length!==1 || !achieved20 || /未達成|非該当|対象外|免税|本則税率/.test(notes))return unknown('燃費基準の記載不足・不一致があるため税区分を確認してください。');
    const ratio=unique[0];
    if(ratio<0 || ratio>300)return unknown('燃費基準達成率の値を確認してください。');
    if(first<new Date(Date.UTC(2026,4,1)) && ratio>=120)return unknown('新車登録当時の初回継続検査の免税・経過措置を確認してください。');
    if(first>=new Date(Date.UTC(2026,4,1)) && ratio>=125){
      if(initialCertificate(data,first,inspection))return result('exempt','燃費基準・初度登録年月・新車の3年有効車検証による初回継続検査（免税）');
      return unknown('初回継続検査と免税条件を確認してください。');
    }
    if(ratio>=80)return result('eco','平成30年排出ガス50%以上低減・令和2年度燃費基準達成・令和12年度燃費基準80%以上（本則税率）');
    // フローの「令和2年度達成」側の80%未満は、経年重課ではなく13年未満の税率。
    return result('under13','平成30年排出ガス50%以上低減・令和2年度燃費基準達成・令和12年度燃費基準80%未満');
  }
  window.WeightTax={assess,eraDate,ageBand,validWeight,source:'https://www.mlit.go.jp/jidosha/content/001884517.pdf'};
})();
