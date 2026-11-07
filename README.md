# カララントスワイプ

FF14 のカララントを左右にスワイプして、好みの色と出会うサービス。

兄弟プロジェクト: [colorant-picker](https://github.com/PhantomL4rd/colorant-picker)

## 使い方

5 回「どっちが好き？」を答えると、好みに合う 6 色のおすすめが出ます。各色から Colorant Picker へ飛んで実際の組み合わせを試せます。日本語 / English 切替対応。

## アルゴリズム

AI は使わず、OKLab 色空間の数学のみ。

1. 全カララントから farthest-point sampling で代表色 28 色を選定
2. 好みベクトル更新 + 候補ペアから判別困難なものを次に出題 (Entropy 最大化近似)
3. 全色へガウス重みでスコア伝播
4. 多様性制約付き greedy で 6 色選出

## 開発

```bash
bun install
bun run dev          # dev サーバー
bun run check        # 型チェック
bun run test:engine  # エンジン自己検証
bun run build        # 静的ビルド
```

## 染色マスターの更新

染料の英語名・日本語名・RGBは [XIVAPI v2](https://v2.xivapi.com/api/sheet/Stain) の Stain シートから取得します。DBは使わず、生成したJSONをGitで管理し、アプリは同梱したデータを読み込みます。

- GitHub Actions の `Update dye master` が毎週水曜19:00（Asia/Tokyo、UTC 10:00）に起動します。Actionsの混雑により開始が遅れる場合があります。
- 手動更新: Actions → Update dye master → Run workflow（デフォルトブランチ）、または `bun run sync:dyes`。
- ローカル検証: `bun run test:dyes`。依存パッケージ不要、Node.js 22以降で実行できます。
- 取得と検証がすべて成功した場合だけ、染料JSONと `src/lib/translations/{en,ja}/dye.json` を更新します。API障害、空データ、既存行の欠落、日英の不一致は失敗とし、旧データを維持します。
- Actionsは変更がある場合だけデフォルトブランチへコミットします。リポジトリのActions書き込み権限と、botのpushを許すブランチ設定が必要です。公開環境への反映は既存のCloudflare Git連携によるビルド・デプロイに依存します。GITHUB_TOKENのpushは別のGitHub Actionsを起動しません。
- `scripts/dye-metadata.json` は既存IDとStain行IDの固定対応、およびアプリ独自のカテゴリ・タグ・Lodestoneリンク・入手元を保持します。既存IDは保存済み配色との互換性のため変更しません。
- 新しい染料は `dye_xivapi_<Stain行ID>` として追加します。カテゴリはShadeから、metallicタグは英語名から生成します。入手元・Lodestoneリンク・vividタグはAPIから推測せず、必要に応じて対応表に追記してください。既存のカテゴリ・タグは維持します。
- 季節別おすすめ・伝統色との対応など、編集方針を含む派生データの再生成は別作業です。
- 3リポジトリの取得スクリプトとテストは同じ仕様を保ち、変更時は合わせて更新してください。
