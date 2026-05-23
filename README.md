# NeoCELP & NeoVST-NJ8

日本人英語学習者向けの総合的語彙力測定システム。語彙処理速度 (CELP) と語彙サイズ (VST-NJ8) を Web ブラウザで測定し、結果を CSV で出力します。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 特長

- **3モード対応** — NeoCELP のみ / NeoVST-NJ8 のみ / 複合型テスト から選択可能
- **新JACET8000ベース** — 2016年改訂版の頻度リストに準拠
- **3PL IRTスコアリング内蔵** — JACET語彙研究会が提供している、公式 Excel 語彙サイズ計算シートのアルゴリズムを移植
- **自動データクリーニング** — 不正解・フライング応答・±3SD外れ値を自動除外（井関, 2020; 大久保, 2011; 橋本, 2010）
- **CSV出力対応** — シャッフル整合性を保証した試行レベルデータと集計データの両方を出力
- **サーバー不要** — HTML/CSS/JavaScript のみで動作。GitHub Pages で即公開可能

## テストのURL
`https://Ando-Hiro-rs.github.io/NeoCELP-VST-NJ8/`

## ローカルで動かす

```bash
git clone https://github.com/Ando-Hiro-rs/NeoCELP-VST-NJ8.git
cd NeoCELP-VST-NJ8
```

`index.html` をブラウザで直接開くだけで動きます。サーバー不要です。

開発中にライブリロードしたい場合は、以下のいずれかを使ってください。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` にアクセスします。

## プロジェクト構成

```
.
├── index.html              # エントリーポイント (モード選択画面)
├── src/
│   ├── css/                # スタイルシート
│   ├── js/                 # JavaScript モジュール
│   │   ├── celp.js         # NeoCELP テストロジック
│   │   ├── vst.js          # NeoVST-NJ8 テストロジック
│   │   ├── irt-scoring.js  # 3PL IRT スコアリングエンジン
│   │   └── csv-export.js   # CSV 出力モジュール
│   └── data/
│       ├── celp-items.json # CELP 同義語ペア
│       └── vst-items.json  # VST-NJ8 160項目バンク (IRTパラメータ込み)
├── docs/                   # 設計仕様・スコアリング理論
└── analysis/               # R/Python 分析スクリプト
```

## 引用方法

このツールを研究で使用された場合は、以下のように引用してください。

```
安藤嘉. (2026). NeoCELP & NeoVST-NJ8: 日本人英語学習者向け総合的語彙力測定システム.
GitHub. https://github.com/Ando-Hiro-rs/NeoCELP-VST-NJ8
```

`CITATION.cff` を参照すると、GitHub が自動的に正しい引用フォーマットを提示します。

## ベースとなる先行研究

- **VST-NJ8**: Hamada, A., Ishii, T., Kanazawa, Y., Kojima, M., Maeda, M., Mori, S., Saito, A., Sawano, R., Shimoda, Y., Tatsukawa, K., Tomita, K., Toyokuni, T., Tsubaki, M., & Yanagisawa, A. (2021). Development of a Vocabulary Size Test for Japanese EFL Learners Using the New JACET List of 8,000 Basic Words. *JACET Journal*, *65*, 23–45.
- **CELP**: 横川博一 (2006) や門田修平他（2014）などの先行研究に基づく
また、小室竜也氏のVST-NJ8オンライン語彙サイズテスト（https://ryuya-dot-com.github.io/OnlineVST-NJ8WithoutDontKnow/）とそのGit Hub公開コード（https://github.com/Ryuya-dot-com/OnlineVST-NJ8） を参考にして開発しております。
## ライセンス

MIT License。研究・教育目的での自由な利用を歓迎します。

## 制作者

安藤嘉
北海道教育大学札幌校教職大学院
