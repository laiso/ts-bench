承知いたしました。
`Agent+Model`の組み合わせで実行された成果物を、GitHub Actionsの引数によるオプトイン形式で`exercism-typescript`サブモジュールリポジトリのブランチにPushし、そのCompare URLをGHAサマリーに表示する機能の設計書を作成します。

-----

## **設計書：Agent成果物のインタラクティブな比較機能**

### 1\. 背景

`ts-bench`プロジェクトは、AIコーディングエージェントのパフォーマンスを定量的（成功率や実行時間）に評価することに成功している。しかし、ユーザーからは「どのエージェントが、どのような思考で、どのようなコードを生成したのか」という定性的な比較を行いたいという要望が寄せられている (GitHub Issue \#17)。

現状では、生成されたコードの差分（diff）がログとしてArtifactsに保存されるものの、Web UI上で直感的にコード全体を比較するのは困難である。この課題を解決し、ベンチマークの透明性と有用性をさらに高めるための新機能として、成果物のインタラクティブな閲覧・比較機能を設計する。

### 2\. 設計目標

本機能は、以下の目標を達成するものとする。

  * **優れた比較体験**: GitHubの強力な比較UI（Compare View）を活用し、複数ファイルにまたがる変更やコードの差分を直感的かつ容易に比較できるようにする。
  * **透明性と追跡可能性**: どのベンチマーク実行（Run）がどのコード変更を生成したのかを、GHAの実行サマリーからワンクリックで追跡可能にする。
  * **リポジトリの軽量性**: `ts-bench`本体のリポジトリに生成されたコードを含めず、軽量性を維持する。
  * **既存構成の活用**: 新規リポジトリを作成せず、既存の`exercism-typescript`サブモジュールを成果物の保存先として活用する。
  * **柔軟な運用**: 成果物のPushはデフォルトでは行わず、必要な場合のみユーザーが選択できるオプトイン方式とする。

### 3\. 設計仕様

#### 3.1. ワークフローの変更 (`.github/workflows/benchmark.yml`)

`workflow_dispatch`の入力として、新たに真偽値型の`push_results`を追加する。

```yaml
# .github/workflows/benchmark.yml

on:
  workflow_dispatch:
    inputs:
      # ... (既存の引数)
      push_results:
        description: 'trueに設定すると、成功した解答をexercism-typescriptリポジトリの新規ブランチにPushします'
        required: false
        default: false
        type: boolean
```

#### 3.2. 成果物Pushの実行プロセス

`benchmark.yml`ワークフローのジョブの最後に、`if: github.event.inputs.push_results == 'true'`という条件で実行されるステップを追加する。このステップは以下の処理を行う。

1.  **成果物の収集**: ベンチマーク実行中に、`overallSuccess: true`となった課題の解答コード一式を、一時的なディレクトリにコピーしておく。
2.  **ブランチの作成とコミット**:
      * `exercism-typescript`サブモジュールディレクトリ内で、新しいブランチを作成する。
      * **ブランチ命名規則**: `results/<agent>-<model>/<run_id>`
          * 例: `results/aider-gpt-4o/17371119174`
      * 収集した成果物（解答コード）をコミットする。
      * **コミットメッセージ**: `feat(results): Add solutions from <agent>/<model> (Run <run_id>)`
3.  **リモートリポジトリへのPush**:
      * 作成したブランチを`laiso/exercism-typescript`リポジトリにPushする。
      * **認証**: `GITHUB_TOKEN`はカレントリポジトリへの書き込み権限しか持たないため、サブモジュールリポジトリへのPushには、リポジトリ設定で払い出した\*\*Personal Access Token (PAT)\*\*をSecretとして利用する。

#### 3.3. 実行サマリーへのリンク追加

ワークフローの`Write Job Summary`ステップを拡張し、`push_results`が`true`の場合に、生成されたブランチと`main`ブランチとの**Compare URL**をサマリーに表示する。

```markdown
### 成果物の比較

生成されたコードの差分は、以下のリンクから確認できます。

- **[Compare Changes](https://github.com/laiso/exercism-typescript/compare/main...results/aider-gpt-4o/17371119174)**
```

### 4\. ブランチ管理戦略

成果物ブランチの無秩序な増加を防ぐため、以下の管理方針を推奨する。

  * **命名規則の徹底**: 前述の命名規則により、どの実行に紐づくブランチかを明確にする。
  * **定期的なクリーンアップ**: 90日以上更新のない`results/`プレフィックスを持つブランチを自動的に削除する、別のGitHub Actionsワークフロー (`.github/workflows/cleanup-branches.yml`) を週次などで実行する。

### 5\. 代替案の検討

  * **成果物専用リポジトリ**: 完全に分離できるが、リポジトリ管理の手間が増える。`exercism-typescript`に直接関連する成果物であるため、サブモジュールを活用する方がコンテキストとして自然である。
  * **プルリクエスト形式**: 比較UIは優れているが、実行ごとにPRが生成されるとノイズが多くなり、管理が煩雑になるため見送った。

本設計は、これらの代替案の利点を組み合わせつつ、欠点を補うバランスの取れたアプローチである。