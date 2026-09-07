// 申請書PDFのフィールド座標定義。app/config.py からそのまま移植(数値は一切変更していない)。
//
// 座標系の注意: ここに書かれている座標は元のPython版(PyMuPDF)の座標系
// (左上原点、x=右方向、y=下方向、pt単位)のまま。pdf-lib は左下原点・y=上方向のため、
// 実際に描画する際は js/pdfgen.js 側で `pdfLibY = pageHeight - pymupdfY` の変換を行う。
// ここの数値自体を書き換えてはならない(座標較正のやり直しになってしまうため)。

const KEIZOKU_GRID_FIELDS = {
  gyomu_shubetsu: { boxes: [[133.3, 45.4, 147.4, 65.2]], fontsize: 12 },
  shatai_bangou_7: {
    boxes: [
      [362.8, 120.5, 377.0, 140.3], [379.9, 120.5, 394.0, 140.3], [396.8, 120.5, 411.1, 140.3],
      [413.9, 120.5, 428.0, 140.3], [430.9, 120.5, 445.1, 140.3], [447.9, 120.5, 462.1, 140.3],
      [464.9, 120.5, 479.0, 140.3],
    ],
    fontsize: 11,
  },
  touroku_jimusho: {
    boxes: [[36.9, 116.2, 65.2, 144.6], [68.0, 116.2, 96.4, 144.6], [99.2, 116.2, 127.6, 144.6], [130.4, 116.2, 158.8, 144.6]],
    fontsize: 12,
  },
  touroku_bunrui: {
    boxes: [[170.1, 120.5, 184.3, 140.3], [187.1, 120.5, 201.3, 140.3], [204.1, 120.5, 218.3, 140.3]],
    fontsize: 11,
  },
  touroku_kana: { boxes: [[229.6, 116.2, 258.0, 144.6]], fontsize: 12 },
  touroku_ichirenban: {
    boxes: [[269.3, 120.5, 283.5, 140.3], [286.3, 120.5, 300.5, 140.3], [303.3, 120.5, 317.5, 140.3], [320.3, 120.5, 334.5, 140.3]],
    fontsize: 11,
  },
};

const KEIZOKU_LINE_FIELDS = {
  moushiten_shimei: { pos: [115, 334.5], fontsize: 10.5, max_width: 235 },
  moushiten_jusho: { pos: [65, 357.0], fontsize: 9.5, max_width: 290 },
  jukensha_shimei: { pos: [115, 394.0], fontsize: 10.5, max_width: 235 },
  jukensha_jusho: { pos: [65, 416.5], fontsize: 9.5, max_width: 290 },
};

const ITEN_GRID_FIELDS = {
  iten_gyomu_shubetsu: { boxes: [[121.9, 45.4, 136.1, 65.2], [138.9, 45.4, 153.1, 65.2]], fontsize: 12 },
  iten_shatai_bangou: {
    boxes: [
      [345.8, 131.8, 360.0, 151.7], [362.8, 131.8, 377.0, 151.7], [379.9, 131.8, 394.0, 151.7], [396.8, 131.8, 411.1, 151.7],
      [413.9, 131.8, 428.0, 151.7], [430.9, 131.8, 445.1, 151.7], [447.8, 131.8, 462.1, 151.7], [464.9, 131.8, 479.0, 151.7],
      [481.9, 131.8, 496.1, 151.7], [498.9, 131.8, 513.1, 151.7], [515.9, 131.8, 530.1, 151.7], [532.9, 131.8, 547.1, 151.7],
      [549.9, 131.8, 564.1, 151.7], [566.9, 131.8, 581.1, 151.7], [583.9, 131.8, 598.1, 151.7], [601.0, 131.8, 615.1, 151.7],
      [617.9, 131.8, 632.2, 151.7], [635.0, 131.8, 649.1, 151.7], [652.0, 131.8, 666.1, 151.7], [669.0, 131.8, 683.1, 151.7],
      [686.0, 131.8, 700.1, 151.7], [703.0, 131.8, 717.2, 151.7], [720.0, 131.8, 734.1, 151.7], [756.8, 131.8, 771.0, 151.7],
    ],
    fontsize: 11,
  },
  iten_touroku_jimusho: {
    boxes: [[31.2, 127.6, 59.6, 155.9], [62.4, 127.6, 90.7, 155.9], [93.5, 127.6, 121.9, 155.9], [124.7, 127.6, 153.1, 155.9]],
    fontsize: 12,
  },
  iten_touroku_bunrui: {
    boxes: [[164.5, 131.8, 178.6, 151.7], [181.4, 131.8, 195.6, 151.7], [198.4, 131.8, 212.6, 151.7]],
    fontsize: 11,
  },
  iten_touroku_kana: { boxes: [[224.0, 127.6, 252.3, 155.9]], fontsize: 12 },
  iten_touroku_ichirenban: {
    boxes: [[263.6, 131.8, 277.8, 151.7], [280.6, 131.8, 294.8, 151.7], [297.7, 131.8, 311.8, 151.7], [314.6, 131.8, 328.9, 151.7]],
    fontsize: 11,
  },
  iten_shoyusha_shimei: {
    boxes: [
      [85.1, 181.4, 113.3, 209.8], [116.2, 181.4, 144.6, 209.8], [147.4, 181.4, 175.7, 209.8], [178.6, 181.4, 206.9, 209.8],
      [209.7, 181.4, 238.1, 209.8], [241.0, 181.4, 269.3, 209.8], [272.2, 181.4, 300.5, 209.8], [303.3, 181.4, 331.7, 209.8],
      [334.5, 181.4, 362.8, 209.8], [365.7, 181.4, 394.0, 209.8], [396.8, 181.4, 425.2, 209.8], [428.0, 181.4, 456.4, 209.8],
      [459.2, 181.4, 487.6, 209.8], [490.4, 181.4, 518.8, 209.8], [521.6, 181.4, 549.9, 209.8], [552.8, 181.4, 581.1, 209.8],
      [583.9, 181.4, 612.3, 209.8], [615.1, 181.4, 643.4, 209.8], [646.3, 181.4, 674.6, 209.8], [677.5, 181.4, 705.8, 209.8],
    ],
    fontsize: 12,
  },
  iten_shiyousha_douji_checkbox: { boxes: [[39.7, 279.2, 53.9, 299.1]], fontsize: 11 },
};

const ITEN_LINE_FIELDS = {
  iten_shinshoyusha_shimei: { pos: [105, 515.0], fontsize: 9.5, max_width: 460 },
  iten_shinshoyusha_jusho: { pos: [75, 535.0], fontsize: 9, max_width: 490 },
  iten_shiyousha_shimei: { pos: [105, 557.0], fontsize: 9.5, max_width: 460 },
  iten_shiyousha_jusho: { pos: [75, 577.0], fontsize: 9, max_width: 490 },
  iten_kyushoyusha_shimei: { pos: [365, 502.0], fontsize: 9, max_width: 200 },
  iten_kyushoyusha_jusho: { pos: [335, 515.0], fontsize: 8.5, max_width: 230 },
  iten_dairinin_shimei: { pos: [345, 533.0], fontsize: 9, max_width: 220 },
  iten_dairinin_jusho: { pos: [345, 546.0], fontsize: 8.5, max_width: 220 },
};

const ININJO_LINE_FIELDS = {
  junin_jusho: { pos: [310, 159.0], fontsize: 10, max_width: 320 },
  junin_shimei: { pos: [310, 204.0], fontsize: 10, max_width: 320 },
  shinsei_shubetsu: { pos: [395, 250.0], fontsize: 10.5, max_width: 125 },
  touroku_bangou_or_shatai: { pos: [345, 313.0], fontsize: 11, max_width: 250 },
  date_year: { pos: [600, 362.0], fontsize: 10, max_width: 40 },
  date_month: { pos: [652, 362.0], fontsize: 10, max_width: 30 },
  date_day: { pos: [697, 362.0], fontsize: 10, max_width: 30 },
  ininsha1_furigana: { pos: [175, 427.0], fontsize: 8, max_width: 165 },
  ininsha1_shimei: { pos: [175, 454.0], fontsize: 10, max_width: 165 },
  ininsha1_jusho: { pos: [175, 492.0], fontsize: 9.5, max_width: 165 },
  ininsha2_furigana: { pos: [515, 427.0], fontsize: 8, max_width: 165 },
  ininsha2_shimei: { pos: [515, 454.0], fontsize: 10, max_width: 165 },
  ininsha2_jusho: { pos: [515, 492.0], fontsize: 9.5, max_width: 165 },
};

const JURYOZEI_CHECK_MARK = "✓";

const JURYOZEI_GRID_FIELDS = {
  juryozei_kikan_3nen: { boxes: [[190.6, 167.5, 209.1, 191.3]], fontsize: 13 },
  juryozei_kikan_2nen: { boxes: [[247.3, 167.5, 265.8, 191.3]], fontsize: 13 },
  juryozei_kikan_1nen: { boxes: [[304.1, 167.5, 322.6, 191.3]], fontsize: 13 },
  juryozei_jika: { boxes: [[476.8, 167.8, 495.3, 191.7]], fontsize: 13 },
  juryozei_jigyou: { boxes: [[544.2, 167.8, 562.7, 191.7]], fontsize: 13 },
  juryozei_kubun_you: { boxes: [[122.2, 199.0, 140.7, 222.9]], fontsize: 13 },
  juryozei_kubun_kamotsu: { boxes: [[122.2, 227.4, 140.7, 251.2]], fontsize: 13 },
  juryozei_kubun_nirin: { boxes: [[122.2, 255.7, 140.7, 279.5]], fontsize: 13 },
  juryozei_kubun_sonota: { boxes: [[122.2, 284.0, 140.7, 307.8]], fontsize: 13 },
};

const JURYOZEI_LINE_FIELDS = {
  juryozei_date_year: { pos: [220, 117], fontsize: 10, max_width: 25 },
  juryozei_date_month: { pos: [253, 117], fontsize: 9, max_width: 20 },
  juryozei_date_day: { pos: [293, 117], fontsize: 9, max_width: 20 },
  juryozei_touroku_or_shatai: { pos: [192, 142], fontsize: 10, max_width: 165 },
  juryozei_shiyousha_shimei: { pos: [462, 117], fontsize: 10, max_width: 330 },
  juryozei_shiyousha_jusho: { pos: [462, 151], fontsize: 9.5, max_width: 330 },
  juryozei_dairinin_shimei: { pos: [480, 340], fontsize: 9.5, max_width: 300 },
  juryozei_dairinin_jusho: { pos: [480, 358], fontsize: 9, max_width: 300 },
};

window.PdfFields = {
  KEIZOKU_GRID_FIELDS, KEIZOKU_LINE_FIELDS,
  ITEN_GRID_FIELDS, ITEN_LINE_FIELDS,
  ININJO_LINE_FIELDS,
  JURYOZEI_CHECK_MARK, JURYOZEI_GRID_FIELDS, JURYOZEI_LINE_FIELDS,
};
