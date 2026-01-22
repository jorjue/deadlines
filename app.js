// ===== 定数 =====

// LocalStorageから呼び出すためのキー
const STORAGE_KEY = 'deadlineTasks';

// 写真データベースのキー
const DB_NAME = 'deadlinesDB';
const DB_VERSION = 1;
const IMAGE_STORE = 'images';

const objectUrlCache = new Map();

// タスクフォームのID取得
const taskForm = document.getElementById('taskForm');

// 日付設定（おおまか指定、日付指定）まわりのID取得
const deadlineTypeSelect = document.getElementById('deadlineType');
const exactDeadlineFields = document.getElementById('exactDeadlineFields');
const roughDeadlineFields = document.getElementById('roughDeadlineFields');
const taskDeadlineInput = document.getElementById('taskDeadline');
const taskDeadlineMonthInput = document.getElementById('taskDeadlineMonth');

// 表示状態切替ボタン
const currentToggleBtn = document.getElementById('currentToggleBtn');
const viewDropdown = document.getElementById('viewDropdown');


// ===== 状態 =====

// 期限管理の配列データ
let tasks = [];

// 拡大表示の変数
let imageModalEl = null;
let imageModalImgEl = null;

// フィルター状態
const viewState = {
    scope: 'active',
    tagId: null,
};



// ===== ユーティリティ関数 =====

// アーカイブ切替ボタンの見た目変更
function updateToggleButton() {
    switch (viewState.scope) {
        case 'active':
            currentToggleBtn.textContent = '📋';
            break;

        case 'archive':
            currentToggleBtn.textContent = '📦';
            break;

        case 'all':
        default:
            currentToggleBtn.textContent = '📚';
    }
}

// アーカイブ・実行中切替の動作
currentToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !viewDropdown.classList.contains('hidden');
    viewDropdown.classList.toggle('hidden', isOpen);
    currentToggleBtn.setAttribute('aria-expanded', String(!isOpen));
});

viewDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('button[data-scope]');
    if (!btn) return;
    applyViewScope(btn.dataset.scope);
});

document.addEventListener('click', () => {
    viewDropdown.classList.add('hidden');
    currentToggleBtn.setAttribute('aria-expanded', 'false');
});

// タスクフォームがヘッダーに隠れたら右下にボタンを出す
function setupTaskFormFab() {
    const header = document.querySelector('header');
    const fab = document.getElementById('fabTaskBtn');

    const taskInputToggleBtn = document.getElementById('taskInputToggle');

    const taskInput = document.getElementById('taskInput');

    if (!header || !fab || !taskInputToggleBtn || !taskInput) return;

    taskInput.style.scrollMarginTop = `${Math.ceil(header.getBoundingClientRect().height)}px`;

    function openTaskFormIfClosed() {
        if (!taskInput.classList.contains('is-open')) {
            taskInputToggleBtn.click();
        } 
    }

    fab.addEventListener('click', () => {
        openTaskFormIfClosed();

        const headerH = Math.ceil(header.getBoundingClientRect().height);
        const y = taskInputToggleBtn.getBoundingClientRect().top + window.scrollY - headerH - 8;

        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth'});
        
        requestAnimationFrame(() => requestAnimationFrame(focusTaskTitle));
    });

    let observer;

    function resetObserver() {
        if (observer) observer.disconnect();

        const headerH = Math.ceil(header.getBoundingClientRect().height);

        observer = new IntersectionObserver(
            ([entry]) => {
                fab.classList.toggle('hidden', entry.isIntersecting);
            },
            {
                root: null,
                threshold: 0.01,
                rootMargin: `${headerH}px 0px 0px`,
            }
        );

        observer.observe(taskInputToggleBtn);
    }
    
    resetObserver();
    window.addEventListener('resize', () => resetObserver());
    window.addEventListener('orientationchange', () => setTimeout(resetObserver, 200));
}

// タスクタイトル入力フォームにフォーカスさせる
function focusTaskTitle() {
    const taskTitle = document.getElementById('taskTitle');
    if (!taskTitle) return;

    requestAnimationFrame(() => {
        try {
            taskTitle.focus({ preventScroll: true });
        } catch {
            taskTitle.focus();
        }
    });
}

// 設定した期限の代入
function getDeadlineText(task) {
    return task.displayDeadline || task.deadline || '期限未設定';
}

// データベースのバージョン管理
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(IMAGE_STORE)) {
                db.createObjectStore(IMAGE_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// 設定画像の保存
async function saveImageBlob(blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(IMAGE_STORE);
        const req = store.add({ blob, createdAt: Date.now() });

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// 画像データの圧縮
async function fileToCompressedBlob(file, {
    maxSize = 1280,
    quality = 0.8,
    mimeType = 'image/jpeg',
} = {}) {
    const img = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = reject;
        image.src = url;
    });

    let { width, height } = img;
    const longSide = Math.max(width, height);
    if (longSide > maxSize) {
        const scale = maxSize / longSide;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);

    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), mimeType, quality);
    });
}

async function getImageBlob(imageId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IMAGE_STORE, 'readonly');
        const store = tx.objectStore(IMAGE_STORE);
        const req = store.get(imageId);

        req.onsuccess = () => resolve(req.result?.blob ?? null);
        req.onerror = () => reject(req.error);
    });
}

async function deleteImageBlob(imageId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IMAGE_STORE, 'readwrite');
        const store = tx.objectStore(IMAGE_STORE);
        const req = store.delete(imageId);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// 古いObjectURL、キャッシュの解放
function revokeAllObjectUrls() {
    for (const url of objectUrlCache.values()) {
        URL.revokeObjectURL(url);
    }
    objectUrlCache.clear();
}

// ビューモードの自動切り替え関数
function setViewScope(scope) {
    viewState.scope = scope;
    viewState.tagId = null;
    updateToggleButton();
    document.body.classList.toggle('archive-view', viewState.scope === 'archive');
}
// setViewScopeとrenderTasksの共通化関数
function applyViewScope(scope, { render = true, closeMenu = true } = {}) {
    setViewScope(scope);

    if (render) {
        renderTasks();
    }

    if (closeMenu) {
        viewDropdown.classList.add('hidden');
        currentToggleBtn.setAttribute('aria-expanded', 'false');
    }
}



// ===== データ操作（セーブ & ロード） =====

function saveTasks() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        return true;
    } catch (err) {
        console.error('保存に失敗:', err);
        alert('保存容量が不足している可能性があります。画像サイズを小さくして再試行してください。');
        return false;
    }
}

function loadTasks() {
    const storedTasks = localStorage.getItem(STORAGE_KEY);
    if (!storedTasks) {
        return;
    }

    try {
        const parsed = JSON.parse(storedTasks);
        if (Array.isArray(parsed)) {
            tasks = parsed.map(t => ({ ...t, completed: !!t.completed, archived: !!t.archived }));
        } else {
            tasks = [];
        }
    } catch (error) {
        console.error('タスクの読み込みに失敗しました', error);
        tasks = [];
    }

    tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.deadline) - new Date(b.deadline);
    });
    renderTasks();
}


const taskDeadlinePartSelect = document.getElementById('taskDeadlinePart');

// 日付指定の表示切り替え部分
function updateDeadlineFields() {
    if (deadlineTypeSelect.value === 'exact') {
        exactDeadlineFields.style.display = 'block';
        roughDeadlineFields.style.display = 'none';
    } else {
        exactDeadlineFields.style.display = 'none';
        roughDeadlineFields.style.display = 'block';
    }
}

// 日付指定を切り替えるたびに動作するように設定
deadlineTypeSelect.addEventListener('change', updateDeadlineFields);

const taskInputToggle = document.getElementById('taskInputToggle');
const taskInputSection = document.querySelector('.task-input');

taskInputToggle.addEventListener('click', () => {
    const isOpen = taskInputSection.classList.toggle('is-open');
    taskInputToggle.textContent = isOpen ? '− フォームを閉じる' : '＋ タスクを追加';

    const willOpen = taskInputSection.classList.contains('is-open');
    if (willOpen) {
        focusTaskTitle();
    }
});

function addInfoRow(infoList, labelText, valueText, { key } = {}) {
    const row = document.createElement('div');
    row.classList.add('task-info-row');
    if (key) row.dataset.key = key;

    const label = document.createElement('span');
    label.classList.add('info-label');
    label.textContent = labelText;

    const value = document.createElement('span');
    value.classList.add('info-value');
    value.textContent = valueText;

    row.append(label, value);
    infoList.appendChild(row);

    return { row, value };
}

// 詳細部分の取得・描写の関数
function renderTaskInfoList(infoList, task) {
    infoList.innerHTML = '';

    addInfoRow(infoList, '期限', getDeadlineText(task), { key: 'deadline' });

    if (task.submitTo) {
        addInfoRow(infoList, '提出先', task.submitTo, { key: 'submitTo' });
    }

    // メモは後で task.memo を導入したら差し替える
    addInfoRow(infoList, 'メモ', '（メモ機能は後で追加予定）', { key: 'memo' });
}


//　表示しているタスクのフィルター処理
function getVisibleTasks(allTasks, viewState) {
    switch (viewState.scope) {
        case 'active':
            return allTasks.filter(t => !t.archived);

        case 'archive':
            return allTasks.filter(t => t.archived);

        case 'tag':
            if (!viewState.tagId) return allTasks;
            return allTasks.filter(t =>
                Array.isArray(t.tagIds) && t.tagIds.includes(viewState.tagId)
            );

        case 'all':
        default:
            return allTasks;
    }
}


// ===== renderTasks() =====

// 入力したタスクの描写に関する設定
function renderTasks() {
    revokeAllObjectUrls();

    const taskListElement = document.getElementById('taskLists');
    taskListElement.innerHTML = '';

    // let visibleTasks = tasks;

    // if (currentView === 'active') {
    //     visibleTasks = tasks.filter(t => !t.archived);
    // } else if (currentView === 'archive') {
    //     visibleTasks = tasks.filter(t => t.archived);
    // }

    const visibleTasks = getVisibleTasks(tasks, viewState);

    visibleTasks.forEach((task) => {
        const li = document.createElement('li');
        li.classList.add('task-item');

        // =========================
        //  簡易表示（コンパクトビュー）
        // =========================
        const compact = document.createElement('div');
        compact.classList.add('task-compact');

        // サムネイル（とりあえずプレースホルダー）
        const thumb = document.createElement('div');
        thumb.classList.add('task-thumb');

        if (task.coverImageId) {
            getImageBlob(task.coverImageId).then((blob) => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                objectUrlCache.set(task.coverImageId, url);
                thumb.style.backgroundImage = `url(${url})`;
                thumb.style.backgroundSize = 'cover';
                thumb.style.backgroundPosition = 'top center';
                thumb.textContent = '';
            });
        } else {
            thumb.textContent = task.title ? task.title.charAt(0) : '？';
        }

        // 右側のテキスト部分
        const compactMain = document.createElement('div');
        compactMain.classList.add('task-compact-main');

        const titleDiv = document.createElement('div');
        titleDiv.classList.add('task-item-title');
        titleDiv.textContent = task.title;

        const deadlineDiv = document.createElement('div');
        deadlineDiv.classList.add('task-item-deadline');

        const textForDisplay = getDeadlineText(task);
        deadlineDiv.textContent = `期限：${textForDisplay}`;

        // 進捗ゲージ（とりあえず 0〜100 を想定しておく）
        const progressBar = document.createElement('div');
        progressBar.classList.add('task-progress-bar');

        const progressValue = document.createElement('div');
        progressValue.classList.add('task-progress-value');
        const progress = typeof task.progress === 'number' ? task.progress : 0;
        const clamped = Math.min(Math.max(progress, 0), 100);
        progressValue.style.width = `${clamped}%`;

        progressBar.appendChild(progressValue);

        // タップで詳細が開くヒント
        const expandHint = document.createElement('div');
        expandHint.classList.add('task-expand-hint');
        expandHint.textContent = 'タップして全体を表示 ▼';

        compactMain.appendChild(titleDiv);
        compactMain.appendChild(deadlineDiv);
        compactMain.appendChild(progressBar);
        compactMain.appendChild(expandHint);

        compact.appendChild(thumb);
        compact.appendChild(compactMain);

        li.appendChild(compact);

        // =========================
        //  詳細表示（エクスパンドビュー）
        // =========================
        const detail = document.createElement('div');
        detail.classList.add('task-detail');

        // 表紙画像（本実装は後で）とりあえず枠だけ
        const detailImage = document.createElement('div');
        detailImage.classList.add('task-detail-image');
        if (task.coverImageId) {
            getImageBlob(task.coverImageId).then((blob) => {
                if (!blob) {
                    detailImage.textContent = '表紙画像（未設定）';
                    return;
                }
                const url = URL.createObjectURL(blob);
                objectUrlCache.set(task.coverImageId, url);
                detailImage.style.backgroundImage = `url(${url})`;
                detailImage.style.backgroundSize = 'cover';
                detailImage.style.backgroundPosition = 'top center';
                detailImage.textContent = '';
            });
        } else {
            detailImage.textContent = '表紙画像（未設定）';
        }
        detailImage.style.cursor = task.coverImageId ? 'zoom-in' : 'default';
        detailImage.addEventListener('click', () => {
            if (!task.coverImageId) return;
            openCoverImageModal(task.coverImageId);
        });

        // 情報リスト
        const infoList = document.createElement('div');
        infoList.classList.add('task-info-list');
        renderTaskInfoList(infoList, task);


        // 削除ボタン（詳細ビュー内の右下）
        const deleteButton = document.createElement('button');
        deleteButton.classList.add('task-delete');
        deleteButton.textContent = 'タスクを削除';

        deleteButton.addEventListener('click', async () => {
            if (!confirm('タスクを削除してよろしいですか？')) return;

            if (task.coverImageId) {
                try {
                    const url = objectUrlCache.get(task.coverImageId);
                    if (url) {
                        URL.revokeObjectURL(url);
                        objectUrlCache.delete(task.coverImageId);
                    }
                    await deleteImageBlob(task.coverImageId);
                } catch (e) {
                    console.warn('画像削除に失敗:', e);
                }
            }

            tasks = tasks.filter((t) => t.id !== task.id);
            saveTasks();
            renderTasks();
        });

        const completeButton = document.createElement('button');
        completeButton.classList.add('task-complete');
        completeButton.textContent = task.completed ? '未完了に戻す' : 'タスクを完了';

        completeButton.addEventListener('click', () => {
            const msg = task.completed ? 'タスクを未完了に戻しますか？' : 'タスクを完了済みにしてよろしいですか？';
            if (!confirm(msg)) return;
            task.completed = !task.completed;
            saveTasks();
            tasks.sort((a, b) => {
                if (a.completed !== b.completed) return a.completed ? 1 : -1;
                return new Date(a.deadline) - new Date(b.deadline);
            });
            renderTasks();
        });

        const archiveButton = document.createElement('button');
        archiveButton.classList.add('task-archive');
        archiveButton.textContent = task.archived ? '📋 一覧に戻す' : '📦 アーカイブ';

        archiveButton.addEventListener('click', () => {
            const archiveMsg = task.archived ? 'タスク一覧に戻しますか？' : 'このタスクをアーカイブしますか？';
            if (!confirm(archiveMsg)) return;
            li.classList.add('is-leaving');

            setTimeout(() => {
                task.archived = !task.archived;
                saveTasks();
                renderTasks();
            }, 180);
        });

        detail.appendChild(detailImage);
        detail.appendChild(infoList);
        if (!task.archived) {
            detail.appendChild(completeButton);
        }

        if (task.completed) {
            detail.appendChild(archiveButton);
        }
        detail.appendChild(deleteButton);

        li.appendChild(detail);

        // =========================
        //  開閉アクション
        // =========================
        compact.addEventListener('click', () => {
            const isOpen = li.classList.toggle('is-open');
            expandHint.textContent = isOpen ? 'タップして閉じる' : 'タップして全体を表示';
        });

        if (task.completed) {
            li.classList.add('task-completed');
        }
        taskListElement.appendChild(li);
    });
}


function ensureImageModal() {
    if (imageModalEl) return;
    imageModalEl = document.createElement('div');
    imageModalEl.id = 'imageModal';
    imageModalEl.className = 'image-modal';

    const inner = document.createElement('div');
    inner.className = 'image-modal-inner';

    imageModalImgEl = document.createElement('img');
    imageModalImgEl.className = 'image-modal-img';
    imageModalImgEl.alt = '';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'image-modal-close';
    closeBtn.type = 'button';
    closeBtn.textContent = '×';

    inner.appendChild(closeBtn);
    inner.appendChild(imageModalImgEl);
    imageModalEl.appendChild(inner);
    document.body.appendChild(imageModalEl);

    const close = () => {
        imageModalEl.classList.remove('is-open');
        if (imageModalImgEl.src.startsWith('blob')) {
            URL.revokeObjectURL(imageModalImgEl.src);
        }
    }
    imageModalImgEl.src = '';

    imageModalEl.addEventListener('click', (e) => {
        if (e.target === imageModalEl) close();
    });

    closeBtn.addEventListener('click', close);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && imageModalEl.classList.contains('is-open')) {
            close();
        }
    });
}

async function openCoverImageModal(coverImageId) {
    if (!coverImageId) return;
    ensureImageModal();

    const blob = await getImageBlob(coverImageId);
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    imageModalImgEl.src = url;
    imageModalEl.classList.add('is-open');
}


taskForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const taskTitleInput = document.getElementById('taskTitle');
    const coverImageInput = document.getElementById('coverImage');
    const taskTitle = taskTitleInput.value.trim();
    const submitToInput = document.getElementById('taskSubmitTo');
    const submitTo = submitToInput.value.trim() || null;

    const deadlineType = deadlineTypeSelect.value;

    if (!taskTitle) {
        alert('タスク名を入力してください');
        return;
    }

    if (deadlineType === 'exact' && !taskDeadlineInput.value) {
        alert('提出期限（日付）を入力してください');
        return;
    }

    if (deadlineType === 'rough' && !taskDeadlineMonthInput.value) {
        alert('提出期限（月）を入力してください');
        return;
    }

    let normalizedDeadline = '';
    let displayDeadline = '';

    if (deadlineType === 'exact') {
        normalizedDeadline = taskDeadlineInput.value;
        displayDeadline = taskDeadlineInput.value;
    } else {
        const monthValue = taskDeadlineMonthInput.value;   // '2025-12'
        const partValue = taskDeadlinePartSelect.value;    // 'early'など
        const [year, month] = monthValue.split('-');

        let day;
        let partLabel;

        if (partValue === 'early') {
            day = 10; partLabel = '上旬';
        } else if (partValue === 'middle') {
            day = 20; partLabel = '中旬';
        } else {
            day = new Date(Number(year), Number(month), 0).getDate();
            partLabel = '下旬';
        }

        normalizedDeadline = `${year}-${month}-${String(day).padStart(2, '0')}`;
        displayDeadline = `${year}年${Number(month)}月${partLabel}`;
    }

    // ===== 画像をIndexedDBへ =====
    let coverImageId = null;

    if (coverImageInput?.files?.[0]) {
        const file = coverImageInput.files[0];

        const blob = await fileToCompressedBlob(file, {
            maxSize: 1600,
            quality: 0.85,
            mimeType: 'image/jpeg',
        });

        if (!blob) {
            alert('画像の変換に失敗しました');
            return;
        }

        coverImageId = await saveImageBlob(blob);
    }


    const newTask = {
        id: Date.now(),
        title: taskTitle,
        deadlineType,
        deadline: normalizedDeadline,
        displayDeadline,
        progress: 0,
        coverImageId,
        submitTo: submitTo || null,
        completed: false,
        archived: false,
    };

    if (viewState.scope === 'archive') {
        applyViewScope('active', { render: false, closeMenu: false });
    }


    tasks.push(newTask);
    // tasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.deadline) - new Date(b.deadline);
    });
    saveTasks();
    renderTasks();

    // 入力リセット
    taskTitleInput.value = '';
    taskDeadlineInput.value = '';
    taskDeadlineMonthInput.value = '';
    taskDeadlinePartSelect.value = 'early';
    coverImageInput.value = '';
    submitToInput.value = '';
    // ついでに exact に戻すなら：
    // deadlineTypeSelect.value = 'exact';
    // updateDeadlineFields();

    taskInputSection.classList.remove('is-open');
    taskInputToggle.textContent = '＋ タスクを追加';
});

setViewScope(viewState.scope);
updateDeadlineFields();
setupTaskFormFab();
loadTasks();

function updateHeaderHeightVar() {
    const header = document.querySelector('header');
    if (!header) return;

    const h = Math.ceil(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--header-height', `${h}px`);
}

updateHeaderHeightVar();

if (document.fonts?.ready) {
    document.fonts.ready.then(updateHeaderHeightVar);
}

let __headerHeightTimer;
window.addEventListener('resize', () => {
    clearTimeout(__headerHeightTimer);
    __headerHeightTimer = setTimeout(updateHeaderHeightVar, 100);
});
window.addEventListener('orientationchange', () => {
    setTimeout(updateHeaderHeightVar, 200);
});

// バージョン表記
(function showVersion() {
    const el = document.getElementById('appVersion');
    const meta = document.querySelector('meta[name="app-version"]');
    if (!el || !meta) return;
    el.textContent = `v${meta.content}`;
})();