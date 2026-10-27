// 普通車の一時抹消のみ。業務種別9、抹消2。根拠・様式はREADMEを参照。
(() => {
  const ascii=value=>String(value || '').trim().replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
  function eraDate(value,label) {
    if(!value) return null;
    const m=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m) throw new Error(label+'を確認してください。');
    const [y,month,day]=m.slice(1).map(Number),d=new Date(Date.UTC(y,month-1,day));
    if(d.getUTCFullYear()!==y || d.getUTCMonth()+1!==month || d.getUTCDate()!==day || value<'2019-05-01') throw new Error(label+'を確認してください（2019年5月1日以降）。');
    return {year:String(y-2018),month:String(month),day:String(day)};
  }
  function prepare(values) {
    if(values.is_kei) throw new Error('この機能は普通車の一時抹消登録用です。軽自動車の返納には対応していません。');
    const data={...values};
    for(const key of Object.keys(data)) if(key!=='is_kei') data[key]=String(data[key] || '').trim();
    for(const key of ['jurisdiction','classification','kana','serial','vin','amount','phone']) data[key]=ascii(data[key]);
    data.jurisdiction=data.jurisdiction.replace(/\s/g,'');
    data.classification=data.classification.toUpperCase();
    data.serial=data.serial.replace(/[・･.\s-]/g,'');
    data.vin=data.vin.replace(/\s/g,'').toUpperCase();
    data.authority=(data.authority || '').replace(/(?:運輸支局長|運輸支局|運輸監理部長)(?:殿)?$/,'').trim();
    const required={jurisdiction:'登録番号の運輸支局名',classification:'分類番号',kana:'登録番号のひらがな',serial:'一連番号',vin:'車台番号',owner_name:'所有者氏名',owner_address:'所有者住所',authority:'宛先の運輸支局名'};
    for(const [key,label] of Object.entries(required)) if(!data[key]) throw new Error(label+'を入力してください。');
    if(Array.from(data.jurisdiction).length>4) throw new Error('登録番号の運輸支局名は4文字以内で入力してください。');
    if(!/^[0-9A-Z]{1,3}$/.test(data.classification)) throw new Error('分類番号は3文字以内の数字・英字で入力してください。');
    if(Array.from(data.kana).length!==1) throw new Error('登録番号のひらがなは1文字で入力してください。');
    if(!/^\d{1,4}$/.test(data.serial)) throw new Error('一連番号は4桁以内の数字で入力してください。');
    data.vin_tail=data.vin.slice(-7);
    if(!/^[0-9A-Z-]{1,7}$/.test(data.vin_tail)) throw new Error('車台番号の末尾7文字を確認してください。');
    if(!['self','proxy'].includes(data.method)) throw new Error('申請方法を選択してください。');
    if(data.method==='proxy' && (!data.agent_name || !data.agent_address)) throw new Error('代理人の氏名と住所を入力してください。');
    if(data.amount && !/^\d{1,7}$/.test(data.amount)) throw new Error('手数料は7桁以内の整数で入力するか、空欄にしてください。');
    if(data.phone && !/^\d{10,11}$/.test(data.phone.replace(/[\s()（）ー−-]/g,''))) throw new Error('連絡先電話番号を確認してください。');
    data.submission=eraDate(data.date,'申請日');data.cause=eraDate(data.cause_date,'一時使用中止日');
    data.plate=[data.jurisdiction,data.classification,data.kana,data.serial].join(' ');
    return data;
  }

  async function fillPdf(kind,values,{PDFDocument,rgb,fontkit,getFontBytes,ininjoFields}) {
    const data=prepare(values);
    if(kind==='delegation' && data.method!=='proxy') throw new Error('委任状を作成する場合は代理申請を選択してください。');
    const template={application:'massho_3_2_normalized.pdf',fee:'touroku_tesuryo.pdf',delegation:'ininjo.pdf'}[kind];
    if(!template) throw new Error('対応していない申請書です。');
    const [response,fontBytes]=await Promise.all([fetch('./templates/'+template),getFontBytes()]);
    if(!response.ok) throw new Error('申請書のひな形を読み込めませんでした。');
    const doc=await PDFDocument.load(await response.arrayBuffer());doc.registerFontkit(fontkit);
    const jp=await doc.embedFont(fontBytes,{subset:false});
    const latin=await doc.embedFont('Helvetica'),gridFont=await doc.embedFont('Courier');
    const page=doc.getPage(0),h=page.getHeight();
    function line(text,x,top,width,size=11,label='入力内容',maxLines=1) {
      if(!text) return;
      const font=/^[\x20-\x7e\r\n]*$/.test(text)?latin:jp;
      for(let s=size;s>=7;s-=0.5) {
        let value='';const lines=[];
        for(const ch of Array.from(text)) {
          if(ch==='\n'||font.widthOfTextAtSize(value+ch,s)>width){lines.push(value);value=ch==='\n'?'':ch;}else value+=ch;
        }
        if(value)lines.push(value);
        if(lines.length>maxLines)continue;
        lines.forEach((v,i)=>page.drawText(v,{x,y:h-top-s-i*s*1.15,size:s,font,color:rgb(0,0,0)}));return;
      }
      throw new Error(label+'が欄に収まりません。内容を確認してください。');
    }
    function grid(text,starts,y0,y1,size=12,cjk=false,width=14.2,mark=false) {
      const chars=Array.from(text),font=cjk?jp:gridFont;
      if(chars.length>starts.length)throw new Error('OCR記入欄の文字数を超えています。');
      starts.forEach((x,i)=>{
        const ch=chars[i];if(!ch||ch===' ')return;
        page.drawText(ch,{x:x+width/2-font.widthOfTextAtSize(ch,size)/2,y:h-(y0+y1)/2-size*0.34,size,font,color:rgb(0,0,0)});
        if(mark&&/[A-Z]/.test(ch))page.drawRectangle({x:x+1,y:h-158.1,width:width-2,height:1.4,color:rgb(0,0,0)});
      });
    }
    function check(x,y,w=5.7,hh=5.7) {
      page.drawLine({start:{x:x+w*0.15,y:h-y-hh*0.45},end:{x:x+w*0.4,y:h-y-hh*0.8},thickness:0.9,color:rgb(0,0,0)});
      page.drawLine({start:{x:x+w*0.4,y:h-y-hh*0.8},end:{x:x+w*0.9,y:h-y-hh*0.1},thickness:0.9,color:rgb(0,0,0)});
    }
    if(kind==='application') {
      check(65.5,25.6);
      grid('9',[136.1],45.4,65.2);grid('2',[292],45.2,65.3);
      grid(data.jurisdiction,[39.7,70.9,102.1,133.3],126.2,154.5,13,true,28.3);
      grid(data.classification.padStart(3,' '),[172.9,190,206.9],130.4,150.2,12,false,14.2,true);
      grid(data.kana,[232.4],126.2,154.5,13,true,28.4);
      grid(data.serial.padStart(4,' '),[272.2,289.1,306.2,323.2],130.4,150.2);
      grid(data.vin_tail,[365.7,382.7,399.7,416.7,433.7,450.7,467.7],130.4,150.2,12,false,14.2,true);
      line(data.authority,650,201,60,12,'運輸支局名');
      if(data.submission){line(data.submission.year,735,229,14,10);line(data.submission.month,764,229,12,10);line(data.submission.day,792,229,12,10);}
      line(data.owner_name,135,306,243,11,'所有者氏名');
      line(data.owner_address,90,329,300,10,'所有者住所',2);
      if(data.method==='proxy'){
        line(data.agent_name,95,458,292,11,'代理人氏名');line(data.agent_address,90,478,300,10,'代理人住所',2);
      }
      check(450.7,452.2,8.5,8.4);
      if(data.cause){line(data.cause.year,688,458,12,10);line(data.cause.month,714,458,12,10);line(data.cause.day,742,458,12,10);}
      // 手数料・出張・処理・制限解除・登録識別情報・輸出予定日・使用者欄等は記入しない。
    } else if(kind==='fee') {
      line(data.plate,117,77,169,11,'登録番号');line(data.owner_name,389,77,159,11,'所有者氏名');
      line(data.method==='proxy'?data.agent_name:data.owner_name,645,82,187,11,'申請人氏名');
      if(data.phone){
        const digits=data.phone.replace(/\D/g,'');let parts=data.phone.split('-');
        if(parts.length!==3)parts=digits.length===11?[digits.slice(0,3),digits.slice(3,7),digits.slice(7)]:[digits.slice(0,3),digits.slice(3,6),digits.slice(6)];
        line(parts[0],673,99,22,8);line(parts[1],713,99,37,8);line(parts[2],771,99,57,8);
      }
      check(429.6,126,7,7);
      if(data.amount){line(data.amount,667,212,40,10,'手数料');line(data.amount,102,473,38,10,'手数料');}
      // 窓口での確認印、印紙・証紙欄には印字しない。
    } else {
      const payload={junin_shimei:data.agent_name,junin_jusho:data.agent_address,shinsei_shubetsu:'一時抹消登録',
        touroku_bangou_or_shatai:data.plate,ininsha1_shimei:data.owner_name,ininsha1_jusho:data.owner_address,
        date_year:data.submission?.year || '',date_month:data.submission?.month || '',date_day:data.submission?.day || ''};
      for(const [name,value] of Object.entries(payload)) {
        const cfg=ininjoFields[name];if(cfg&&value)line(value,cfg.pos[0],cfg.pos[1]-cfg.fontsize,cfg.max_width,cfg.fontsize,name);
      }
    }
    return doc.save();
  }
  window.Massho={prepare,eraDate,fillPdf};
})();
