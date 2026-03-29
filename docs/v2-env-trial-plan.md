# V2 実行環境の試行プラン（検討順固定）

Repository copy of the trial plan for cloud / offline use (see also `docs/phase-0-cursor-cloud.md`).

## 背景・目的

- **目的:** `--dataset v2`（SWE-Lancer）が **エージェント実行からテストまで一通り**完了する環境を用意する。
- **制約:** ローカル Mac は使用しない（ディスク / Docker 制約のため）。

## ディスク要件（計画用の前提・要検証）

作業前提として **イメージ約 20GB + 作業領域約 50GB（合計約 70GB 規模）** を一度に確保したい、という要求に立つと:

- **Cursor の標準クラウド VM（使い捨て環境）**は、公開情報では **数十 GB 級の上限**という見方もあるが、**2026-03 のプロジェクト実測セッション**ではルート **総容量約 126GB**、pull 前 **空き約 112GB**、pull 後 **空き約 100GB**（使用約 21GB）で、**70GB 級の同時利用は観測上問題なし**。一方 **Cloud Agent の Resource limits 説明にディスク GB の明示は見当たらず**、個人プランのストレージ増設の有無もそこからは特定できない（**ドキュメント改定で変わり得る**）。**必ずその場で `df -h` と最新公式を確認**すること。
- **GitHub Codespaces**はマシンタイプを選べるが、**公式ドキュメントの「マシン一覧」ではコア数・メモリが目立ち、ディスク既定値は UI または `hostRequirements.storage`（devcontainer）で確認が必要**。調査時に **「128GB」が RAM 表記とストレージ表記を取り違えていないか**を要確認。要件 70GB を満たすなら **ストレージ列が 70GB 超**であるマシン、または **devcontainer で最小ストレージを明示**できるかを確認する。
- **Self-hosted Cloud Agent**は実行先 VM のディスクを自分で決められるため、**70GB 超を明示的に確保したワーカー**なら要件に最も素直に合わせられる（インフラ負担は増える）。

**試行順**は **Phase 0（Cursor Cloud）→ Phase 1（Codespaces）→ GCP → Hetzner → exe.dev**。Phase 0 で **ディスク／Docker pull が無理なら**すぐ Phase 1 へ。**ディスクだけ見ると GCP/Hetzner の方が「70GB を最初から足す」のが簡単な場合がある**。Codespaces は **マシンタイプのストレージが足りることを確認してから**試す（足りなければ GCP に進む判断でよい）。

- **ベンチの前提**（リポジトリ既存仕様）:
  - サブモジュール: `repos/frontier-evals`, `repos/expensify-app`
  - Docker イメージ: `swelancer/swelancer_x86_monolith:releasev1`（`linux/amd64`）
  - 例コマンド: `bun src/index.ts --agent <agent> --model <model> --dataset v2 --exercise <task_id> --verbose`
  - 参考: [docs/environment.md](environment.md) の SWE-Lancer / Docker 節、[scripts/setup-v2-env.sh](../scripts/setup-v2-env.sh)

## 試行リスト（この順のみ）

| 順 | プラットフォーム | 役割のイメージ |
|----|------------------|----------------|
| **0** | **Cursor Cloud** | 使い捨てクラウド環境で **ディスク・Docker・イメージ pull** が足りるかを最速検証。手順: [docs/phase-0-cursor-cloud.md](phase-0-cursor-cloud.md) |
| 1 | **GitHub Codespaces** | ブラウザ＋リポから試す。ストレージ/時間の制約を確認（マシン **ストレージ GB** を公式で確認）。 |
| 2 | **GCP Compute Engine** | フル Linux VM。ディスク・スペックを明示的に確保。従量だが止められる。 |
| 3 | **Hetzner Cloud** | 固定月額が読みやすい VPS。Terraform/API での後続自動化もしやすい。 |
| 4 | **exe.dev** | 永続 VM 型。基本 25GB 共有＋**ディスク増設**（サポート依頼・従量）の前提で最終候補。 |

### Phase 0 専用（Cursor Cloud）

- **目的:** 「Cursor 標準クラウドで v2 の **docker pull ～** が現実的か」を **数十分で判定**する。
- **成功の最低ライン:** `docker pull ... swelancer_x86_monolith:releasev1` が **ディスク不足なく完了**（スモークまで行ければ尚よい）。
- **失敗時:** Phase 1 へ進む（ローカル Mac は引き続き使わない前提）。

## 各段階の共通「完了」定義（成功基準）

次の **すべて**を満たしたら、その段階を成功とし、必要ならここで打ち止め可能。

1. `git submodule update --init` 相当で **frontier-evals / expensify-app** が揃う（git-lfs 含め取得可能）。
2. `docker pull --platform linux/amd64 swelancer/swelancer_x86_monolith:releasev1` が **エラーなく完了**。
3. **1 タスク**のスモークが完了:  
   `bun src/index.ts --agent cursor --model sonnet --dataset v2 --exercise <task_id> --verbose`（または利用エージェントに置換）で **Overall が成功**、または少なくとも **Docker 内セットアップ＋テスト段階まで到達**が再現可能。

**失敗時の扱い:** 上記のいずれかで **ディスク不足・I/O エラー・タイムアウト・Docker デーモン不可**など、**同じ環境では解消が難しい**と判断したら **次の順へ進む**（戻りは任意）。

## 段階ごとの着眼点（簡潔）

### 0. Cursor Cloud（Phase 0）

- **手順:** [docs/phase-0-cursor-cloud.md](phase-0-cursor-cloud.md)
- **確認:** 利用中環境の **空きディスク**、**Docker**、**swelancer イメージの pull**。
- **実測メモ（参考）:** ある環境では **Docker は最初から入っていなかった**。`docker.io` + `fuse-overlayfs` を apt 導入し、`daemon.json` で **`storage-driver: fuse-overlayfs`**、ネスト環境のため **`iptables: false`**（初回は iptables/nat で `dockerd` 失敗）のうえ手動で `dockerd` 起動後、`swelancer_x86_monolith:releasev1` の **pull は約 2 分弱で完了**（`docker images` 約 **11.7GB**）。**最低ライン（pull 完了）だけ見れば Pass**。**`bun install` / v2 スモークは未実施のセッションもある**ので、本番相当の確認は **同じ VM で Phase 0 残り（サブモジュール、Bun、1 タスク）**を追試すること。英語の**一行サマリ**は [docs/phase-0-cursor-cloud.md](phase-0-cursor-cloud.md) の *Example verdict*。*Observed behavior* / *Official Cursor docs* も参照。
- **UI と実行コンテキスト:** 「Cursor Agent」「Composer」など**製品名・メニューはプランやクライアント版で異なる**場合がある。**エージェント用シェルとターミナル用シェルで PATH が違う**と、`docker` がある／ないが食い違うので、チェックリストは **ベンチを叩くのと同じ経路**で確認する。
- **打ち切り例:** `no space left on device`、pull 未完了でセッション終了、Docker 不可。

### 1. Codespaces

- **確認:** devcontainer で **Docker** が使えるか（Docker-in-Docker またはソケットマウント等、ポリシー依存）。
- **リスク:** ストレージ（GB-month）とコンピュート時間の超過。**GitHub の spending limit** を設定。
- **打ち切り例:** 大イメージでストレージ超過が解消できない、長時間ジョブが中断される。

### 2. GCP GCE

- **推奨イメージ:** Ubuntu LTS、**x86_64**、ディスク **100GB 以上**を最初から、メモリ **8GB+**。
- **運用:** 作業後は **VM 停止または削除**でコスト抑制（ディスク残すと課金継続）。
- **打ち切り例:** 組織ポリシー・課金設定が重い、同条件で Hetzner の方が安い／早いと判断。

### 3. Hetzner Cloud

- **推奨:** CPX 系で **RAM 8GB 前後・ディスク十分**なプラン、必要なら **ボリューム追加**。
- **後続:** Terraform / `hcloud` での **起動・破棄の自動化**を検討しやすい。
- **打ち切り例:** アカウント・地域・決済の都合、または exe.dev の方が運用要件に合う。

### 4. exe.dev

- **前提:** 基本 **25GB 共有**では v2 が厳しい可能性が高い → **ディスク増設**（サポート依頼・従量）を計画に含める。
- **向き:** 永続的な「常駐サンドボックス」に寄せる場合。

## アウトオブスコープ（このプランでは固定しない）

- v2 の評価結果の集計や CI 本番化。
- 複数タスクのフルバッチ運用。

## 成果物（任意）

試行が終わった時点で、**どの順で止まったか・スペック・月額の体感**を 1 ページメモに残すと、チーム共有に便利。
