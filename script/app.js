const { createApp, ref, computed, onMounted, watch } = Vue;
createApp({
  setup() {
    const loading = ref(true);
    const loadingMsg = ref("正在讀取資料");
    const loadError = ref(null);
    const allCards = ref([]);
    const activeCategory = ref("HTML");
    const activeCard = ref(null);
    const activeSubcategory = ref(null);
    const showSubModal = ref(false);
    const showSettings = ref(false);
    const deletingCard = ref(null);
    const copiedId = ref(null);
    const collapsedSections = ref({});
    const searchKeyword = ref("");
    const searchInput = ref(null);
    const toastMsg = ref("");
    const lastSavedAt = ref("—");
    const fileInput = ref(null);
    const importConflict = ref(null);
    const conflictChoice = ref(null);
    const importReport = ref(null);
    const reportCollapsed = ref({
      added: false,
      overwritten: false,
      skipped: true,
    });
    let pendingImport = null;

    // 自上次「匯出 JSON」後是否有未匯出的變更（localStorage 仍會自動存，這只用來提醒匯出備份）
    const hasUnexportedChanges = ref(false);

    // 編輯 / 新增卡片
    const editingCard = ref(false);
    const editDraft = ref(null);
    const editIsNew = ref(false);
    const newTagInput = ref('');
    const editSubNew = ref(false);
    const editNewSubInput = ref('');

    async function loadFromJson(forceReload = false) {
      if (location.protocol === "file:") {
        loadError.value =
          "請用 Live Server 開啟（VSCode 擴充套件），不能直接雙擊。";
        loading.value = false;
        return;
      }

      if (!forceReload) {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          try {
            allCards.value = JSON.parse(cached);
            const meta = JSON.parse(
              localStorage.getItem(STORAGE_META_KEY) || "{}",
            );
            lastSavedAt.value = meta.lastSavedAt || "—";
            loading.value = false;
            return;
          } catch (e) {
            console.warn("localStorage 解析失敗，改從 JSON 載入");
          }
        }
      }

      try {
        // 唯一資料來源：使用者匯出的 update/data.json
        loadingMsg.value = "正在讀取 data/update/data.json...";
        const updateData = await fetch(UPDATE_FILE)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        if (updateData && Array.isArray(updateData.cards)) {
          allCards.value = updateData.cards;
          saveToStorage();
          loading.value = false;
          return;
        }

        // 找不到 data.json → 沒有資料來源
        loadError.value =
          "找不到 data/update/data.json。請從畫面「匯出 JSON」，把檔案改名成 data.json 放進 data/update/ 後重新整理。";
        loading.value = false;
      } catch (e) {
        console.error("資料載入失敗", e);
        loadError.value = "載入失敗：" + e.message;
        loading.value = false;
      }
    }

    function saveToStorage() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allCards.value));
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        lastSavedAt.value = stamp;
        localStorage.setItem(
          STORAGE_META_KEY,
          JSON.stringify({ lastSavedAt: stamp }),
        );
      } catch (e) {
        console.error("儲存失敗", e);
        toast("儲存失敗，可能超出 localStorage 容量");
      }
    }

    watch(
      allCards,
      () => {
        if (!loading.value) {
          saveToStorage();
          hasUnexportedChanges.value = true;
        }
      },
      { deep: true },
    );

    function handleBeforeUnload(e) {
      if (hasUnexportedChanges.value) {
        // 瀏覽器只會顯示通用提示文字（無法自訂），這裡只負責觸發
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    }

    onMounted(async () => {
      await loadFromJson();
      document.addEventListener("keydown", handleKeydown);
      window.addEventListener("beforeunload", handleBeforeUnload);
    });

    function handleKeydown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (searchInput.value) searchInput.value.focus();
      }
      if (e.key === "Escape") {
        if (importReport.value) importReport.value = null;
        else if (importConflict.value) cancelImport();
        else if (editingCard.value) closeEdit();
        else if (deletingCard.value) deletingCard.value = null;
        else if (showSettings.value) showSettings.value = false;
        else if (showSubModal.value) showSubModal.value = false;
        else if (activeCard.value) activeCard.value = null;
      }
    }

    function matchKeyword(card, kw) {
      const k = kw.toLowerCase();
      if (card.title && card.title.toLowerCase().includes(k)) return true;
      if (card.tags && card.tags.some((t) => t.toLowerCase().includes(k)))
        return true;
      if (card.type === "code" && card.content.toLowerCase().includes(k))
        return true;
      if (
        card.type === "lines" &&
        card.content.some((l) => l.toLowerCase().includes(k))
      )
        return true;
      if (
        card.type === "table" &&
        card.content.some(
          (r) =>
            (r.key && r.key.toLowerCase().includes(k)) ||
            (r.desc && r.desc.toLowerCase().includes(k)),
        )
      )
        return true;
      if (
        card.type === "sections" &&
        card.content.some(
          (s) =>
            (s.title && s.title.toLowerCase().includes(k)) ||
            (s.content && s.content.toLowerCase().includes(k)),
        )
      )
        return true;
      if (card.type === "note") {
        if (
          card.content.points &&
          card.content.points.some((p) => p.toLowerCase().includes(k))
        )
          return true;
        if (
          card.content.warning &&
          card.content.warning.toLowerCase().includes(k)
        )
          return true;
      }
      return false;
    }

    function escapeHtml(s) {
      if (typeof s !== "string") return s;
      return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
    function escapeRegex(s) {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function highlightText(text) {
      if (!text) return "";
      const escaped = escapeHtml(text);
      const kw = searchKeyword.value.trim();
      if (!kw) return escaped;
      const re = new RegExp(
        "(" + escapeRegex(escapeHtml(kw)) + ")",
        "gi",
      );
      return escaped.replace(re, '<mark class="hl-search">$1</mark>');
    }

    // 每個分類的卡片數
    const cardCounts = computed(() => {
      const counts = {};
      CATEGORIES.forEach((c) => (counts[c] = 0));
      allCards.value.forEach((c) => {
        if (counts[c.category] !== undefined) counts[c.category]++;
      });
      return counts;
    });

    // 當前主分類的所有卡片
    const activeCategoryCards = computed(() => {
      return allCards.value.filter(
        (c) => c.category === activeCategory.value,
      );
    });

    // 當前主分類的卡片數
    const activeCategoryRealCount = computed(() => {
      return activeCategoryCards.value.length;
    });

    // 當前主分類的子分類清單
    const subcategories = computed(() => {
      const map = {};
      activeCategoryCards.value.forEach((c) => {
        map[c.subcategory] = (map[c.subcategory] || 0) + 1;
      });
      return Object.entries(map).map(([name, count]) => ({
        name,
        count,
      }));
    });

    // 最終顯示的卡片（過濾 + 搜尋）
    // 是否正在搜尋（有關鍵字 = 進入跨分類模式）
    const isSearching = computed(() => searchKeyword.value.trim().length > 0);

    // 最終顯示的卡片（過濾 + 搜尋）
    const filteredCards = computed(() => {
      const kw = searchKeyword.value.trim();
      if (kw) {
        // 搜尋模式：跨全部分類搜尋（不受 activeCategory / activeSubcategory 影響）
        return allCards.value.filter(c => matchKeyword(c, kw));
      }
      // 正常模式：依當前主分類 + 子分類過濾
      let list = activeCategoryCards.value;
      if (activeSubcategory.value) {
        list = list.filter(c => c.subcategory === activeSubcategory.value);
      }
      return list;
    });

    function selectCategory(cat) {
      activeCategory.value = cat;
      activeSubcategory.value = null; // 切主分類時自動清子分類（決策 4）
    }

    function openModal(card) {
      activeCard.value = card;
      collapsedSections.value = {};
      if (card.type === "sections") {
        card.content.forEach((_, idx) => {
          collapsedSections.value[idx] = true;
        });
      }
    }
    function selectSub(name) {
      activeSubcategory.value = name;
      showSubModal.value = false;
    }
    function toggleSection(idx) {
      collapsedSections.value[idx] = !collapsedSections.value[idx];
    }
    function isCollapsed(idx) {
      return !!collapsedSections.value[idx];
    }

    function previewCode(card) {
      const lines = card.content.split("\n").slice(0, card.previewRows);
      return escapeHtml(lines.join("\n"));
    }
    function codeLineCount(card) {
      return card.content.split("\n").length;
    }

    function getFullContent(card) {
      if (card.type === "code") return card.content;
      if (card.type === "lines") return card.content.join("\n");
      if (card.type === "sections")
        return card.content
          .map((s) => "// " + s.title + "\n" + s.content)
          .join("\n\n");
      return "";
    }
    async function copyAll(card, suffix = "all") {
      await doCopy(getFullContent(card), card.id + "-" + suffix);
    }
    async function copyLine(card, text, suffix) {
      await doCopy(text, card.id + "-" + suffix);
    }

    async function doCopy(text, id) {
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      copiedId.value = id;
      setTimeout(() => {
        if (copiedId.value === id) copiedId.value = null;
      }, 1200);
    }

    function confirmDelete(card) {
      deletingCard.value = card;
    }
    function doDelete() {
      const id = deletingCard.value.id;
      allCards.value = allCards.value.filter((c) => c.id !== id);
      if (activeCard.value && activeCard.value.id === id)
        activeCard.value = null;
      deletingCard.value = null;
      toast("已刪除");
    }

    function confirmReset() {
      if (
        confirm(
          "確定要重置為 data.json 嗎？\n\n你新增/刪除的所有變更都會消失。",
        )
      ) {
        showSettings.value = false;
        loading.value = true;
        loadingMsg.value = "重新載入資料...";
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_META_KEY);
        loadFromJson(true).then(() => toast("已重置為 data.json"));
      }
    }
    function confirmClearAll() {
      if (
        confirm(
          "確定要清除全部資料嗎？\n\n所有卡片都會消失（重整後會從 JSON 重新載入）。",
        )
      ) {
        allCards.value = [];
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_META_KEY);
        showSettings.value = false;
        toast("已清空");
      }
    }

    let toastTimer = null;
    function toast(msg, duration = 1500) {
      toastMsg.value = msg;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toastMsg.value = "";
      }, duration);
    }

    function doExport() {
      const realCards = allCards.value;
      if (realCards.length === 0) {
        toast("沒有可匯出的卡片");
        return;
      }
      const now = new Date();
      // 直接下載成 data.json，使用者拖進 data/update/ 覆蓋即更新資料來源
      const filename = "data.json";
      const payload = {
        version: "1.0",
        exportedAt: now.toISOString(),
        cards: realCards,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      hasUnexportedChanges.value = false;
      showSettings.value = false;
      toast(`已下載 data.json（${realCards.length} 張）`);
    }

    function triggerImport() {
      const realCount = allCards.value.length;
      if (realCount > 0) {
        if (
          !confirm(
            `你目前有 ${realCount} 張卡片，建議先匯出備份再進行匯入。\n\n是否繼續匯入？`,
          )
        )
          return;
      }
      if (fileInput.value) fileInput.value.click();
    }

    function onFileSelected(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data || !Array.isArray(data.cards))
            throw new Error("檔案結構不正確，缺少 cards 陣列");
          for (let i = 0; i < data.cards.length; i++) {
            const c = data.cards[i];
            if (!c.id || !c.title || !c.type || !c.category) {
              throw new Error(
                `第 ${i + 1} 張卡片缺少必要欄位 (id/title/type/category)`,
              );
            }
          }
          processImport(data.cards);
        } catch (err) {
          toast("檔案格式不正確：" + err.message, 3000);
        }
      };
      reader.onerror = () => toast("檔案讀取失敗", 2500);
      reader.readAsText(file);
      e.target.value = "";
    }

    function processImport(incomingCards) {
      const existingIds = new Set(allCards.value.map((c) => c.id));
      const duplicates = incomingCards.filter((c) =>
        existingIds.has(c.id),
      );
      const newOnes = incomingCards.filter((c) => !existingIds.has(c.id));
      if (duplicates.length === 0) {
        allCards.value = [...allCards.value, ...newOnes];
        showImportReport(newOnes, [], []);
        showSettings.value = false;
        return;
      }
      pendingImport = { incomingCards, duplicates, newOnes };
      importConflict.value = {
        totalIn: incomingCards.length,
        duplicates,
      };
      conflictChoice.value = null;
    }

    function cancelImport() {
      importConflict.value = null;
      conflictChoice.value = null;
      pendingImport = null;
    }

    function applyImport() {
      if (!conflictChoice.value || !pendingImport) return;
      const { duplicates, newOnes } = pendingImport;
      let added = [...newOnes];
      let overwritten = [];
      let skipped = [];

      if (conflictChoice.value === "overwrite") {
        const dupIds = new Set(duplicates.map((c) => c.id));
        allCards.value = allCards.value.filter((c) => !dupIds.has(c.id));
        allCards.value = [...allCards.value, ...newOnes, ...duplicates];
        overwritten = duplicates;
      } else if (conflictChoice.value === "skip") {
        allCards.value = [...allCards.value, ...newOnes];
        skipped = duplicates;
      } else if (conflictChoice.value === "asNew") {
        const renamed = duplicates.map((c) => ({
          ...c,
          id: generateUUID(),
          title: c.title + " (匯入)",
        }));
        allCards.value = [...allCards.value, ...newOnes, ...renamed];
        added = [...newOnes, ...renamed];
      }

      showImportReport(added, overwritten, skipped);
      importConflict.value = null;
      conflictChoice.value = null;
      pendingImport = null;
      showSettings.value = false;
    }

    function showImportReport(added, overwritten, skipped) {
      importReport.value = { added, overwritten, skipped };
      reportCollapsed.value = {
        added: added.length > 8,
        overwritten: overwritten.length > 8,
        skipped: true,
      };
    }

    const editSubcategories = computed(() => {
      if (!editDraft.value) return [];
      const cat = editDraft.value.category;
      const subs = new Set();
      allCards.value.forEach(c => {
        if (c.category === cat && c.subcategory) subs.add(c.subcategory);
      });
      return [...subs].sort();
    });

    function openEdit(card) {
      editDraft.value = JSON.parse(JSON.stringify(card));
      editIsNew.value = false;
      editSubNew.value = false;
      editNewSubInput.value = '';
      newTagInput.value = '';
      editingCard.value = true;
    }

    function openCreate() {
      editDraft.value = {
        id: generateUUID(),
        category: activeCategory.value,
        subcategory: '',
        title: '',
        type: '',
        tags: [],
        previewRows: 5,
        language: 'none',
        content: '',
        pinned: false,
        useCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      editIsNew.value = true;
      editSubNew.value = false;
      editNewSubInput.value = '';
      newTagInput.value = '';
      editingCard.value = true;
    }

    function setEditType(type) {
      editDraft.value.type = type;
      if (type === 'code') editDraft.value.content = '';
      else if (type === 'lines') editDraft.value.content = [''];
      else if (type === 'table') editDraft.value.content = [{ key: '', desc: '' }];
      else if (type === 'sections') editDraft.value.content = [{ title: '', content: '' }];
      else if (type === 'note') editDraft.value.content = { points: [''], warning: '' };
      if (!['code', 'lines', 'sections'].includes(type)) editDraft.value.language = 'none';
    }

    function closeEdit() {
      const hasContent = editDraft.value && editDraft.value.title.trim();
      if (hasContent && !confirm('有未儲存的變更，確定要離開嗎？')) return;
      editingCard.value = false;
      editDraft.value = null;
    }

    function saveEdit() {
      if (!editDraft.value) return;
      if (!editDraft.value.title.trim()) { toast('標題不能空白'); return; }
      if (editIsNew.value && !editDraft.value.type) { toast('請先選擇卡片類型'); return; }
      if (editDraft.value.subcategory === '__new__') {
        editDraft.value.subcategory = editNewSubInput.value.trim();
      }
      editDraft.value.title = editDraft.value.title.trim();
      editDraft.value.updatedAt = new Date().toISOString();
      if (editIsNew.value) {
        allCards.value = [...allCards.value, editDraft.value];
        activeCategory.value = editDraft.value.category;
        activeSubcategory.value = null;
        searchKeyword.value = '';
        toast('已新增卡片');
      } else {
        const idx = allCards.value.findIndex(c => c.id === editDraft.value.id);
        if (idx !== -1) {
          allCards.value = [
            ...allCards.value.slice(0, idx),
            editDraft.value,
            ...allCards.value.slice(idx + 1),
          ];
        }
        if (activeCard.value && activeCard.value.id === editDraft.value.id) {
          activeCard.value = editDraft.value;
        }
        toast('已儲存');
      }
      editingCard.value = false;
      editDraft.value = null;
    }

    function addEditTag() {
      const t = newTagInput.value.trim();
      if (t && !editDraft.value.tags.includes(t)) editDraft.value.tags.push(t);
      newTagInput.value = '';
    }
    function removeEditTag(idx) {
      if (idx >= 0) editDraft.value.tags.splice(idx, 1);
    }
    function addEditLine() { editDraft.value.content.push(''); }
    function removeEditLine(idx) { editDraft.value.content.splice(idx, 1); }
    function addEditTableRow() { editDraft.value.content.push({ key: '', desc: '' }); }
    function removeEditTableRow(idx) { editDraft.value.content.splice(idx, 1); }
    function addEditSection() { editDraft.value.content.push({ title: '', content: '' }); }
    function removeEditSection(idx) { editDraft.value.content.splice(idx, 1); }
    function addEditPoint() { editDraft.value.content.points.push(''); }
    function removeEditPoint(idx) { editDraft.value.content.points.splice(idx, 1); }
    function confirmNewSub() {
      const val = editNewSubInput.value.trim();
      editDraft.value.subcategory = val;
      editSubNew.value = false;
    }
    function cancelNewSub() {
      editDraft.value.subcategory = '';
      editSubNew.value = false;
      editNewSubInput.value = '';
    }

    function generateUUID() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
        /[xy]/g,
        (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        },
      );
    }

    return {
      CATEGORIES,
      loading,
      loadingMsg,
      loadError,
      allCards,
      activeCategory,
      activeCard,
      activeSubcategory,
      showSubModal,
      showSettings,
      deletingCard,
      copiedId,
      searchKeyword,
      searchInput,
      toastMsg,
      lastSavedAt,
      fileInput,
      importConflict,
      conflictChoice,
      importReport,
      reportCollapsed,


      cardCounts, activeCategoryCards, activeCategoryRealCount, subcategories, filteredCards, isSearching,
      editingCard, editDraft, editIsNew, newTagInput, editSubNew, editNewSubInput, editSubcategories,

      selectCategory,
      openModal,
      selectSub,
      toggleSection,
      isCollapsed,
      previewCode,
      codeLineCount,
      highlightText,
      copyAll,
      copyLine,
      confirmDelete,
      doDelete,
      confirmReset,
      confirmClearAll,
      toast,
      doExport,
      triggerImport,
      onFileSelected,
      applyImport,
      cancelImport,
      openEdit, openCreate, closeEdit, saveEdit, setEditType,
      addEditTag, removeEditTag,
      addEditLine, removeEditLine,
      addEditTableRow, removeEditTableRow,
      addEditSection, removeEditSection,
      addEditPoint, removeEditPoint,
      confirmNewSub, cancelNewSub,
    };
  },
}).mount("#app");
