// 長野県警で配布中の全国統一様式（普通車、2枚組）。個人情報は端末内で処理。
// https://www.pref.nagano.lg.jp/police/shinsei/koutsu/documents/2601-1shinseisho.pdf
(() => {
  const ascii = value => String(value || '').trim().replace(/[！-～]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0));
  function prepare(values) {
    const data={...values};
    for(const key of Object.keys(data)) data[key]=String(data[key] || '').trim();
    data.police=(data.police || '').replace(/警察署(?:長)?(?:殿)?$/,'').trim();
    for(const key of ['maker','model','vin','length','width','height','zip','phone','contact_phone']) data[key]=ascii(data[key]);
    const required={police:'提出先の警察署',maker:'車名',model:'型式',vin:'車台番号',length:'長さ',width:'幅',height:'高さ',
      base_address:'使用の本拠の位置',garage_address:'保管場所の位置',applicant_name:'申請者氏名',applicant_address:'申請者住所',phone:'申請者の電話番号'};
    for(const [key,label] of Object.entries(required)) if(!data[key]) throw new Error(label+'を入力してください。');
    for(const [key,max] of [['length',4],['width',3],['height',3]]) {
      if(!new RegExp('^[0-9]{1,'+max+'}$').test(data[key]) || Number(data[key])<=0) throw new Error(required[key]+'はcm単位の整数（最大'+max+'桁）で入力してください。');
    }
    if(data.zip && !/^\d{3}-?\d{4}$/.test(data.zip)) throw new Error('郵便番号は7桁で入力してください。');
    for(const key of ['phone','contact_phone']) if(data[key] && !/^\d{10,11}$/.test(data[key].replace(/[\s()（）ー−-]/g,''))) throw new Error((key==='phone'?'申請者':'連絡先')+'の電話番号を確認してください。');
    if(!['','own','other','joint'].includes(data.rights || '')) throw new Error('保管場所の使用権原を選択してください。');
    if(!['','new','replace'].includes(data.purpose || '')) throw new Error('新規・代替の区分を選択してください。');
    if(data.date) {
      const match=data.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const parts=match?match.slice(1).map(Number):[];
      const date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
      if(!match || date.getUTCFullYear()!==parts[0] || date.getUTCMonth()+1!==parts[1] || date.getUTCDate()!==parts[2] || data.date<'2019-05-01') throw new Error('申請日を確認してください（2019年5月1日以降）。');
      data.date_year='令和 '+String(parts[0]-2018);data.date_month=String(parts[1]);data.date_day=String(parts[2]);
    }
    return data;
  }

  async function fillPdf(data,{PDFDocument,rgb,fontkit,getFontBytes}) {
    data=prepare(data);
    const [response,fontBytes]=await Promise.all([fetch('./templates/shako_nagano.pdf'),getFontBytes()]);
    if(!response.ok) throw new Error('長野県の申請書ひな形を読み込めませんでした。');
    const doc=await PDFDocument.load(await response.arrayBuffer());
    doc.registerFontkit(fontkit);
    const font=await doc.embedFont(fontBytes,{subset:false});
    const asciiFont=await doc.embedFont('Helvetica');
    if(doc.getPageCount()!==2) throw new Error('申請書ひな形のページ数が想定と異なります。');
    function textBox(page,text,x,top,width,height,size=11,maxLines=1,label='入力内容',vertical='top',align='left') {
      if(!text) return;
      const textFont=/^[\x20-\x7e\r\n]*$/.test(text)?asciiFont:font;
      for(let s=size;s>=7;s-=0.5) {
        const lines=[];let line='';
        for(const ch of Array.from(text)) {
          if(ch==='\n' || textFont.widthOfTextAtSize(line+ch,s)>width) {lines.push(line);line=ch==='\n'?'':ch;}
          else line+=ch;
        }
        if(line) lines.push(line);
        if(lines.length>maxLines || lines.length*s*1.25>height) continue;
        const offset=vertical==='center'?(height-lines.length*s*1.25)/2:0;
        for(let i=0;i<lines.length;i++) page.drawText(lines[i],{x:x+(align==='right'?width-textFont.widthOfTextAtSize(lines[i],s):0),y:page.getHeight()-top-offset-s-i*s*1.25,size:s,font:textFont,color:rgb(0,0,0)});
        return;
      }
      throw new Error(label+'が長すぎて申請書の欄に収まりません。内容を確認してください。');
    }
    for(const page of doc.getPages()) {
      const h=page.getHeight();
      textBox(page,data.maker,63,113,160,32,13,2,'車名');
      textBox(page,data.model,233,113,165,32,12,2,'型式');
      textBox(page,data.vin,409,119,166,25,11,1,'車台番号');
      for(const [key,top,cells] of [['length',109,[642,663.5,685,706.5]],['width',122.2,[663.5,685,706.5]],['height',135.4,[663.5,685,706.5]]]) {
        const chars=data[key].padStart(cells.length,' ').split('');
        chars.forEach((ch,i)=>{if(ch!==' ')page.drawText(ch,{x:cells[i]-asciiFont.widthOfTextAtSize(ch,11)/2,y:h-top-11,size:11,font:asciiFont,color:rgb(0,0,0)});});
      }
      textBox(page,data.base_address,306,156,511,21,11,1,'使用の本拠の位置');
      textBox(page,data.garage_address,306,186,511,21,11,1,'保管場所の位置');
      textBox(page,data.police,66,257,114,16,12,1,'警察署名','top','right');
      textBox(page,data.date_year,517,235,48,16,10,1);
      textBox(page,data.date_month,606,235,22,16,11,1);
      textBox(page,data.date_day,666,235,20,16,11,1);
      textBox(page,data.zip,497,257,55,16,10,1);
      textBox(page,data.applicant_address,475,273,272,34,11,2,'申請者住所');
      textBox(page,data.phone,600,313,147,16,11,1,'電話番号');
      textBox(page,data.applicant_name,475,328,272,27,11,2,'申請者氏名','center');
      textBox(page,data.contact_name,456,475,132,10.8,8.5,1,'連絡先氏名');
      textBox(page,data.contact_phone,456,487,132,10.8,8.5,1,'連絡先電話番号');
      const circle=(x,y,xr,yr)=>page.drawEllipse({x,y:h-y,xScale:xr,yScale:yr,borderWidth:0.7,borderColor:rgb(0,0,0)});
      if(data.rights) circle({own:333.2,other:359.2,joint:385.1}[data.rights],486.5,12,6);
      if(data.purpose) circle(611,data.purpose==='new'?480.5:492.5,12,6);
      if(data.purpose==='replace') {
        textBox(page,data.prior_plate,676,475,143,10.8,8.5,1,'前車の登録番号');
        textBox(page,data.current_plate,676,487,143,10.8,8.5,1,'現車の登録番号');
      }
      // 下半分の証明番号・証明日・警察署長欄は記入しない。
    }
    return doc.save();
  }
  window.Shako={prepare,fillPdf};
})();
