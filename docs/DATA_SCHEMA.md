# 資料模型 / Data Schema

本文件定義速查表的卡片資料結構、5 種型別的多型 `content` 契約，以及匯入時的驗證規則。

實作位置：`script/app.js`（讀寫與驗證）、`script/config.js`（分類與儲存鍵）。

---

## 1. 頂層結構

匯出檔與 `data/update/data.json` 使用同一個結構（產生於 `script/app.js:396`）：

```json
{
  "version": "1.0",
  "exportedAt": "2026-07-04T09:23:11.000Z",
  "cards": [ /* 卡片陣列 */ ]
}
```

| 欄位 | 型別 | 說明 |
|---|---|---|
| `version` | `string` | 目前固定 `"1.0"`。保留欄位，為日後 schema 遷移預留 |
| `exportedAt` | `string` (ISO 8601) | 匯出當下時間，僅供人工辨識，程式不讀 |
| `cards` | `Card[]` | 全部卡片。匯入時**只驗證這個欄位** |

---

## 2. 卡片共通欄位

```json
{
  "id": "8be91ca1-56a3-4026-9504-673a0f609126",
  "category": "工具",
  "subcategory": "Git",
  "title": "刪除最後一次的 commit，並請更新至遠端",
  "type": "lines",
  "tags": ["Git"],
  "previewRows": 5,
  "language": "none",
  "content": ["git reset HEAD^", "git push --force"],
  "pinned": false,
  "useCount": 0,
  "createdAt": "2026-06-11T03:04:00.000Z",
  "updatedAt": "2026-07-04T09:20:00.000Z"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `id` | `string` | ✅ | UUID v4。由 `generateUUID()` 產生（`script/app.js:643`） |
| `category` | `string` | ✅ | 必須是 `CATEGORIES` 的成員，否則卡片不會出現在任何分類頁 |
| `subcategory` | `string` | — | 空字串代表無子分類。子分類清單由現有卡片動態推導，非預先定義 |
| `title` | `string` | ✅ | 顯示名稱。儲存時會 `trim()`（`script/app.js:590`） |
| `type` | `string` | ✅ | `code` / `lines` / `table` / `sections` / `note` 五選一 |
| `tags` | `string[]` | — | 參與搜尋比對。重複標籤在輸入時就被擋掉（`script/app.js:618`） |
| `previewRows` | `number` | — | 列表預覽顯示的行數，預設 `5` |
| `language` | `string` | — | `html`/`js`/`css`/`bash`/`json`/`none`。**目前僅為 metadata，不影響顯示**（語法高亮已於 2026-05-28 移除） |
| `content` | 多型 | ✅ | 結構依 `type` 而異，見下節 |
| `pinned` | `boolean` | — | 保留欄位，目前 UI 未使用 |
| `useCount` | `number` | — | 保留欄位，目前不會遞增 |
| `createdAt` | `string` | — | ISO 8601，新增時寫入 |
| `updatedAt` | `string` | — | ISO 8601，每次儲存編輯時更新（`script/app.js:591`） |

> **設計取捨**：`pinned` 與 `useCount` 是為「常用置頂」「使用頻率排序」預留的欄位，功能尚未實作。保留欄位而非移除，是為了讓既有匯出檔在未來啟用該功能時不需要遷移。

---

## 3. `content` 的多型結構

這是整個資料模型的核心：**一個 `type` 欄位決定 `content` 的形狀與 UI 行為**。新增型別時，`setEditType()`（`script/app.js:566`）必須同步提供對應的空白初始值。

### `code` — 單段程式碼

```json
{ "type": "code", "content": "const app = createApp({})\napp.mount('#app')" }
```

- `content` 為含換行的字串
- UI：右上角 1 顆複製按鈕，複製**完整內容**（非預覽的前 N 行）
- 列表預覽由 `previewCode()` 截斷（`script/app.js:297`）

### `lines` — 逐行指令

```json
{ "type": "lines", "content": ["npm install", "npm run dev"] }
```

- `content` 為字串陣列，**每行右側有獨立複製按鈕**
- 設計動機：終端機指令通常一次只複製一行
- 整段複製時以 `\n` 串接（`getFullContent()`，`script/app.js:305`）

### `table` — 雙欄對照表

```json
{ "type": "table", "content": [{ "key": "<div>", "desc": "區塊容器" }] }
```

- 每列右側複製按鈕，**複製的是 `key` 而非整列**
- **刻意不提供「整體複製」按鈕**：對照表逐列複製才有意義
- `getFullContent()` 對 `table` 回傳空字串，這是刻意的

### `sections` — 多區塊摺疊

```json
{ "type": "sections", "content": [{ "title": "選項 A", "content": "..." }] }
```

- 每個區塊可獨立摺疊與複製
- 開啟 Modal 時**全部預設摺疊**（`openModal()`，`script/app.js:277`）
- 整段複製時，各區塊標題會轉成 `// 標題` 註解行（`script/app.js:308`）

### `note` — 純觀念筆記

```json
{ "type": "note", "content": { "points": ["vw/vh ≠ %"], "warning": "margin 會重疊" } }
```

- `content` 是物件，不是陣列——**5 種型別中唯一的物件形狀**
- **完全沒有複製按鈕**：觀念複製沒有意義，只有編輯／刪除
- `warning` 為空時應直接從 JSON 移除該欄位，不保留空字串
- UI：左側 3px 橘色直條邊框

---

## 4. 匯入驗證規則

匯入檔案時的驗證發生在 `onFileSelected()`（`script/app.js:430`）：

1. `JSON.parse()` 失敗 → toast 顯示解析錯誤
2. `data.cards` 不是陣列 → 拋出「檔案結構不正確，缺少 cards 陣列」
3. 逐張檢查必要欄位 `id` / `title` / `type` / `category`，缺任一項即中止並**指出是第幾張卡**（`script/app.js:441`）

```js
if (!c.id || !c.title || !c.type || !c.category) {
  throw new Error(`第 ${i + 1} 張卡片缺少必要欄位 (id/title/type/category)`);
}
```

> **已知限制**：驗證只檢查必要欄位是否存在，**不檢查 `content` 的形狀是否符合 `type`**。若手動編輯 JSON 時把 `type: "note"` 配上陣列 `content`，匯入會通過但渲染會出錯。這是為了讓驗證邏輯保持精簡而接受的取捨——實務上 `content` 都由 UI 表單產生，不會出現形狀錯誤。

---

## 5. 匯入衝突處理

以 `id` 判斷重複（`processImport()`，`script/app.js:457`）。若無重複則直接附加；有重複則要求使用者選擇策略：

| 策略 | 行為 | 實作 |
|---|---|---|
| `overwrite` | 移除本機同 id 卡片，改用匯入版本 | `script/app.js:490` |
| `skip` | 保留本機版本，只加入新卡 | `script/app.js:495` |
| `asNew` | 重新產生 UUID，標題加註「(匯入)」後併存 | `script/app.js:498` |

三種策略都會產出一份 `{ added, overwritten, skipped }` 報告（`showImportReport()`，`script/app.js:515`）。詳細設計理由見 [`DECISIONS.md`](DECISIONS.md) 決策 6。

---

## 6. localStorage 鍵

定義於 `script/config.js`：

| Key | 內容 |
|---|---|
| `cheatsheet_v1_cards` | 全部卡片陣列（`JSON.stringify`） |
| `cheatsheet_v1_meta` | `{ lastSavedAt: "YYYY-MM-DD HH:mm" }` |

鍵名含 `v1`，是為了日後 schema 變更時可用新鍵名並行，避免破壞既有使用者的資料。
