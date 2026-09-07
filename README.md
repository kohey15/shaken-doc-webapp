# 車検書類作成システム(スマホ専用Webアプリ版)

PCを一切使わず、**スマートフォンのブラウザだけで完結する**車検・名義変更書類作成システム。
旧版(`ShakenDocSystem`、Python/FastAPIサーバー版)を土台に、OCR・PDF生成のロジックを
すべてブラウザ内で完結するJavaScriptへ移植したもの。サーバー・バックエンドは存在しない。

## 構成

- **OCR**: Tesseract.js(ブラウザ内WASM実行。サーバー版のPython+Tesseractから移植)
- **PDF生成**: pdf-lib.js(サーバー版のPyMuPDFから移植。升目座標の数値は完全に同じものを使用)
- **車検証連携**: Web Share Target(車検証閲覧アプリの「共有」一覧に本アプリが直接表示される)
- **オフライン動作**: Service Worker(`sw.js`)がアプリ本体・帳票テンプレート・フォントを
  キャッシュし、通信できない環境でも動作する
- **印刷**: スマホのOS標準の印刷機能(`iframe.contentWindow.print()`)。プリンターが
  Mopria(Android)/AirPrint(iPhone)に対応している必要がある

個人情報(車検証データ・撮影画像・生成書類)は、この端末の中だけで処理され、
どこにも送信されない。

## ホスティングについて

このアプリは静的ファイルのみで構成されており、**どこか1つのURLで公開する**必要がある
(お店にPC/サーバーを置く必要はない)。GitHub Pages、Netlify、Cloudflare Pagesなど、
静的サイトホスティングであればどこでも動く。HTTPS配信必須(Web Share Target・
Service Workerの要件)。

ローカルでの動作確認は `python -m http.server` 等で行える(`http://localhost` は
セキュアコンテキストの例外のため、HTTPS化しなくてもService Worker等が動作する)。

## 重要: フォントについて(pdf-libの既知の不具合と回避策)

`assets/fonts/NotoSansJP-Regular-static.ttf` は、Google Fonts配布の可変フォント
`NotoSansJP-VF.ttf` から、ウェイト400(Regular)を固定インスタンス化したもの。

**なぜ可変フォントをそのまま使わないか**: pdf-lib(+ @pdf-lib/fontkit)は可変フォント
(OpenType Variable Fonts、`fvar`/`gvar`テーブルを持つフォント)を正しく扱えない。
実機検証の結果、可変フォントのまま`pdf-lib`に渡すと、生成PDFで一部の文字が
ランダムに欠落する不具合を確認した。`fonttools`の`varLib.instancer`で固定ウェイトの
静的インスタンスに変換することで解消する。

**さらに重要: `embedFont`のサブセット化(`subset: true`)も使わないこと**。静的フォントに
変換した後でも、pdf-lib 1.17.1 + @pdf-lib/fontkit 1.1.1 の組み合わせでは、グリフ数の
多い日本語フォントをサブセット化すると大半の文字が欠落する不具合を実機検証で確認した
(1文字ずつ分けて描画しても再現するため、レイアウト起因ではなくサブセット化処理自体の
不具合と判断)。`js/pdfgen.js`では`subset: false`(フルフォント埋め込み)にすることで
回避している。ファイルサイズは1書類あたり約3.4MBに増えるが、印刷は端末内で完結するため
実用上問題ない。

**フォントを再生成する場合**(元の可変フォントを更新した場合等):

```bash
pip install fonttools
python -c "
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.ttLib import TTFont
f = TTFont('元のVFファイル.ttf')
instantiateVariableFont(f, {'wght': 400}, inplace=True)
f.save('assets/fonts/NotoSansJP-Regular-static.ttf')
"
```

将来pdf-libのバージョンが更新されサブセット化の不具合が修正された場合は、
`js/pdfgen.js`の`subset: false`を`true`に戻せばファイルサイズを削減できる
(その際は必ず実機で全文字が欠落なく描画されるか再検証すること)。

## 未検証・実機確認が必要な項目

この開発環境には実機のAndroid端末・車検証閲覧アプリ・プリンターが無いため、
以下は実機での検証が必要:

- **車検証閲覧アプリからの共有(Web Share Target)が実際に機能するか**。共有時のMIMEタイプ・
  フィールド名は未確認のため、`manifest.json`の`share_target.params`は幅広いacceptを
  指定した推測値になっている。
- **Tesseract.jsによる住民票・印鑑証明書のOCR精度**(サーバー版のPython+Tesseractと
  同等の精度が出るか、処理時間が実用的か)。
- **プリンターへの印刷**(Mopria/AirPrint対応プリンターでの実際の印刷結果、升目の
  位置ズレの有無)。
- **PDF生成の最終的な見た目**(pdf-lib版で座標変換(Y軸反転)を行っているため、
  升目の位置が公式書式と一致しているか、実際に印刷して確認すること)。

## 元のサーバー版(ShakenDocSystem)との違い

- PCサーバー(FastAPI)・Windowsファイアウォール設定・自己署名証明書・SumatraPDF等、
  PCに関するものは一切不要になった。
- 「PC + ICカードリーダー」による車検証読み取り方式は廃止した(スマホの車検証閲覧
  アプリからの直接連携に一本化)。
- 本人確認書類のOCRは、住民票・印鑑証明書のみに対応を絞った(運転免許証等は対象外。
  この2書類のみがこの手続きで有効なため)。カメラは常にこのWebアプリから直接起動する
  (別のアプリを経由する手段は削除した)。
- 委任状の受任者情報(店舗情報)は、サーバーの設定ファイルではなくこの端末の
  `localStorage`に保存する(`settings.html`)。

## プロジェクト構成

```
index.html          受付画面(手続き選択〜印刷までの全ステップ)
settings.html        店舗情報の設定(localStorage保存)
manifest.json         PWAマニフェスト(share_target定義を含む)
sw.js                 Service Worker(オフラインキャッシュ・共有の受け口)
js/
  procedures.js       手続きの種類の定義(旧app/procedures.pyから移植)
  shakensho.js        車検証データの正規化(旧app/shakensho_import.pyから移植)
  pdf_fields.js        帳票の升目座標データ(旧app/config.pyから移植、数値は無変更)
  pdfgen.js           PDF生成(pdf-lib、旧app/pdf_fill.pyから移植)
  ocr.js              OCR(Tesseract.js、旧app/ocr.pyから移植)
  app.js              画面の配線・状態管理
templates/            国交省配布の公式PDFテンプレート(旧ShakenDocSystemと同じもの)
assets/fonts/         フォント(静的インスタンス化済み、上記「フォントについて」参照)
assets/icons/         ホーム画面アイコン
tessdata/             Tesseract日本語学習データ
```
