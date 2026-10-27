// 長野県警「警察署」の管轄区域表（2026-10-27確認）。通信・位置情報APIは使わない。
// https://www.pref.nagano.lg.jp/police/keisatsusho/
// 車庫証明の提出先は「保管場所」の管轄。使用の本拠からは判定しない。
(() => {
  const groups = [
    ['長野中央','上水内郡','信濃町 小川村 飯綱町'],
    ['飯山','','飯山市'],['飯山','下水内郡','栄村'],['飯山','下高井郡','木島平村 野沢温泉村'],
    ['中野','','中野市'],['中野','下高井郡','山ノ内町'],
    ['須坂','','須坂市'],['須坂','上高井郡','小布施町 高山村'],
    ['千曲','','千曲市'],['千曲','埴科郡','坂城町'],
    ['上田','','上田市 東御市'],['上田','小県郡','青木村 長和町'],
    ['小諸','','小諸市'],['佐久','','佐久市'],['佐久','北佐久郡','御代田町 立科町'],
    ['佐久','南佐久郡','小海町 川上村 南牧村 南相木村 北相木村 佐久穂町'],
    ['軽井沢','北佐久郡','軽井沢町'],
    ['茅野','','茅野市'],['茅野','諏訪郡','富士見町 原村'],
    ['諏訪','','諏訪市'],['諏訪','諏訪郡','下諏訪町'],['岡谷','','岡谷市'],
    ['伊那','','伊那市'],['伊那','上伊那郡','辰野町 箕輪町 南箕輪村'],
    ['駒ヶ根','','駒ヶ根市'],['駒ヶ根','上伊那郡','飯島町 中川村 宮田村'],
    ['飯田','','飯田市'],['飯田','下伊那郡','松川町 高森町 阿智村 平谷村 根羽村 喬木村 豊丘村 大鹿村'],
    ['阿南','下伊那郡','阿南町 下條村 売木村 天龍村 泰阜村'],
    ['木曽','木曽郡','上松町 南木曽町 木祖村 王滝村 大桑村 木曽町'],
    ['塩尻','東筑摩郡','朝日村'],['松本','','松本市'],['松本','東筑摩郡','山形村'],
    ['安曇野','','安曇野市'],['安曇野','東筑摩郡','麻績村 生坂村 筑北村'],
    ['大町','','大町市'],['大町','北安曇郡','池田町 松川村 白馬村 小谷村'],
  ];
  const municipalities=groups.flatMap(([station,county,names])=>names.split(' ').map(name=>({station,county,name})));
  const source='https://www.pref.nagano.lg.jp/police/keisatsusho/';
  const checkedOn='2026-10-27';
  function normalize(address) {
    return String(address || '').normalize('NFKC').replace(/[\s\u200b]/g,'').replace(/^〒?\d{3}[-ー−]?\d{4}/,'').replace(/駒[ケヶ]根/g,'駒ヶ根');
  }
  function resolve(address) {
    let text=normalize(address);
    if(!text)return {status:'empty',station:'',message:'保管場所（駐車場）の住所を入力すると、管轄警察署を判定します。'};
    if(text.startsWith('長野県'))text=text.slice(3);
    // 住所の途中に現れる地名や建物名を検索しない。県名省略は先頭一致だけ受け付ける。
    const ambiguous=[['長野市','長野中央警察署・長野南警察署'],['塩尻市','塩尻警察署・松本警察署（松本空港の区域）']];
    for(const [name,candidates] of ambiguous)if(text.startsWith(name))return {status:'manual',station:'',municipality:name,message:name+'は市内で管轄が分かれます（'+candidates+'）。保管場所の管轄を確認して、警察署を手入力してください。'};
    for(const row of municipalities) {
      const full=row.county+row.name;
      if(text.startsWith(full) || text.startsWith(row.name))return {status:'matched',station:row.station,municipality:row.name,message:row.name+'の保管場所 → '+row.station+'警察署（自動入力）'};
    }
    return {status:'unknown',station:'',message:'この住所から管轄を判定できません。長野県の市町村名まで確認するか、保管場所の管轄警察署を手入力してください。'};
  }
  window.PoliceJurisdictions={resolve,normalize,source,checkedOn,municipalities};
})();
