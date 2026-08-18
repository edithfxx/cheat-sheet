# 速查表專案 / Cheatsheet Project

> **給 Claude Code 的開發脈絡簡報。** 進入此專案請先讀完本文件再動手。

> 本文件最初撰寫於 2026-05-26，其後隨專案演進更新。最近一次校對（2026-08-18）：修正卡片數與分類數、移除已不成立的敘述、結構圖根目錄更名。

---

## 1. 專案概覽 / Project Overview

個人用「程式碼速查表」單頁應用程式。使用者把常用的 code snippet、指令、語法對照表、觀念筆記分類存起來，需要時可以**快速搜尋、複製、編輯**。

- **使用者**：1 人（個人工具，無多人協作需求）
- **使用場景**：寫 code 時遇到「常用但記不住」的東西，3 秒內找到並複製
- **資料量**：本 repo 內附的 `data.json` 共 80 張卡，分佈於 8 個分類
- **不做的事**：不做後端、不做帳號系統、不做雲端同步

---

## 2. 技術棧 / Tech Stack

| 項目 | 選用 | 為什麼 |
|---|---|---|
| 前端框架 | **Vue 3 CDN**（global build） | Live Server 直接跑，免 build、免 npm |
| 樣式 | 純 CSS + CSS variables | 不引入 Tailwind / Bootstrap |
| 資料儲存 | **localStorage** | 個人單機使用，不需要後端 |
| 資料來源 | 單一 JSON 檔 `data/update/data.json` | 使用者從畫面匯出的資料，第一次載入後寫入 localStorage |
| 開發工具 | VSCode + **Live Server** 擴充套件 | 因為用 `fetch()` 讀 JSON，不能 `file://` 雙擊 |

**重要：不要建議改用 React / Vite / Next.js / TypeScript。** 這些都討論過並被刻意排除。理由：使用者偏好「一個資料夾用瀏覽器打開就能跑」，且這是個人工具，不需要工程化。

---

## 3. 檔案結構 / File Structure

```
cheat-sheet/
├─ index.html              # 只剩 HTML template + 三個 <script src>
├─ CLAUDE.md               # 本檔案
├─ README.md               # 給使用者的操作手冊
├─ css/
│   └─ style.css           # 全部樣式（從 index.html 抽出，獨立管理）
├─ script/
│   ├─ app.js              # 全部 Vue 邏輯（createApp/setup）
│   └─ config.js           # CATEGORIES、UPDATE_FILE、STORAGE_KEY 等常數
├─ data/
│   └─ update/             # 唯一資料來源
│       └─ data.json       # 使用者從畫面匯出、改名放入的資料檔
└─ docs/                   # 開發與決策紀錄（見第 13 段）
```

**`data/default/` 種子資料夾已移除**（2026-05-28）。資料來源只剩 `data/update/data.json`，由使用者從畫面匯出後改名放入。新增分類只要改 `script/config.js` 的 `CATEGORIES` 陣列。

**`script/todo.js` 已移除**（原為開發草稿筆記）。

---

## 4. 卡片資料結構 / Card Schema

每張卡片是一個物件，**5 種 type**，`content` 結構依 type 不同：

```json
{
  "id": "UUID v4",
  "category": "見 script/config.js 的 CATEGORIES",
  "subcategory": "字串",
  "title": "顯示名稱",
  "type": "code | lines | table | sections | note",
  "tags": ["陣列"],
  "previewRows": 5,
  "language": "html | js | css | bash | json | none",
  "content": "依 type 不同（見下）",
  "pinned": false,
  "useCount": 0,
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### content 結構

| type | content 結構 | UI 行為 |
|---|---|---|
| `code` | 字串（含 `\n`） | 一段程式碼，右上 1 顆複製按鈕 |
| `lines` | `["行1", "行2", ...]` 字串陣列 | 終端機指令類，每行右側獨立複製按鈕 |
| `table` | `[{ "key": "...", "desc": "..." }, ...]` | 兩欄對照表，每列右側複製按鈕（複製 key） |
| `sections` | `[{ "title": "...", "content": "..." }, ...]` | 多區塊摺疊卡，每區塊獨立複製 |
| `note` | `{ "points": ["..."], "warning": "（可選）" }` | 純觀念筆記，**無複製按鈕** |

**特殊規則**：
- `note` type **沒有複製按鈕**（觀念複製沒意義，只有編輯/刪除）
- `table` type **標題列沒有「整體複製」按鈕**（table 是逐列複製才有意義）
- `note` 的 `warning` 欄位為空時**不要保留欄位**，直接從 JSON 移除（節省空間）
- `tag` 為 `"todo"` 的卡片表示「PDF 原稿未明、待補」

完整版見 [`docs/DATA_SCHEMA.md`](docs/DATA_SCHEMA.md)。

---

## 5. localStorage / Storage

- **Key**: `cheatsheet_v1_cards`（全部卡片陣列）
- **Key**: `cheatsheet_v1_meta`（最後存檔時間等 metadata）
- **載入優先序**（`loadFromJson()`，`script/app.js:42`）：
  1. 開啟頁面 → 檢查 localStorage，有資料就直接用（**localStorage 為準**）
  2. 沒 localStorage → fetch `data/update/data.json`，有就用它並寫入 localStorage
  3. 連 `data.json` 都找不到 → 顯示友善錯誤（提示去匯出並放入 data.json）；**沒有種子 fallback 了**
- **變更時機**：任何卡片變更（新增 / 編輯 / 刪除）→ Vue `watch(allCards, ...)` 自動寫回 localStorage（`script/app.js:109`）

**換電腦工作流程**：在畫面「匯出 JSON」→ 把下載的檔案改名覆蓋成 `data.json` 放進 `data/update/` → 換電腦時新機器 localStorage 為空，會自動讀這個檔，免手動匯入。同一台用過的電腦要強制重讀，按設定的「重置為 data.json」。

**注意：localStorage 是「工作副本/資料權威」，JSON 檔只是種子來源**。使用者新增/編輯的卡片不會自動回寫任何 JSON 檔（要手動匯出）。`UPDATE_FILE` 常數定義在 `script/config.js`。

---

## 6. UI 設計規格 / UI Spec

### 視覺風格
- **米色系**（`var(--bg)` = `#f5f1e8`）+ 圓角卡片 + 等寬字
- **5 種類型用顏色標籤辨識**：
  - `code` = 紫色 `--purple`
  - `lines` = 綠色 `--teal`
  - `table` = 藍色 `--blue`
  - `sections` = 琥珀色 `--amber`
  - `note` = 琥珀色 + **左側 3px 橘色直條邊框**

### 版面
- **桌面：4 欄並排**（`grid-template-columns: repeat(4, ...)`）
- **小於 980px：3 欄**，720px：2 欄，480px：1 欄（斷點見 `css/style.css:294`、`:300`、`:306`）
- 卡片預覽**只顯示前 N 行**（依 `previewRows`），點擊開 Modal 看完整
- 列表狀態的複製按鈕**永遠複製完整內容**（不是預覽的前 N 行）

### 主要互動元件
- 頂部：搜尋框（Ctrl+K focus）+ 新增按鈕 + 設定齒輪
- 主分類膠囊列（清單見 `script/config.js`）
- 子分類：**右下角圓形浮動按鈕**（FAB），點開 Modal 列出當前主分類的子分類
- 當前過濾的子分類：顯示為深色「× 子分類名」膠囊在主分類列右側
- 卡片點擊 → 開 **Modal 詳情**（不是原地展開）
- 鍵盤：Ctrl+K 搜尋、Esc 關閉 Modal（`script/app.js:135`）

### 跨分類搜尋
- 搜尋框有關鍵字時 → **無視當前主分類**，搜尋全部卡片（`filteredCards`，`script/app.js:258`）
- 主分類列被**搜尋提示條**取代
- 卡片標題列額外顯示**灰色「來源分類」標籤**

---

## 7. 已完成 / 待開發 / Progress

### ✅ 已完成

- 載入機制（localStorage → `data/update/data.json`）
- 5 種卡片類型完整渲染（列表 + Modal）
- 主分類切換 + 子分類過濾
- 卡片內容複製（整段 / 逐行 / 逐列 / 區塊）
- 搜尋（即時 filter + 關鍵字黃色高亮 + Ctrl+K 快捷鍵）
- **跨分類搜尋**（搜尋時無視主分類，顯示全部命中 + 來源標籤）
- localStorage 自動儲存
- 刪除卡片（含確認對話框）
- 匯入 / 匯出 JSON（含衝突處理：覆蓋 / 跳過 / 視為新卡）
- 匯入後的詳細報告 Modal
- 設定 Modal：匯出 / 匯入 / 重置 JSON / 清除全部
- 鍵盤快捷鍵（Ctrl+K, Esc）
- 載入失敗的友善提示（提醒用 Live Server）
- **編輯卡片 + 新增卡片**（共用同一個編輯 Modal）
  - 共通欄位：標題、主分類、子分類（下拉可新增）、tags（膠囊式輸入）、previewRows、language
  - 5 種類型各有對應的 content 編輯區
  - 編輯時類型鎖死（只顯示，不可改）；新增時先選類型
  - 儲存時更新 `updatedAt`；關閉前若有填寫內容會跳確認
  - 點「儲存」/「新增」才寫入 localStorage（非即時儲存）

---

## 8. 關鍵設計決策 / Key Decisions

這些決策都經過反覆討論，**沒有強理由不要動**。完整脈絡與代價分析見 [`docs/DECISIONS.md`](docs/DECISIONS.md)。

1. **Vue 3 CDN 而非 Vue 專案模式** — 為了免 build。SFC、`<script setup>` 都不能用。
2. **5 種卡片類型** — 不要再合併或拆分。`note` 沒複製按鈕是刻意設計。
3. **localStorage 為準** — `data.json` 只是來源，不會被自動回寫。重置才會重讀。
4. **4 欄並排 + 預覽前 N 行 + Modal 看詳情** — 不要改成 3 欄或原地展開。
5. **資料單一檔 `data/update/data.json`** — 種子分檔（`data/default/`）已於 2026-05-28 移除。
6. **UUID 當 id** — 不用流水號（匯入時衝突難處理）。
7. **`todo` 標籤** — PDF 原稿未明的地方標 `todo`，方便日後搜尋補完。
8. **主分類順序固定** — 順序以 `script/config.js` 的 `CATEGORIES` 為準，不要重排。
9. **不要產生創意功能** — 不要建議加「夜間模式」「分享連結」「PWA」「離線同步」等沒討論過的功能。需要時使用者會明說。

---

## 9. 開發注意事項 / Dev Notes

### 檔案分工
- `index.html`：只剩 HTML template + 三個 `<script src>`（vue CDN → config.js → app.js）
- `script/app.js`：**全部 Vue 邏輯**（createApp/setup），710 行
- `script/config.js`：常數（CATEGORIES、UPDATE_FILE、STORAGE_KEY…）
- `css/style.css`：全部樣式，1479 行
- **載入順序固定**：`vue.global.prod.js` → `config.js` → `app.js`（app.js 用到全域 `Vue` 和 config 常數，必須最後載入）。不要改成 `type="module"`。

### 修改時注意
- 改 Vue 邏輯動 `script/app.js`；改樣式動 `css/style.css`；改常數動 `script/config.js`。不要把東西搬回 index.html。
- 修改集中時優先用「告訴使用者改哪幾段」，不要動其他地方

### 修改 JSON 時
- **不要動 `id`**（會破壞 localStorage 對應）
- 新增卡片 → 用 UUID v4
- 修改現有卡片 → 提醒使用者要不要更新 `updatedAt`

### 樣式變數
- 樣式全在 `css/style.css`，CSS variables 定義在 `:root` 內
- 不要硬編色碼，用 `var(--xxx)` 引用
- 新增變數時放在 `:root` 內並補註解

### 與使用者溝通慣例
- **生成檔案前要先問**（不要主動產 docx / pdf / 大檔案）
- **不會就直說「不會」**，不要編答案
- **動態智商調節**：技術問題用 Pro 模式（直接給解、少廢話、不加免責），閒聊用 Social 模式
- 回答時用 `[Mode: Pro]` 或 `[Mode: Social]` 開頭
- **不要過度道歉、不要過度肯定**，老實話為主

---

## 10. 常見任務範例 / Common Tasks

### 加一張新卡片到資料庫

**首選：直接在 UI 點「新增」按鈕**，透過表單新增，存後記得匯出 → 改名覆蓋 `data/update/data.json`。

若要手動編 JSON：開 `data/update/data.json`，在 `cards` 陣列加新物件（id 用 UUID v4，欄位照 schema），存檔後在畫面點「重置為 data.json」重讀。

### 加一個新主分類

不建議這樣做，但若必須：

1. `script/config.js` 的 `CATEGORIES` 陣列加新分類名稱（保持順序）
2. 新增該分類的卡片（UI 新增或編 `data.json`）
3. 重新整理頁面

### 修改卡片視覺樣式

`css/style.css` 內找對應 class（`.card`、`.card-head`、`.type-tag` 等）修改。注意：
- 卡片類型專屬樣式：`.type-code` / `.type-lines` / `.type-table` / `.type-sections` / `.type-note`
- 改了之後測 5 種類型卡片都正常顯示

---

## 11. 已知問題 / Known Issues

- **已移除語法高亮**（2026-05-28）：原本的 regex 高亮會把含 `<`、`"`、`/* */` 的 code（SQL/IIS/Linux 等雜語法）插壞顯示，已整個拿掉，code 一律顯示跳脫後的純文字。`language` 欄位保留為 metadata 但目前不影響顯示。搜尋關鍵字高亮（`highlightText` + `mark.hl-search`）不受影響。
- **localStorage 容量上限 ~5MB**，估算可存 1000+ 張卡。超過會在 `saveToStorage()` 內 toast 提示
- **下載匯出檔在某些 Safari 舊版本可能失敗**（用 Blob URL），目前沒處理
- 其餘已知問題統一維護於 [`docs/DECISIONS.md`](docs/DECISIONS.md) 的 Open Issues，不在此重複。

---

## 12. 接手指引 / Onboarding

新對話開始時，使用者可能會說：

- 「我刪了一張卡，怎麼救回來」→ 用設定的「重置為 data.json」（會丟失其他變更）或從匯出備份檔匯入
- 「載入失敗 / 雙擊不能跑」→ 提醒用 Live Server
- 「我想加一個新分類」→ 看第 10 段步驟，但先勸阻（決策 8）

**先讀本文件再回答，不要假設**。如本文件未涵蓋使用者的問題，**直接問使用者**，不要編。

---

## 13. 文件索引 / Docs

| 文件 | 內容 |
|---|---|
| [`README.md`](README.md) | 給使用者的安裝與操作手冊 |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | 架構決策紀錄（ADR）：決策、選項、理由、代價 |
| [`docs/DATA_SCHEMA.md`](docs/DATA_SCHEMA.md) | 卡片資料模型與匯入驗證規則 |
| [`docs/AI_COLLABORATION.md`](docs/AI_COLLABORATION.md) | AI 協作開發流程：規格先行、規劃、驗收、否決紀錄 |
