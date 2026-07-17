# 実装計画: チャート凡例・ツールチップ・軸ラベルの labelDimension ラベル表示

## 0. サマリ

`filterAutocomplete.labelDimension` を持つディメンションについて、Cartesian(bar/line)・Pie チャートの **凡例・ツールチップ・軸ラベル** の表示を id からラベルへ差し替える。ラベルは「クエリ結果に随伴カラムとして同居させる」方式で供給し、id をシリーズキー・ソート・カラー・保存 config・エクスポートの真実として維持したまま、表示レイヤーのみをラベル化する。

実装の要は次の 2 つのチョークポイントに集約される。

- バックエンド: 随伴カラムを SELECT/GROUP BY に注入しつつ、クライアントに返す `fields`(=フロントの `itemsMap`)からは除外し、id→label の対応を別チャネルで返す。
- フロントエンド: `resultsData.fields` がそのまま `itemsMap` になり、チャート config・テーブル・ソート UI・凡例既定値の唯一のゲートになっている(`VisualizationProvider.tsx:123-125`)。`resultsData.rows` は SQL の SELECT が生成した全カラムを保持する(`ResultRow = Record<fieldId,{value}>`)。したがって「rows に随伴カラムを残し、fields には出さない」だけでスコープ制約(テーブル/エクスポート/ソートは id のまま)が自動的に満たせる。

---

## 1. データフロー / コンポーネント図

### 1-1. データフロー(dbt YAML → 描画)

```
dbt YAML
  dimensions:
    - name: customer_id
      meta:
        filter_autocomplete:
          label_dimension: customer_name      ← 既存 config を流用(新規スキーマ追加なし)
        │
        ▼ exploreCompiler → Dimension.filterAutocomplete.labelDimension
        │
┌───────┴───────────────────── BACKEND ────────────────────────────────┐
│  compileMetricQuery / QueryComposer                                   │
│    metricQuery.dimensions = [customer_id, ...]  (ユーザー選択のみ)     │
│        ▼  ★resolveCompanionLabelDimensions()                          │
│           dimensions を走査し labelDimension を持つ dim について      │
│           同一テーブルの label dim id を解決(共通ヘルパー化)          │
│        ▼  companionLabelDimensionIds = [customer_name]                │
│           labelDimensionMap = { customer_id: customer_name }          │
│  MetricQueryBuilder.getDimensionsSQL()                                │
│    SELECT に customer_id, customer_name 両方 / GROUP BY にも随伴カラム │
│    → 関数従属前提のもとで集計粒度は不変                               │
│        ▼  warehouse 実行 → 行(全カラム同居)                         │
│  クエリ応答組み立て (AsyncQueryService)                               │
│    rows:   { customer_id:{value}, customer_name:{value}, <metric> }   │
│    fields: getFieldsFromMetricQuery(...) から ★随伴カラムを除外       │
│    ★ labelDimensionMap をクエリ応答 metadata に添付                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                 ▼
┌───────────────────────── FRONTEND ───────────────────────────────────┐
│  resultsData = { rows, fields, metricQuery, labelDimensionMap, ... }  │
│    itemsMap = resultsData.fields  → 随伴カラムを含まない              │
│      → テーブル/ソート/エクスポート/config は id ベースのまま         │
│        ▼  ★ useLabelValueMap(rows, labelDimensionMap)                 │
│           Map<fieldId(id列), Map<rawId, label>> を1回だけ構築         │
│        ├────────────► Cartesian config (useEchartsCartesianConfig)    │
│        └────────────► Pie config (usePieChartConfig/useEchartsPieConfig)│
└───────────────────────────────────────────────────────────────────────┘
```

### 1-2. 辞書がどこで参照されるか

```
labelValueMap: Map<fieldId, Map<rawId, label>>
   ├─ CARTESIAN
   │   ・凡例(pivot時): useEchartsCartesianConfig.ts:1019 → getFormattedValue()
   │   ・ツールチップ:   tooltipFormatter.ts:914 buildCartesianTooltipFormatter()
   │   ・軸(category):  getCartesianAxisFormatterConfig.ts:23
   │   共通下層: getFormattedValue()(valueFormatter.ts:7) / formatItemValue()
   └─ PIE
       ・グループ表示名: usePieChartConfig.ts:269(name は color/sort キー、displayName を別新設)
       ・凡例/ツールチップ: useEchartsPieConfig.ts:113,142,205
```

---

## 2. 未解決の設計判断と推奨案

### 2-1. 随伴カラムをクエリに注入する仕組み → 推奨 (A)

**compiled 層でのみ dimensions を拡張し、ユーザー向け `metricQuery.dimensions`・`fields` には出さない。`passthroughDimensions` は流用しない(非 pivot 経路に効かず別目的のため)。**

- `getDimensionsSQL()` は `compiledMetricQuery.dimensions` から SELECT と `GROUP BY 1,2,...`(位置指定)を作る。随伴カラムをここに含めれば SELECT・GROUP BY・結果行同居が一度に達成。関数従属前提で GROUP BY 追加は粒度不変。
- ただし `getFieldsFromMetricQuery()`(`index.ts:767`)も同じ `dimensions` から `fields`(itemsMap)を作るため、随伴カラムが混ざるとテーブル列・ソート UI・config 候補・エクスポートに漏れる。→ **「SQL 生成用 dimensions」と「ユーザー向け dimensions/fields」を分離**。
  - **(A・採用)** `MetricQueryBuilder`/`compileMetricQuery` で随伴 id 群 `companionLabelDimensionIds` と `labelDimensionMap` を算出、SELECT/GROUP BY へ注入。`CompiledQuery` に両者を載せ、`AsyncQueryService` で `fields` からのみ除外。`metricQuery.dimensions` が一切変わらないので保存 config・ソート・pivot 派生・カラー割り当てが無改変で id 基準維持。
  - (B・非推奨) `passthroughDimensions` 流用は pivot 専用で非 pivot/Pie/テーブルに漏れ、除外箇所が分散。
- labelDimension 解決・検証(`fieldValuesQueryBuilder.ts:112-136`: 同一テーブル存在チェック / `isDimension` / 自己参照回避)は共通ヘルパー `resolveLabelDimensionId(field, explore)` として common に切り出し、フィルター経路と共有。

### 2-2. id→label 辞書の構築場所とスレッド

**フロントの `resultsData` 受領直後に一度だけ `Map<idFieldId, Map<rawId, label>>` を構築し、`VisualizationContext` 経由で各 echarts config フックに配る。`formatItemValue` には引数を足さず、外側の `getFormattedValue`(valueFormatter.ts:7)を主ラップ点にする。**

- 辞書構築(新規 `useLabelValueMap`): `row[idFieldId].value.raw`(真実キー)→ `row[labelFieldId].value.formatted`(表示ラベル)。O(rows)。raw をキーにするのは pivot 後のシリーズキーも raw に一致するため。
- スレッド: `VisualizationProvider` に `labelValueMap` を追加し context 化。各 config フックは既に `useVisualizationContext()` を使用済みで最小差分。
- `formatItemValue` は不変(呼び出し元が多すぎるため)。表示 3 経路が通る中間関数でラベル差し替え:
  - `getFormattedValue`(valueFormatter.ts:7): Cartesian 凡例(pivot ラベル)+ ツールチップ pivot 値の共通点。optional 引数 `labelValueMap?` を末尾追加し、対象 id 列なら raw→label 置換、無ければ従来どおり。
  - 軸: `getCartesianAxisFormatterConfig`(:23) に `labelValueMap?` を足し、category 軸は `axisLabel.formatter` を明示設定して raw→label 変換(現状 formatting 無し dim には formatter が付かない :76)。ここが軸対応の主変更点。
  - Pie: `name` は color/sort/legend キーを兼ねるので raw ベース維持、表示名は別 `displayName`(下記 2-4)。
- 新引数はすべて optional 末尾追加で未指定時は現行と完全同一挙動。

### 2-3. label 対応をフロントへ運ぶチャネル

**クエリ応答に `labelDimensionMap: Record<idFieldId, labelFieldId>` を metadata として添付。** 既存 `MetricQuery.metadata`(`metricQuery.ts:201`)への追随が最小・堅牢。古いキャッシュには無いため **不在時は従来表示へフォールバック**(後方互換)必須。

### 2-4. pivot(フロント/バックエンド両方)との相互作用

- 辞書は id→label(raw ベース)なので pivot 後も引ける。Cartesian pivot は `pivotReference.pivotValues = {field,value(raw)}` を保持し `getFormattedValue(value, field, ...)`(:1021)で表示化 → ここに辞書を差せばよい。
- バックエンド pivot は `pivotValuesColumnsMap` が pivot 列→`referenceField`+raw を保持し、`getFormattedValue` は既に `referenceField` 経由で元 item を引く(valueFormatter.ts:17-18)。辞書参照も `referenceField` 経由で整合。
- 随伴カラムと pivot GROUP BY: pivot 有効時は随伴 id を `PivotConfiguration.passthroughDimensions` に流すのが自然な合流点になり得る。**A3 スパイクで要検証**(retrofit rows に随伴カラムが残ることの確認)。
- **Pie の色/ソートキー問題(重要)**: `usePieChartConfig.ts:269` の `name`(=`row[groupFieldId].value.formatted` 結合)が color(`getGroupColor`)・sort・legend・保存 config(`groupColorOverrides`/`groupSortOverrides`/`groupLabelOverrides` のキー)すべての識別子。現状すでに formatted 値ベース(raw id ではない)。**`name`(識別子)は現状維持し、表示専用 `displayName` を新設**して legend/tooltip/label にだけ使う。`groupLabelOverrides`(手動上書き)は `name` キーのまま優先。

---

## 3. サブタスク分割と依存関係

### フェーズ 0: 共通基盤(先行・ブロッカー) — 相互ほぼ独立 [並列可]

- **T0-1 (common)**: labelDimension 解決・検証を共通ヘルパー `resolveLabelDimensionId(field, explore): string | null` に抽出(`fieldValuesQueryBuilder.ts:112-136` から)。`fieldValuesQueryBuilder` を置換(挙動不変リファクタ)。
- **T0-2 (common)**: 型追加。`CompiledQuery`/`CompiledMetricQuery` に `companionLabelDimensionIds` と `labelDimensionMap` を運ぶ器。応答 metadata に `labelDimensionMap?: Record<string,string>`。
- **T0-3 (common)**: `getFieldsFromMetricQuery`(`index.ts:767`)に除外 fieldId 集合の optional 引数追加(既存呼び出しは無指定で不変)。

### フェーズ A: バックエンド(T0 後)

- **A1**: `MetricQueryBuilder`/`compileMetricQuery` で `resolveLabelDimensionId` を使い companion id / labelDimensionMap 算出。SELECT/GROUP BY 注入。`CompiledQuery` に載せる。
- **A2** (A1依存): `AsyncQueryService` で `fields` から companion 除外(T0-3)。応答へ `labelDimensionMap` 添付。
- **A3 [pivot スパイク]** (A1依存, A2と並列可): pivot 有効時に随伴カラムを `passthroughDimensions` に流す接続を検証・実装。retrofit rows に随伴カラム値が残ることを確認。

### フェーズ B: フロントエンド(A2 で応答契約確定後)

- **B1** (A2依存): `useLabelValueMap` 新規 + `VisualizationProvider` で context 化。
- **B2 [並列可]** (B1依存): Cartesian。`getFormattedValue` に labelMap 対応 → 凡例・ツールチップ配線。`getCartesianAxisFormatterConfig` に labelMap + category 軸 formatter。幅計算(`getLongestLabelsForAxis` 等)もラベル後文字列で測る。
- **B3 [並列可]** (B1依存): Pie。`usePieChartConfig` に表示専用 `displayName`(color/sort/config キーは `name` 据え置き)。`useEchartsPieConfig` の legend/tooltip/label を `displayName` 参照に。

### フェーズ C: テスト・検証

- **C1**: backend SQL スナップショット/ユニット(`MetricQueryBuilder.test.ts`)に随伴カラム注入・fields 除外の回帰。`fieldValuesQueryBuilder.test.ts` のリファクタ回帰。
- **C2**: common ヘルパー・辞書構築のユニット。
- **C3**: 受け入れ基準の手動検証(bar/line/pie でラベル表示、labelDimension 無しの回帰なし、保存/再読込で id 基準維持、テーブル/エクスポートは id のまま)。

依存グラフ: `T0-* → A1 → {A2, A3}` / `A2 → B1 → {B2, B3}` / 全実装 → `C*`。

---

## 4. 品質チェック手順

- **common**: `pnpm -F common typecheck:fast` / `pnpm -F common lint` / `pnpm -F common test`
- **backend**: `pnpm -F backend typecheck:fast` / `pnpm -F backend lint` / `pnpm -F backend test:dev:nowatch`
- **frontend**: `pnpm -F frontend typecheck:fast` / `pnpm -F frontend lint`
- **API 生成**: 応答型に `labelDimensionMap` を足すため、TSOA コントローラ戻り値に露出するなら `pnpm generate-api` 必須。露出時は `generate:chart-as-code-schema` / `check:chart-as-code-schema` の要否も確認(chart config 自体は不変で基本不要)。
- **dbt YAML スキーマ**(`lightdashMetadata.json` / `lightdash-dbt-2.0.json`): **変更不要**(既存 config 流用)。
- worktree 内 lint は CLAUDE.md の `.eslintrc.js` リネーム回避手順に従う。

---

## 5. リスクとトレードオフ

- **関数従属前提の破れ(1 id に複数 label)**: GROUP BY に随伴カラムが入り id×label が別行化し得る。初期はフロント辞書「先頭採用」で id 基準を守るが、行数増で x カテゴリ重複やメトリクス二重計上の恐れ。将来は backend で label を `MIN()`/`ANY_VALUE()` ラップ + GROUP BY 除外の選択肢(方言差ありで初期スコープ外)。前提を明記・ドキュメント化。
- **Pie の識別子とラベル分離**: `name` が color/sort/config キー兼務。`displayName` 追加を誤ると override が壊れる。手動 `groupLabelOverrides` > labelDimension 自動 の優先順位を明確化しスナップショットで担保。
- **軸カテゴリのラベル化**: category 軸ティックは生値描画、幅計算(`getLongestLabelsForAxis`/`getCategoryAxisTickLabelWidth`)が生値使用。ラベル長差で軸余白/回転が崩れうる → 幅計算をラベル後文字列に合わせる。
- **随伴カラムの列数増加**: label 対象 dim 数に比例。pivot 総列数警告(`pivotTotalColumnCount`)に影響しないこと確認。
- **backend pivot passthrough 接続(A3)**: retrofit rows に随伴カラムが残らないと backend pivot 時に辞書が空になり pivot ツールチップだけ非ラベル化の不整合。独立検証タスク化済み。
- **キャッシュ整合**: `labelDimensionMap` 不在時(古いキャッシュ)は従来表示へフォールバック必須。

---

## 実装に重要なファイル

- `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts`(随伴カラム SELECT/GROUP BY 注入 + companion 算出)
- `packages/common/src/index.ts`(`getFieldsFromMetricQuery` に除外集合オプション)
- `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`(fields 構築で除外, 応答へ labelDimensionMap, pivot passthrough 接続)
- `packages/common/src/visualizations/helpers/valueFormatter.ts`(`getFormattedValue` — Cartesian 凡例/ツールチップの共通ラベル差し替え点)
- `packages/frontend/src/hooks/usePieChartConfig.ts`(name/displayName 分離)
- 周辺: `fieldValuesQueryBuilder.ts:112-136`(ヘルパー化元), `VisualizationProvider.tsx:123`(itemsMap/labelValueMap 配線), `getCartesianAxisFormatterConfig.ts:23`(軸), `tooltipFormatter.ts:914`(ツールチップ), `useEchartsCartesianConfig.ts:1019`(pivot 凡例), `useEchartsPieConfig.ts`(Pie)
