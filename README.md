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
npm install
npm run dev          # dev サーバー
npm run check        # 型チェック
npm run test:engine  # エンジン自己検証
npm run build        # 静的ビルド
```
