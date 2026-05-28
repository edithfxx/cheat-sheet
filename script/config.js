
const STORAGE_KEY = "cheatsheet_v1_cards";
const STORAGE_META_KEY = "cheatsheet_v1_meta";

// 主分類（順序維持原規劃，可自行增減）
const CATEGORIES = [
    "HTML",
    "CSS",
    "CSS應用題",
    "JavaScript",
    "Vue3",
    "工具",
    "觀念",
    "操作說明",
];

// 唯一資料來源：從畫面「匯出 JSON」後，把檔案改名覆蓋成 data.json 放進 data/update/
// 載入優先序：localStorage > update/data.json（找不到就顯示提示）
const UPDATE_FILE = "./data/update/data.json";
