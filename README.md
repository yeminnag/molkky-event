# もルック ダッシュボード

モルック大会用のスコア管理ダッシュボード。過去の試合はローカルの SQLite
(`data/matches.db`) に保存されます。

## 起動

```bash
npm start
```

→ ブラウザで http://127.0.0.1:3000 を開きます。

インストール作業（`npm install`）は不要です。SQLite は Node 本体の
`node:sqlite` を使うため、外部パッケージは一切ありません。Node 22.5 以上が必要です。

ポートを変えたい場合は `PORT=4000 npm start`、DB の場所を変えたい場合は
`MOLKKY_DB=/path/to/matches.db npm start`。

## データの保存場所

| データ | 保存先 | 理由 |
| --- | --- | --- |
| 過去の試合 | `data/matches.db`（SQLite） | 長期保存・バックアップ・集計のため |
| 進行中の試合 | localStorage | 1投ごとに更新され、リロードしても復元する必要があるため |

`data/` は `.gitignore` 済みです。**バックアップは `data/` フォルダごとコピー**
してください（サーバー稼働中は `matches.db-wal` に未反映の書き込みが残るため、
サーバーを停止してからコピーすると `matches.db` 単体で完結します）。

### 以前のデータについて

localStorage に残っている過去の試合は、**初回起動時に自動で DB へ移行**されます。
移行は一度きりで、`molkky-event-db-migrated` フラグで管理されます。

### サーバーが起動していない場合

`index.html` をファイルとして直接開いた場合や、サーバーが落ちている場合でも
ダッシュボードは動作します。その間の過去試合は localStorage にのみ保存され、
DB には入りません（コンソールに警告が出ます）。

## スキーマ

試合は 4 テーブルに正規化して保存されます。JSON の塊ではないので、
ラウンドや選手を SQL で直接集計できます。

```
matches       試合（開始/終了時刻・状態・勝者名）
match_teams   試合ごとのチーム（得点・勝敗・失格）
match_players チームごとの選手
match_rounds  チームごとの各ラウンド終了時の累計得点
```

外部キーは `ON DELETE CASCADE` 付きなので、`matches` の行を消せば関連行も消えます。
スキーマ変更は `server/db.js` の `migrate()` に `user_version` 単位で追加します。

例（選手ごとの勝利数）:

```sql
SELECT p.name, COUNT(*) AS wins
  FROM match_players p
  JOIN match_teams t ON t.id = p.team_id
 WHERE t.winner = 1
 GROUP BY p.name
 ORDER BY wins DESC;
```

## API

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/api/matches?limit=&offset=` | 過去試合の一覧（新しい順） |
| POST | `/api/matches` | 試合を保存 |
| DELETE | `/api/matches/:id` | 試合を 1 件削除 |
| DELETE | `/api/matches` | 全件削除 |
