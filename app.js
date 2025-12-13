let tasks = [];

const STORAGE_KEY = 'deadlineTasks';

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
            tasks = parsed;
        }
    } catch (error) {
        console.error('タスクの読み込みに失敗しました', error);
        tasks = [];
    }

    tasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    renderTasks();
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

const toggleButton = document.getElementById('taskInputToggle');
const inputBody = document.getElementById('taskInputBody');

if (toggleButton && inputBody) {

    // is-openクラスのつけ外しで開閉を管理
    inputBody.classList.remove('is-open');
    toggleButton.textContent = '＋ タスクを追加';

    toggleButton.addEventListener('click', () => {
        const willBeOpen = !inputBody.classList.contains('is-open');

        if (willBeOpen) {
            inputBody.classList.add('is-open');
            toggleButton.textContent = 'ー フォームを閉じる';
        } else {
            inputBody.classList.remove('is-open');
            toggleButton.textContent = '＋ タスクを追加';
        }
    });
}

// 入力したタスクの描写に関する設定
function renderTasks() {
    const taskListElement = document.getElementById('taskLists');

    taskListElement.innerHTML = '';

    tasks.forEach((task) => {
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

        if (task.coverImage) {
            thumb.style.backgroundImage = `url(${task.coverImage})`;
            thumb.style.backgroundSize = 'cover';
            thumb.style.backgroundPosition = 'center';
            thumb.textContent = '';
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
        if (task.coverImage) {
            detailImage.style.backgroundImage = `url${task.coverImage})`;
            detailImage.style.backgroundSize = 'cover';
            detailImage.style.backgroundPosition = 'center';
            detailImage.textContent = '';
        } else {
            detailImage.textContent = '表紙画像（未設定）';
        }

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

        deleteButton.addEventListener('click', () => {
            if (!confirm('タスクを削除してよろしいですか？')) {
                return;
            }
            tasks = tasks.filter((t) => t.id !== task.id);
            saveTasks();
            renderTasks();
        });

        detail.appendChild(detailImage);
        detail.appendChild(infoList);
        detail.appendChild(deleteButton);

        li.appendChild(detail);

        // =========================
        //  開閉アクション
        // =========================
        compact.addEventListener('click', () => {
            const isOpen = detail.style.display === 'block';
            if (isOpen) {
                detail.style.display = 'none';
                expandHint.textContent = 'タップして全体を表示 ▼';
            } else {
                detail.style.display = 'block';
                expandHint.textContent = 'タップして閉じる ▲';
            }
        });

        taskListElement.appendChild(li);
    });
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

    // ===== 画像をBase64化 =====
    let coverImageBase64 = null;

    if (coverImageInput?.files?.[0]) {
        const file = coverImageInput.files[0];

        coverImageBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('画像の読み込みに失敗しました'));
            reader.readAsDataURL(file);
        });
    }

    const newTask = {
        id: Date.now(),
        title: taskTitle,
        deadlineType,
        deadline: normalizedDeadline,
        displayDeadline,
        progress: 0,
        coverImage: coverImageBase64,
    };

    tasks.push(newTask);
    tasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    if (!saveTasks()) {
        tasks = tasks.filter(t => t.id !== newTask.id);
        return;
    }
    renderTasks();

    // 入力リセット
    taskTitleInput.value = '';
    taskDeadlineInput.value = '';
    taskDeadlineMonthInput.value = '';
    taskDeadlinePartSelect.value = 'early';
    coverImageInput.value = ''; // ★ これ大事：同じ画像を連続で選べるようになる
});


// ついでに exact に戻すなら：
// deadlineTypeSelect.value = 'exact';
// updateDeadlineFields();
updateDeadlineFields();
loadTasks();