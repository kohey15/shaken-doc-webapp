// 受付で選択する「手続きの種類」の定義。app/procedures.py からそのまま移植。
// 各フィールドの意味は元ファイルのコメント参照。

const PROCEDURES = [
  {
    key: "shako", label: "車庫証明申請書（長野県・普通車）", status: "active",
    needs_shakensho: true, gyomu_shubetsu: null,
    documents: [{ id: "shako-nagano", label: "自動車保管場所証明申請書（2枚組）" }],
    roles: [{ key: "shako_applicant", label: "申請者", source: "ocr" }],
    show_checklist: false,
  },
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
    label: "一時抹消登録（普通車）",
    status: "active",
    needs_shakensho: true,
    gyomu_shubetsu: null,
    documents: [
      { id: "massho-application", label: "一時抹消登録申請書（第3号様式の2）" },
      { id: "massho-fee", label: "手数料納付書" },
      { id: "massho-ininjo", label: "委任状（代理申請の場合）", defaultChecked: false },
    ],
    roles: [{ key: "massho_owner", label: "所有者", source: "shakensho_owner" }],
    show_checklist: false,
  },
];

window.Procedures = { PROCEDURES };
