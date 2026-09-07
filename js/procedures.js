// 受付で選択する「手続きの種類」の定義。app/procedures.py からそのまま移植。
// 各フィールドの意味は元ファイルのコメント参照。

const PROCEDURES = [
  {
    key: "keizoku",
    label: "継続車検",
    status: "active",
    needs_shakensho: true,
    gyomu_shubetsu: null,
    documents: [
      { id: "keizoku-kensa", label: "継続検査申請書" },
      { id: "juryozei-nofusho", label: "自動車重量税納付書" },
    ],
    roles: [{ key: "shiyousha", label: "使用者(申請人)", source: "shakensho_user" }],
    show_checklist: false,
  },
  {
    key: "iten",
    label: "名義変更(移転登録)",
    status: "active",
    needs_shakensho: true,
    gyomu_shubetsu: "03",
    documents: [
      { id: "iten-touroku", label: "移転登録申請書" },
      { id: "ininjo", label: "委任状" },
    ],
    roles: [
      { key: "kyu_shoyusha", label: "旧所有者(譲渡人)", source: "shakensho_owner" },
      { key: "shin_shoyusha", label: "新所有者(譲受人)", source: "ocr" },
    ],
    show_checklist: true,
  },
  {
    key: "chuko_shinki",
    label: "中古新規登録",
    status: "active",
    needs_shakensho: false,
    gyomu_shubetsu: "01",
    documents: [
      { id: "iten-touroku", label: "新規登録申請書" },
      { id: "ininjo", label: "委任状" },
      { id: "juryozei-nofusho", label: "自動車重量税納付書" },
    ],
    roles: [{ key: "shin_shoyusha", label: "新所有者(=使用者)", source: "ocr" }],
    show_checklist: true,
  },
  {
    key: "henko",
    label: "変更登録(住所変更等)",
    status: "active",
    needs_shakensho: true,
    gyomu_shubetsu: "04",
    documents: [
      { id: "iten-touroku", label: "変更登録申請書" },
      { id: "ininjo", label: "委任状" },
    ],
    roles: [{ key: "shoyusha", label: "所有者(変更後の情報)", source: "ocr" }],
    show_checklist: false,
  },
  {
    key: "massho",
    label: "抹消登録",
    status: "coming_soon",
    needs_shakensho: false,
    gyomu_shubetsu: null,
    documents: [],
    roles: [],
    show_checklist: false,
  },
];

window.Procedures = { PROCEDURES };
