# Plan: Blueprintsパターンの最小検証

## 背景

エージェントによるコード変更量が爆発している（DORA: PR数+98%, PRサイズ+154%）。
人間がdiffを全部追えなくなった。diffを読む代わりに何で品質を担保するのか。

この検証では、Stripe が実践する Blueprints パターン（決定論的ゲート + コンテキスト分離）の有効性を、
既存のOSSツールを使って最小構成で試す。

## 検証の問い

**diffを読まずに、ツールが生成する「diffの代替物」だけでマージ可否を判断できるか？**

「diffの代替物」の候補:
- 判断記録: エージェントがなぜこう実装したか（Entire Checkpoints）
- 動作の証拠: 実行結果のキャプチャ（Showboat）
- ゲートの通過結果: typecheck, test の成否

## 検証対象

- リポジトリ: ts-bench (https://github.com/laiso/ts-bench)
- タスク: Issue #47 — SWE-Lancer Dataset v2 の統合
- 既存ゲート: `bun run typecheck`, `bun test ./src`（`package.json` の scripts）

## 使用ツール

### 1. Entire Checkpoints (https://github.com/entireio/cli)
- エージェントのセッション（プロンプト、推論ステップ、判断）をコードと一緒に記録する
- 「コードにならない判断」を成果物として出力する
- 対応エージェント: Claude Code, Gemini CLI, OpenCode, **Cursor**（プレビュー）, Factory Droid, Copilot CLI など
- インストール: Homebrew（`brew install entireio/tap/entire`）または `go install`（npm パッケージなし）。`entire login` が必要
- メタデータは `entire/checkpoints/v1` ブランチに保存。**公開リポジトリでは可視性に注意**（シークレットはベストエフォートでマスク）
- Cursor 連携時: 現状 **`entire rewind` は未対応**（README 明記）

### 2. Showboat (https://github.com/simonw/showboat)
- エージェントの成果物を実行可能なMarkdownドキュメントとして出力
- `showboat verify` で再実行して出力一致を検証
- diffの代わりに「動作の証拠」を見る
- インストール: `uvx showboat` / `uv tool install showboat` / `pip install showboat` / `go install`
- Bun プロジェクトでは `showboat exec … bash "bun run typecheck"` のように **bash 経由で bun を叩く**のが素直

### 3. Open SWE (https://github.com/langchain-ai/open-swe)
- Stripe/Ramp/Coinbase が独立に到達したアーキテクチャの OSS 実装
- Blueprints パターン（決定論的ノード + エージェントノードの交互配置）をフレームワークとして提供
- サンドボックス隔離、AGENTS.md、サブエージェント対応
- **最小検証にはフルスタック導入は過剰**: Python 3.11–3.13, uv, LangGraph CLI, ngrok, GitHub App, LangSmith（サンドボックス）など多段セットアップが前提（[INSTALLATION.md](https://github.com/langchain-ai/open-swe/blob/main/INSTALLATION.md)）
- 本検証では **Open SWE はデプロイせず**、決定論パートは **CI / シェルでの `typecheck`・`test` ゲート**で代替する（アーキテクチャ比較・参照用に README のみ追う）

## 実施ステップ

### Phase 1: ツールのセットアップ
- [ ] Entire Checkpoints をインストールし、ts-bench で `entire enable --agent cursor`（または利用エージェント）まで動作確認する
- [x] Showboat: `uvx showboat --help` で起動確認済み → リポジトリルートで `init` / `exec` / `verify` の通しを未実施なら実施する
- [x] Open SWE: セットアップ要件を確認し、**本検証スコープでは導入しない**（シェル + 既存 npm scripts で決定論ゲートを代替）

#### Phase 1 調査メモ（2026-03-28）
- Showboat は追加インストールなしで `uvx` から利用可能であることを確認
- Open SWE は Issue #47 の「代替物レビュー」実験の必須ツールではないと判断

### Phase 2: エージェントにタスクを実装させる
- [ ] Issue #47 の Phase 1（データセット抽象化）をエージェントに実装させる
- [ ] Entire Checkpoints でセッションを記録する（判断記録の取得）
- [ ] Showboat でデモドキュメントを生成する（動作証拠の取得）
- [ ] typecheck / test のゲート結果を記録する

### Phase 3: diffを読まずにレビューする
- [ ] 取得した「diffの代替物」だけを見て、マージ可否を判断する
  - Entire の判断記録: なぜこのアプローチか、却下した代替案は何か
  - Showboat の動作証拠: 期待通りに動いているか
  - ゲート結果: typecheck / test は通っているか
- [ ] 判断した内容と理由を記録する

### Phase 4: 答え合わせ
- [ ] diff 全文を読んで、Phase 3 で見落とした問題があるか確認する
- [ ] 各ツールが何を担保し、何を見落としたかを記録する
- [ ] 「判断記録だけでレビューする」ことの限界と有効範囲を整理する

### Phase 5: 記事の執筆
- [ ] 検証結果をもとに記事を書く
- [ ] 必要なら `blog/article-outline.md` にアウトラインを新規作成する（リポジトリ内に未配置）

## Blueprints パターンの核（参考）

プロセスを分ける理由は2つ:
1. 決定論的分岐 → エージェントが失敗を握りつぶすことを防ぐ
2. コンテキスト切断 → エージェントが自分の出力に甘くなることを防ぐ

Stripe: 「モデルがシステムを動かすのではない。システムがモデルを動かす」

## 参考資料

- 記事アウトライン: blog/article-outline.md
- Stripe Minions Part 1: https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents
- Stripe Minions Part 2: https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2
- Anthropic Harness Design: https://www.anthropic.com/engineering/harness-design-long-running-apps
- OpenAI Harness Engineering: https://openai.com/index/harness-engineering/
- Entire (元GitHub CEO): https://entire.io/news/former-github-ceo-thomas-dohmke-raises-60-million-seed-round/
- Showboat: https://simonw.substack.com/p/introducing-showboat-and-rodney-so
- Open SWE: https://github.com/langchain-ai/open-swe
- DORA 2025 Report: https://dora.dev/research/2025/dora-report/
- サンドボックス比較: https://blog.lai.so/agents-sandbox/
