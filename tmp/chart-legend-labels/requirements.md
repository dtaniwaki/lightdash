# 要件整理: チャートの凡例・ツールチップ・軸を labelDimension でラベル表示

## 背景 / 課題

PR #25022 (`fb9591c2c7`) で、ディメンションの `filterAutocomplete.labelDimension` を
使い、フィルターのオートコンプリート候補を「別ディメンションの値（ラベル）」で表示できる
ようにした。しかしこのラベル化は **フィルターのオートコンプリート経路にしか効いていない**。

同じディメンションをチャートで使うと、凡例(legend)・ツールチップ・軸ラベルは
**生の値（id）のまま**表示される。結果として、同一チャート内で「フィルターはラベル、
凡例は id」という表記の割れが発生している。

## ゴール

`filterAutocomplete.labelDimension` が設定されたディメンションについて、チャートの
**凡例・ツールチップ・軸ラベル**でも id ではなくラベルを表示する。

対象チャート種別: **Cartesian(bar/line) + Pie**。

## 方針（確定済みの意思決定）

| 論点 | 決定 |
|------|------|
| ラベル定義元の config | 既存 `filterAutocomplete.labelDimension` を流用（新 config は作らない） |
| ラベルの供給方法 | **クエリ結果に随伴カラムとして載せる**（描画時の追加フェッチはしない） |
| 表示先スコープ | 凡例・ツールチップ・軸ラベル を一括 |
| チャート種別 | Cartesian + Pie |
| 真実の値 | **id を真実として維持**（シリーズキー・ソート・保存config・カラーマッピング・
エクスポートは id ベースのまま）。ラベルは表示レイヤーのみ |

## 設計の骨子

1. **バックエンド: 随伴カラムの自動注入**
   クエリの `dimensions` に含まれるフィールドが `labelDimension` を持つ場合、その
   ラベルディメンションを **非表示の随伴カラム**としてクエリに自動追加し、結果行
   (`ResultRow`) に id 列と並べて同居させる。
   - 参照実装: `fieldValuesQueryBuilder.ts:113-136`（フィルター経路で既に
     labelDimension を SELECT に足している唯一の例）。
   - 随伴カラムは結果テーブル/エクスポート/ソートUI などユーザー向けフィールド一覧
     には出さない（pivot の `passthroughDimensions` 相当の「クエリには含むが表示
     しない」扱い）。

2. **フロントエンド: id→label 辞書の構築とスレッド**
   結果行から `Map<fieldId, Map<rawId, label>>` を構築し、echarts の各フォーマッタに
   渡す。
   - 凡例: `getSeriesLegendName()` (`useEchartsCartesianConfig.ts:3104`)
   - ツールチップ: `buildCartesianTooltipFormatter()`
     (`tooltipFormatter.ts:914`)
   - 軸: `getCartesianAxisFormatterConfig()`
     (`getCartesianAxisFormatterConfig.ts:23`)
   - Pie: pie 用の凡例/ツールチップ経路（`useEchartsPieConfig` 相当）
   - 共通チョークポイント `formatItemValue()` (`formatting.ts:1193`) に
     オプショナルな label マップ引数を足すか、その外側でラップするかは計画で決める。

## 前提・制約（非自明な事実）

- **ラベルは id に対して関数従属である前提**（1つの id につきラベルは1つ）。この前提の
  下では、随伴カラムを GROUP BY に足しても集計粒度は変わらない。前提が崩れた
  （1 id に複数ラベル）場合は先頭を採用する等の縮退挙動とし、集計は id 基準を維持する。
- ラベルディメンションは対象フィールドと**同一テーブル**にある必要がある
  （フィルター経路が既に `Can't find label dimension in table` で検証済み）。

## 非目標（やらないこと）

- 結果テーブル / CSV・エクスポート のラベル化（id 表示のまま）。今回のスコープ外。
- Big Number / その他の非対象ビジュアライゼーション。
- ソート順・カラーマッピング・保存済み chart config のキーを label 化すること
  （すべて id 基準を維持）。
- 新しい dbt YAML スキーマ項目の追加（既存 labelDimension を流用するため不要）。

## 受け入れ基準

1. `labelDimension` 付きディメンションを軸/シリーズに使った bar/line チャートで、
   凡例・軸ラベル・ツールチップがラベル表示になる。
2. 同ディメンションを使った pie チャートで、凡例・ツールチップがラベル表示になる。
3. `labelDimension` を持たないディメンションの表示は従来どおり（回帰なし）。
4. ソート・カラー割り当て・保存/再読込が id 基準で維持される。
5. 結果テーブル/エクスポートは従来どおり id 表示（意図的なスコープ外）。
