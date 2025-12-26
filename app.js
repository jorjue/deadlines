// 期限管理の配列データ
let tasks = [];

let currentView = 'active';

function updateToggleButton() {
    if (currentView === 'active') {
        currentToggleBtn.textContent = '📦';
    } else if (currentView === 'archive') {
        currentToggleBtn.textContent = '📋';
    }
}

const currentToggleBtn = document.getElementById('currentToggleBtn');
currentToggleBtn.addEventListener('click', () => {
    if (currentView === 'active') {
        currentView = 'archive';
        updateToggleButton();
        document.body.classList.toggle('archive-view', currentView === 'archive');
        renderTasks();
    } else if (currentView === 'archive') {
        currentView = 'active';
        updateToggleButton();
        document.body.classList.toggle('archive-view', currentView === 'archive');
        renderTasks();
    }
});

// LocalStorageから呼び出すためのキー
const STORAGE_KEY = 'deadlineTasks';

// 写真データベースのキー
const DB_NAME = 'deadlinesDB';
const DB_VERSION = 1;
const IMAGE_STORE = 'images';

const objectUrlCache = new Map();

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

function saveTasks() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        return true;
    } catch (err) {
        console.error('保存に失敗:', err);
        alert('保存容量が不足している可能性があります。画像サイズを小さくして再試行してください。');
        return false;
    }
    // localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
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

// タスクフォームのID取得
const taskForm = document.getElementById('taskForm');

// 日付設定（おおまか指定、日付指定）まわりのID取得
const deadlineTypeSelect = document.getElementById('deadlineType');
const exactDeadlineFields = document.getElementById('exactDeadlineFields');
const roughDeadlineFields = document.getElementById('roughDeadlineFields');
const taskDeadlineInput = document.getElementById('taskDeadline');
const taskDeadlineMonthInput = document.getElementById('taskDeadlineMonth');
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

// const toggleButton = document.getElementById('taskInputToggle');
// const inputBody = document.getElementById('taskInputBody');

// if (toggleButton && inputBody) {

//     // is-openクラスのつけ外しで開閉を管理
//     inputBody.classList.remove('is-open');
//     toggleButton.textContent = '＋ タスクを追加';

//     toggleButton.addEventListener('click', () => {
//         const willBeOpen = !inputBody.classList.contains('is-open');

//         if (willBeOpen) {
//             inputBody.classList.add('is-open');
//             toggleButton.textContent = 'ー フォームを閉じる';
//         } else {
//             inputBody.classList.remove('is-open');
//             toggleButton.textContent = '＋ タスクを追加';
//         }
//     });
// }

const taskInputToggle = document.getElementById('taskInputToggle');
const taskInputSection = document.querySelector('.task-input');

taskInputToggle.addEventListener('click', () => {
    const isOpen = taskInputSection.classList.toggle('is-open');
    taskInputToggle.textContent = isOpen ? '− フォームを閉じる' : '＋ タスクを追加';
});

// 入力したタスクの描写に関する設定
function renderTasks() {
    revokeAllObjectUrls();

    const taskListElement = document.getElementById('taskLists');
    taskListElement.innerHTML = '';

    let visibleTasks = tasks;

    if (currentView === 'active') {
        visibleTasks = tasks.filter(t => !t.archived);
    } else if (currentView === 'archive') {
        visibleTasks = tasks.filter(t => t.archived);
    }

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

        const textForDisplay = task.displayDeadline || task.deadline || '期限未設定';
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

        const infoDeadline = document.createElement('div');
        infoDeadline.classList.add('task-info-row');
        infoDeadline.innerHTML =
            `<span class="info-label">期限</span><span class="info-value">${textForDisplay}</span>`;

        const infoNote = document.createElement('div');
        infoNote.classList.add('task-info-row');
        infoNote.innerHTML =
            `<span class="info-label">メモ</span><span class="info-value">（メモ機能は後で追加予定）</span>`;

        infoList.appendChild(infoDeadline);
        infoList.appendChild(infoNote);

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
            // if (isOpen) {
            //     detail.style.display = 'none';
            //     expandHint.textContent = 'タップして全体を表示 ▼';
            // } else {
            //     detail.style.display = 'block';
            //     expandHint.textContent = 'タップして閉じる ▲';
            // }
        });

        if (task.completed) {
            li.classList.add('task-completed');
        }
        taskListElement.appendChild(li);
    });
}

let imageModalEl = null;
let imageModalImgEl = null;

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
        completed: false,
        archived: false,
    };

    if (currentView === 'archive') {
        currentView = 'active';
        updateToggleButton();
        document.body.classList.toggle('archive-view', currentView === 'archive');
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
    // ついでに exact に戻すなら：
    // deadlineTypeSelect.value = 'exact';
    // updateDeadlineFields();

    taskInputSection.classList.remove('is-open');
    taskInputToggle.textContent = '＋ タスクを追加';
});

updateDeadlineFields();
loadTasks();