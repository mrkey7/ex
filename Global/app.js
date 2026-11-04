"use strict";

const state = {
    config: null,
    mode: "UJ",
    workbook: null,
    workbookHash: "",
    questions: [],
    participants: [],
    participantError: "",
    results: [],
    storageKey: "",
    activeExam: null,
    timerId: null,
    result: null
};

const $ = id => document.getElementById(id);
const ui = {
    pageTitle: $("pageTitle"), pageSubtitle: $("pageSubtitle"), statusLabel: $("statusLabel"),
    loadingPanel: $("loadingPanel"), loadingText: $("loadingText"), errorPanel: $("errorPanel"),
    errorMessage: $("errorMessage"), filePanel: $("filePanel"), workbookInput: $("workbookInput"),
    fileStatus: $("fileStatus"),
    appPanel: $("appPanel"), homeScreen: $("homeScreen"),
    homeDescription: $("homeDescription"), homeQuestionCount: $("homeQuestionCount"),
    homeDuration: $("homeDuration"), anonymousStartButton: $("anonymousStartButton"), skipIdentityButton: $("skipIdentityButton"),
    identityPanel: $("identityPanel"), participantHint: $("participantHint"),
    studentSearch: $("studentSearch"), studentSelect: $("studentSelect"), studentCount: $("studentCount"),
    selectedStudent: $("selectedStudent"), startExamButton: $("startExamButton"),
    examScreen: $("examScreen"), resultScreen: $("resultScreen"), exportButton: $("exportButton"),
    timer: $("timer"), timerLabel: $("timerLabel"), examParticipantName: $("examParticipantName"),
    examQuestionCount: $("examQuestionCount"), questionNumber: $("questionNumber"),
    questionText: $("questionText"), optionsList: $("optionsList"), prevQuestion: $("prevQuestion"),
    nextQuestion: $("nextQuestion"), questionNav: $("questionNav"), navProgress: $("navProgress"),
    progressFill: $("progressFill"), finishExamButton: $("finishExamButton"),
    timerBox: document.querySelector(".timer-box"), resultTitle: $("resultTitle"),
    resultSubtitle: $("resultSubtitle"), scoreValue: $("scoreValue"), scoreFraction: $("scoreFraction"),
    correctValue: $("correctValue"), wrongValue: $("wrongValue"), blankValue: $("blankValue"),
    elapsedValue: $("elapsedValue"), recapNotice: $("recapNotice"), toast: $("toast")
};

function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ui.toast.classList.remove("show"), 3000);
}

function showError(message) {
    ui.loadingPanel.classList.add("hidden");
    ui.appPanel.classList.add("hidden");
    ui.errorPanel.classList.remove("hidden");
    ui.errorMessage.textContent = message;
    ui.pageTitle.textContent = "Perlu pemeriksaan";
    ui.pageSubtitle.textContent = "Aplikasi belum dapat memuat pengaturan atau sumber soal.";
    ui.statusLabel.textContent = "PERIKSA";
}

function cleanText(value) {
    return String(value ?? "").trim();
}

function parseConfig(text, mode) {
    const settings = {};
    for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const splitAt = line.indexOf(";");
        if (splitAt < 1) continue;
        settings[line.slice(0, splitAt).trim().toLowerCase()] = line.slice(splitAt + 1).trim();
    }
    if (mode === "UH") {
        const jumlahSoal = Number(settings.soal), durasi = Number(settings.durasi);
        if (!Number.isInteger(jumlahSoal) || jumlahSoal < 1) throw new Error("soal harus berupa bilangan bulat minimal 1.");
        if (!Number.isFinite(durasi) || durasi < 0) throw new Error("durasi harus berupa angka 0 atau lebih.");
        return { fileExcel: "", sheetSoal: "Soal", sheetPeserta: "Peserta", jumlahSoal, durasiMenit: durasi, acakNo: true, acakPilihan: true, rekap: true };
    }
    const required = ["sheet_soal", "jumlah_soal", "durasi", "acak_no", "acak_pilihan", "rekap"];
    const missing = required.filter(key => settings[key] === undefined || settings[key] === "");
    if (missing.length) throw new Error(`Parameter belum lengkap di config_${mode}.txt: ${missing.join(", ")}.`);
    const jumlahSoal = Number(settings.jumlah_soal), durasi = Number(settings.durasi);
    if (!Number.isInteger(jumlahSoal) || jumlahSoal < 1) throw new Error("jumlah_soal harus berupa bilangan bulat minimal 1.");
    if (!Number.isFinite(durasi) || durasi < 0) throw new Error("durasi harus berupa angka 0 atau lebih. Gunakan 0 untuk tanpa batas waktu.");
    const parseFlag = key => {
        if (settings[key] !== "0" && settings[key] !== "1") throw new Error(`${key} hanya boleh bernilai 0 atau 1.`);
        return settings[key] === "1";
    };
    return { fileExcel: "", sheetSoal: settings.sheet_soal, sheetPeserta: settings.sheet_peserta || "", jumlahSoal, durasiMenit: durasi, acakNo: parseFlag("acak_no"), acakPilihan: parseFlag("acak_pilihan"), rekap: parseFlag("rekap") };
}

async function fetchText(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Tidak dapat membaca ${path} (HTTP ${response.status}).`);
    return response.text();
}

function parseXml(bytes, label) {
    const doc = new DOMParser().parseFromString(new TextDecoder("utf-8").decode(bytes), "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error(`Struktur XML pada ${label} tidak dapat dibaca.`);
    return doc;
}

async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") throw new Error("Browser tidak mendukung pembacaan ZIP XLSX. Gunakan Chrome atau Edge versi modern.");
    let stream;
    try {
        stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    } catch {
        throw new Error("Browser tidak mendukung kompresi file XLSX ini.");
    }
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(view) {
    const min = Math.max(0, view.byteLength - 65557);
    for (let offset = view.byteLength - 22; offset >= min; offset--) {
        if (view.getUint32(offset, true) === 0x06054b50) return offset;
    }
    throw new Error("Struktur ZIP tidak ditemukan. Pastikan file benar-benar berformat .xlsx.");
}

function readZipDirectory(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    const eocd = findEndOfCentralDirectory(view);
    const count = view.getUint16(eocd + 10, true);
    const directoryOffset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder("utf-8");
    const entries = new Map();
    let cursor = directoryOffset;

    for (let i = 0; i < count; i++) {
        if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Daftar isi ZIP XLSX tidak valid.");
        const method = view.getUint16(cursor + 10, true);
        const compressedSize = view.getUint32(cursor + 20, true);
        const fileNameLength = view.getUint16(cursor + 28, true);
        const extraLength = view.getUint16(cursor + 30, true);
        const commentLength = view.getUint16(cursor + 32, true);
        const localHeaderOffset = view.getUint32(cursor + 42, true);
        const fileName = decoder.decode(new Uint8Array(arrayBuffer, cursor + 46, fileNameLength));
        entries.set(fileName, { method, compressedSize, localHeaderOffset });
        cursor += 46 + fileNameLength + extraLength + commentLength;
    }
    return { arrayBuffer, view, entries };
}

async function readZipEntry(zip, path) {
    const entry = zip.entries.get(path);
    if (!entry) return null;
    const view = zip.view;
    const offset = entry.localHeaderOffset;
    if (view.getUint32(offset, true) !== 0x04034b50) throw new Error(`Bagian file XLSX tidak valid: ${path}`);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extraLength;
    const bytes = new Uint8Array(zip.arrayBuffer, start, entry.compressedSize);
    if (entry.method === 0) return bytes.slice();
    if (entry.method === 8) return inflateRaw(bytes);
    throw new Error(`Metode kompresi XLSX tidak didukung pada ${path}.`);
}

function resolveWorkbookTarget(target) {
    if (target.startsWith("/")) return target.slice(1);
    const parts = ["xl"];
    for (const part of target.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") parts.pop();
        else parts.push(part);
    }
    return parts.join("/");
}

async function openXlsx(arrayBuffer) {
    const zip = readZipDirectory(arrayBuffer);
    const workbookBytes = await readZipEntry(zip, "xl/workbook.xml");
    const relsBytes = await readZipEntry(zip, "xl/_rels/workbook.xml.rels");
    if (!workbookBytes || !relsBytes) throw new Error("File Excel ini bukan workbook XLSX yang dikenali.");
    const workbookDoc = parseXml(workbookBytes, "workbook.xml");
    const relsDoc = parseXml(relsBytes, "workbook.xml.rels");
    const relMap = new Map();
    for (const rel of Array.from(relsDoc.getElementsByTagNameNS("*", "Relationship"))) relMap.set(rel.getAttribute("Id"), rel.getAttribute("Target"));

    const sheets = [];
    for (const sheet of Array.from(workbookDoc.getElementsByTagNameNS("*", "sheet"))) {
        const name = sheet.getAttribute("name");
        const relId = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || sheet.getAttribute("r:id");
        const target = relMap.get(relId);
        if (name && target) sheets.push({ name, path: resolveWorkbookTarget(target) });
    }
    if (!sheets.length) throw new Error("Tidak ditemukan worksheet di dalam workbook.");

    const sharedBytes = await readZipEntry(zip, "xl/sharedStrings.xml");
    let sharedStrings = [];
    if (sharedBytes) {
        const sharedDoc = parseXml(sharedBytes, "sharedStrings.xml");
        sharedStrings = Array.from(sharedDoc.getElementsByTagNameNS("*", "si")).map(item =>
            Array.from(item.getElementsByTagNameNS("*", "t")).map(node => node.textContent || "").join("")
        );
    }
    return { zip, sheets, sharedStrings };
}

function columnIndex(reference) {
    const letters = String(reference || "").match(/^[A-Z]+/i)?.[0];
    if (!letters) return -1;
    let result = 0;
    for (const char of letters.toUpperCase()) result = result * 26 + char.charCodeAt(0) - 64;
    return result - 1;
}

function cellValue(cell, sharedStrings) {
    const type = cell.getAttribute("t");
    if (type === "inlineStr") return Array.from(cell.getElementsByTagNameNS("*", "t")).map(node => node.textContent || "").join("");
    const valueNode = cell.getElementsByTagNameNS("*", "v")[0];
    if (!valueNode) return "";
    const value = valueNode.textContent ?? "";
    if (type === "s") return sharedStrings[Number(value)] ?? "";
    if (type === "b") return value === "1" ? "TRUE" : "FALSE";
    return value;
}

async function readWorksheet(workbook, sheetName) {
    const sheet = workbook.sheets.find(item => item.name === sheetName);
    if (!sheet) throw new Error(`Worksheet '${sheetName}' tidak ditemukan di file Excel.`);
    const bytes = await readZipEntry(workbook.zip, sheet.path);
    if (!bytes) throw new Error(`Isi worksheet '${sheetName}' tidak ditemukan.`);
    const doc = parseXml(bytes, sheet.path);
    const rows = [];
    for (const rowNode of Array.from(doc.getElementsByTagNameNS("*", "row"))) {
        const rowNumber = Math.max(1, Number(rowNode.getAttribute("r")) || rows.length + 1);
        const values = [];
        for (const cell of Array.from(rowNode.getElementsByTagNameNS("*", "c"))) {
            const index = columnIndex(cell.getAttribute("r"));
            if (index >= 0) values[index] = cellValue(cell, workbook.sharedStrings);
        }
        rows[rowNumber - 1] = values;
    }
    return rows;
}

function normalizeHeader(value) {
    return cleanText(value).toUpperCase().replace(/[\s._-]+/g, "");
}

function findQuestionHeader(rows) {
    const aliases = { N: ["N", "NO", "NOMOR"], Q: ["Q", "SOAL", "PERTANYAAN"], K: ["K", "KUNCI", "KUNCIJAWABAN"] };
    const scan = Math.min(rows.length, 30);
    for (let rowIndex = 0; rowIndex < scan; rowIndex++) {
        const values = (rows[rowIndex] || []).map(normalizeHeader);
        const find = list => values.findIndex(value => list.includes(value));
        const n = find(aliases.N), q = find(aliases.Q), k = find(aliases.K);
        const options = {};
        for (let number = 1; number <= 6; number++) options[number] = values.findIndex(value => value === String(number));
        if (n >= 0 && q >= 0 && k >= 0 && Object.values(options).filter(index => index >= 0).length >= 2) return { rowIndex, columns: { n, q, k, options } };
    }
    throw new Error("Header soal tidak ditemukan. Gunakan kolom N, Q, K, dan pilihan 1 sampai 6.");
}

function parseQuestions(rows) {
    const header = findQuestionHeader(rows);
    const questions = [];
    const issues = [];
    const seen = new Map();
    for (let i = header.rowIndex + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const number = cleanText(row[header.columns.n]);
        const question = cleanText(row[header.columns.q]);
        const keyText = cleanText(row[header.columns.k]);
        const options = [];
        for (let optionNumber = 1; optionNumber <= 6; optionNumber++) {
            const col = header.columns.options[optionNumber];
            const value = cleanText(row[col ?? -1]);
            if (value) options.push({ number: optionNumber, text: value });
        }
        if (!number && !question && !keyText && options.length === 0) continue;
        const rowIssues = [];
        if (!number) rowIssues.push("Nomor soal kosong.");
        if (!question) rowIssues.push("Pertanyaan kosong.");
        if (options.length < 2) rowIssues.push("Minimal dua pilihan harus terisi.");
        const key = Number(keyText);
        if (!keyText || !Number.isInteger(key) || key < 1 || key > 6) rowIssues.push("Kunci harus berupa angka 1 sampai 6.");
        else if (!options.some(option => option.number === key)) rowIssues.push(`Pilihan ${key} yang menjadi kunci masih kosong.`);
        if (number) {
            const normalized = number.toLocaleLowerCase("id-ID");
            if (seen.has(normalized)) rowIssues.push(`Nomor soal duplikat dengan baris Excel ${seen.get(normalized)}.`);
            else seen.set(normalized, i + 1);
        }
        questions.push({ number, question, key, options, excelRow: i + 1, issues: rowIssues });
        for (const message of rowIssues) issues.push(`Baris Excel ${i + 1} (soal ${number || "—"}): ${message}`);
    }
    if (!questions.length) throw new Error("Tidak ditemukan baris soal setelah header worksheet.");
    if (issues.length) throw new Error(`Ditemukan ${issues.length} masalah pada bank soal. ${issues.slice(0, 4).join(" ")}`);
    return questions;
}

function findParticipantHeader(rows) {
    const scan = Math.min(rows.length, 30);
    for (let rowIndex = 0; rowIndex < scan; rowIndex++) {
        const values = (rows[rowIndex] || []).map(normalizeHeader);
        const find = list => values.findIndex(value => list.includes(value));
        const columns = {
            n: find(["N", "NO", "NOMOR"]),
            n2: find(["N2", "NO2", "NOMOR2", "NOPERROMBEL", "NOPERKELAS"]),
            nisn: find(["NISN"]),
            name: find(["NAMA", "NAMALENGKAP"]),
            gender: find(["JK", "JENISKELAMIN", "GENDER"]),
            rombel: find(["C", "ROMBEL", "KELAS", "ROMBONGANBELAJAR"])
        };
        if (columns.name >= 0 && columns.nisn >= 0) return { rowIndex, columns };
    }
    throw new Error("Header peserta tidak ditemukan. Diperlukan minimal kolom NISN dan NAMA; format lengkap: N | N2 | NISN | NAMA | JK | C.");
}

function expandScientific(value) {
    const text = cleanText(value);
    const normalized = text.replace(/,/g, ".");
    if (!/^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i.test(normalized)) return text;
    const number = Number(normalized);
    return Number.isFinite(number) ? number.toFixed(0) : text;
}

function parseParticipants(rows) {
    const header = findParticipantHeader(rows);
    const participants = [];
    for (let i = header.rowIndex + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const get = key => header.columns[key] >= 0 ? cleanText(row[header.columns[key]]) : "";
        const name = get("name");
        if (!name) continue;
        participants.push({
            n: get("n"),
            n2: get("n2"),
            nisn: expandScientific(get("nisn")),
            name,
            gender: get("gender"),
            rombel: get("rombel")
        });
    }
    if (!participants.length) throw new Error("Tidak ada data peserta di worksheet yang dipilih.");
    return participants;
}

function localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function hashWorkbook(buffer) {
    const bytes = new Uint8Array(buffer);
    let hash = 2166136261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function prepareStorage() {
    if (!state.config.rekap) return;
    state.storageKey = ["UjianHarian", localDateKey(), state.config.fileExcel, state.config.sheetSoal, state.config.sheetPeserta, state.config.jumlahSoal, state.config.durasiMenit, state.config.acakNo, state.config.acakPilihan, state.workbookHash].join("|");
    try {
        const saved = JSON.parse(localStorage.getItem(state.storageKey) || "[]");
        state.results = Array.isArray(saved) ? saved : [];
    } catch {
        state.results = [];
        toast("Penyimpanan browser tidak dapat dibaca; hasil hanya tersimpan selama halaman terbuka.");
    }
}

function persistResults() {
    if (!state.config.rekap) return;
    try {
        localStorage.setItem(state.storageKey, JSON.stringify(state.results));
    } catch {
        toast("Penyimpanan browser penuh. Segera unduh rekap sebagai cadangan.");
    }
}

function renderSettings() {
    const config = state.config;
    ui.homeQuestionCount.textContent = String(config.jumlahSoal);
    ui.homeDuration.textContent = config.durasiMenit > 0 ? `${config.durasiMenit} menit` : "Tanpa batas";
    document.body.classList.toggle("uh-mode", state.mode === "UH");
    ui.identityPanel.classList.toggle("hidden", !config.rekap);
    document.querySelector(".anonymous-card").classList.toggle("hidden", state.mode === "UH");
    ui.skipIdentityButton?.classList.toggle("hidden", state.mode !== "UH");
    if (ui.homeDescription) ui.homeDescription.textContent = !config.rekap
        ? "Mulai ujian tanpa identitas. Hasil hanya ditampilkan dan tidak dicatat ke rekap."
        : state.participants.length
            ? "Pilih nama bila hasil ingin dicatat. Tanpa nama, hasil tidak masuk rekap."
            : "Daftar peserta belum tersedia. Ujian tetap dapat dimulai tanpa nama.";
    ui.startExamButton.disabled = !config.rekap || state.participants.length === 0;
    ui.participantHint.textContent = state.participantError || (state.participants.length
        ? "Pilih nama untuk mencatat hasil ke rekap."
        : "Daftar peserta belum tersedia. Anda tetap dapat mulai tanpa nama.");
    ui.studentCount.textContent = state.participants.length ? `${state.participants.length} peserta` : "";
    ui.exportButton.classList.toggle("hidden", !config.rekap || state.results.length === 0);
}

function showScreen(screen) {
    for (const name of ["homeScreen", "examScreen", "resultScreen"]) ui[name].classList.add("hidden");
    ui[screen].classList.remove("hidden");
    document.body.classList.toggle("exam-active", screen === "examScreen");
}

function shuffle(values) {
    const result = values.slice();
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function buildExamQuestions(questionCount = state.config.jumlahSoal) {
    const config = state.config;
    let source = state.questions.map(question => ({ ...question, options: question.options.map(option => ({ ...option })) }));
    if (config.acakNo) source = shuffle(source);
    const selected = source.slice(0, questionCount);
    return selected.map(question => {
        const options = config.acakPilihan ? shuffle(question.options) : question.options.slice();
        return { ...question, options, correctIndex: options.findIndex(option => option.number === question.key) };
    });
}

function startExam(participant = null) {
    const total = state.config.jumlahSoal;
    if (!Number.isInteger(total) || total < 1 || total > state.questions.length) {
        toast(`Jumlah soal harus antara 1 dan ${state.questions.length}.`);
        return;
    }
    if (participant && (!state.config.rekap || !participant.name)) participant = null;

    const questions = buildExamQuestions(total);
    const startedAt = Date.now();
    const hasDeadline = state.config.durasiMenit > 0;
    state.activeExam = {
        participant,
        questions,
        answers: Array(questions.length).fill(null),
        currentIndex: 0,
        startedAt,
        deadline: hasDeadline ? startedAt + state.config.durasiMenit * 60000 : null,
        remainingSeconds: hasDeadline ? Math.ceil(state.config.durasiMenit * 60) : null
    };

    ui.examParticipantName.textContent = participant?.name || "Tanpa nama";
    ui.examQuestionCount.textContent = `${questions.length} SOAL`;
    ui.timerBox.classList.toggle("unlimited", !hasDeadline);
    ui.timerBox.classList.remove("warning");
    ui.timerLabel.textContent = hasDeadline ? "SISA WAKTU" : "DURASI";
    ui.timer.textContent = hasDeadline ? formatClock(state.activeExam.remainingSeconds) : "00:00";
    showScreen("examScreen");
    renderQuestion();
    clearInterval(state.timerId);
    updateTimer();
    state.timerId = setInterval(updateTimer, 1000);
}

function formatClock(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(safe / 60);
    const remaining = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function formatDuration(seconds) {
    const safe = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(safe / 60);
    const remaining = safe % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function updateTimer() {
    const exam = state.activeExam;
    if (!exam) return;
    if (!exam.deadline) {
        ui.timer.textContent = formatClock(getElapsedSeconds(exam));
        return;
    }
    const remaining = Math.max(0, Math.ceil((exam.deadline - Date.now()) / 1000));
    exam.remainingSeconds = remaining;
    ui.timer.textContent = formatClock(remaining);
    ui.timerBox.classList.toggle("warning", remaining <= 60);
    if (remaining <= 0) finishExam(true);
}

function renderQuestion() {
    const exam = state.activeExam;
    if (!exam) return;
    const index = exam.currentIndex;
    const question = exam.questions[index];
    ui.questionNumber.textContent = `SOAL ${index + 1} / ${exam.questions.length}`;
    ui.questionText.textContent = question.question;
    ui.optionsList.replaceChildren();
    question.options.forEach((option, optionIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `option-button${exam.answers[index] === optionIndex ? " selected" : ""}`;
        button.setAttribute("aria-pressed", exam.answers[index] === optionIndex ? "true" : "false");
        const letter = document.createElement("span");
        letter.className = "option-letter";
        letter.textContent = String.fromCharCode(65 + optionIndex);
        const text = document.createElement("span");
        text.className = "option-text";
        text.textContent = option.text;
        button.append(letter, text);
        button.addEventListener("click", () => {
            exam.answers[index] = optionIndex;
            renderQuestion();
        });
        ui.optionsList.append(button);
    });
    ui.prevQuestion.disabled = index === 0;
    ui.nextQuestion.disabled = index === exam.questions.length - 1;
    ui.questionNav.replaceChildren();
    exam.questions.forEach((_, itemIndex) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `nav-button${exam.answers[itemIndex] !== null ? " answered" : ""}${itemIndex === index ? " current" : ""}`;
        button.textContent = String(itemIndex + 1);
        button.addEventListener("click", () => { exam.currentIndex = itemIndex; renderQuestion(); });
        ui.questionNav.append(button);
    });
    const answered = exam.answers.filter(answer => answer !== null).length;
    ui.navProgress.textContent = `${answered}/${exam.questions.length} terjawab`;
    ui.progressFill.style.width = `${answered / exam.questions.length * 100}%`;
}

function getElapsedSeconds(exam) {
    return Math.max(0, Math.round((Date.now() - exam.startedAt) / 1000));
}

function finishExam(timeExpired = false) {
    const exam = state.activeExam;
    if (!exam) return;
    clearInterval(state.timerId);
    state.timerId = null;
    const total = exam.questions.length;
    const blank = exam.answers.filter(answer => answer === null).length;
    let correct = 0;
    exam.answers.forEach((answer, index) => {
        if (answer !== null && answer === exam.questions[index].correctIndex) correct++;
    });
    const wrong = total - correct - blank;
    const score = Math.round(correct / total * 100);
    const elapsedSeconds = getElapsedSeconds(exam);
    const participant = exam.participant;
    const result = {
        n: participant?.n || "",
        n2: participant?.n2 || "",
        nisn: participant?.nisn || "",
        nama: participant?.name || "",
        jk: participant?.gender || "",
        rombel: participant?.rombel || "",
        benar: correct,
        salah: wrong,
        kosong: blank,
        nilai: score,
        durasi: formatDuration(elapsedSeconds),
        waktu: new Date().toLocaleString("id-ID")
    };
    state.result = { ...result, total, elapsedSeconds, timeExpired };

    const savedToRecap = Boolean(participant && state.config.rekap);
    if (savedToRecap) {
        state.results.push(result);
        persistResults();
    }
    renderResult(savedToRecap);
    showScreen("resultScreen");
    state.activeExam = null;
    renderSettings();
}

function renderResult(savedToRecap) {
    const result = state.result;
    ui.resultTitle.textContent = result.nama || "Ujian selesai";
    ui.resultSubtitle.textContent = result.timeExpired
        ? "Waktu habis. Jawaban yang terisi telah dikumpulkan otomatis."
        : "Jawaban telah dikumpulkan.";
    ui.scoreValue.textContent = String(result.nilai);
    ui.scoreFraction.textContent = `${result.benar} dari ${result.total} soal benar`;
    ui.correctValue.textContent = String(result.benar);
    ui.wrongValue.textContent = String(result.salah);
    ui.blankValue.textContent = String(result.kosong);
    ui.elapsedValue.textContent = result.durasi;
    ui.recapNotice.classList.remove("hidden");
    ui.recapNotice.textContent = savedToRecap
        ? "Hasil peserta berhasil dicatat ke rekap."
        : "Ujian tanpa identitas. Hasil hanya ditampilkan dan tidak dicatat ke rekap.";
}

function renderParticipants(filter = "") {
    const query = filter.trim().toLocaleLowerCase("id-ID");
    const matching = state.participants.filter(person => [person.name, person.nisn, person.rombel].join(" ").toLocaleLowerCase("id-ID").includes(query));
    const previous = ui.studentSelect.value;
    ui.studentSelect.replaceChildren();
    for (const person of matching) {
        const option = document.createElement("option");
        option.value = String(state.participants.indexOf(person));
        option.textContent = person.rombel ? `${person.name}  ·  ${person.rombel}` : person.name;
        ui.studentSelect.append(option);
    }
    ui.studentCount.textContent = state.participants.length ? `${state.participants.length} peserta` : "";
    if ([...ui.studentSelect.options].some(option => option.value === previous)) ui.studentSelect.value = previous;
    else ui.studentSelect.selectedIndex = -1;
    updateSelectedStudent();
}

function updateSelectedStudent() {
    const selected = ui.studentSelect.value;
    if (selected === "" || !state.participants[Number(selected)]) {
        ui.selectedStudent.textContent = "Belum memilih nama.";
        ui.startExamButton.disabled = true;
        return;
    }
    const person = state.participants[Number(selected)];
    ui.selectedStudent.textContent = person.name;
    ui.startExamButton.disabled = false;
}

function escapeXml(value) {
    return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(number) {
    let result = "";
    while (number > 0) {
        const remainder = (number - 1) % 26;
        result = String.fromCharCode(65 + remainder) + result;
        number = Math.floor((number - 1) / 26);
    }
    return result;
}

function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
    return (crc ^ -1) >>> 0;
}

function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

function makeZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    for (const [name, content] of files) {
        const nameBytes = encoder.encode(name);
        const data = encoder.encode(content);
        const checksum = crc32(data);
        const local = new Uint8Array(30 + nameBytes.length + data.length);
        const localView = new DataView(local.buffer);
        write32(localView, 0, 0x04034b50);
        write16(localView, 4, 20);
        write16(localView, 6, 0x0800);
        write16(localView, 8, 0);
        write16(localView, 10, dosTime);
        write16(localView, 12, dosDate);
        write32(localView, 14, checksum);
        write32(localView, 18, data.length);
        write32(localView, 22, data.length);
        write16(localView, 26, nameBytes.length);
        write16(localView, 28, 0);
        local.set(nameBytes, 30);
        local.set(data, 30 + nameBytes.length);
        localParts.push(local);

        const central = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(central.buffer);
        write32(centralView, 0, 0x02014b50);
        write16(centralView, 4, 20);
        write16(centralView, 6, 20);
        write16(centralView, 8, 0x0800);
        write16(centralView, 10, 0);
        write16(centralView, 12, dosTime);
        write16(centralView, 14, dosDate);
        write32(centralView, 16, checksum);
        write32(centralView, 20, data.length);
        write32(centralView, 24, data.length);
        write16(centralView, 28, nameBytes.length);
        write16(centralView, 30, 0);
        write16(centralView, 32, 0);
        write16(centralView, 34, 0);
        write16(centralView, 36, 0);
        write32(centralView, 38, 0);
        write32(centralView, 42, localOffset);
        central.set(nameBytes, 46);
        centralParts.push(central);
        localOffset += local.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    write32(endView, 0, 0x06054b50);
    write16(endView, 4, 0);
    write16(endView, 6, 0);
    write16(endView, 8, files.length);
    write16(endView, 10, files.length);
    write32(endView, 12, centralSize);
    write32(endView, 16, localOffset);
    write16(endView, 20, 0);
    return new Blob([...localParts, ...centralParts, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function buildWorksheetXml(rows) {
    const columnWidths = [8, 10, 18, 32, 9, 15, 11, 11, 11, 11, 15, 23];
    const cols = columnWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const rowXml = rows.map((row, rowIndex) => {
        const cells = row.map((value, colIndex) => {
            if (value === null || value === undefined || value === "") return "";
            const ref = `${columnName(colIndex + 1)}${rowIndex + 1}`;
            if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${rowIndex === 0 ? " s=\"1\"" : ""} t="n"><v>${value}</v></c>`;
            return `<c r="${ref}"${rowIndex === 0 ? " s=\"1\"" : ""} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
        }).join("");
        return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    const lastRow = Math.max(1, rows.length);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:L${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:L${lastRow}"/></worksheet>`;
}

function makeRecapWorkbook() {
    const rows = [["N", "N2", "NISN", "NAMA", "JK", "C", "BENAR", "SALAH", "KOSONG", "NILAI", "DURASI", "WAKTU"]];
    for (const result of state.results) {
        rows.push([
            result.n, result.n2, result.nisn, result.nama, result.jk, result.rombel,
            result.benar, result.salah, result.kosong, result.nilai, result.durasi, result.waktu
        ]);
    }
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rekap_Ujian" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const sheetXml = buildWorksheetXml(rows);
    return makeZip([
        ["[Content_Types].xml", contentTypes],
        ["_rels/.rels", rootRels],
        ["xl/workbook.xml", workbookXml],
        ["xl/_rels/workbook.xml.rels", workbookRels],
        ["xl/styles.xml", stylesXml],
        ["xl/worksheets/sheet1.xml", sheetXml]
    ]);
}

function exportRecap() {
    if (!state.config.rekap || state.results.length === 0) return;
    const blob = makeRecapWorkbook();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date();
    const fileStamp = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}_${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}`;
    link.href = url;
    link.download = `Rekap_Ujian_${fileStamp}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast(`Rekap ${state.results.length} hasil berhasil disiapkan.`);
}

async function loadWorkbook(file) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
        ui.fileStatus.textContent = "Format file harus .xlsx. Simpan workbook sebagai Excel Workbook (*.xlsx).";
        return;
    }
    if (file.size > 25 * 1024 * 1024) {
        ui.fileStatus.textContent = "Ukuran file melebihi batas 25 MB.";
        return;
    }

    ui.fileStatus.textContent = `Membaca ${file.name}…`;
    try {
        const buffer = await file.arrayBuffer();
        const workbook = await openXlsx(buffer);
        const questions = parseQuestions(await readWorksheet(workbook, state.config.sheetSoal));
        if (state.config.rekap && state.config.jumlahSoal > questions.length) {
            throw new Error(`jumlah_soal=${state.config.jumlahSoal}, tetapi soal valid hanya ${questions.length}. Kurangi jumlah_soal atau lengkapi bank soal.`);
        }

        state.workbook = workbook;
        state.workbookHash = hashWorkbook(buffer);
        state.config.fileExcel = file.name;
        state.questions = questions;
        state.participants = [];
        state.participantError = "";
        if (state.config.rekap && state.config.sheetPeserta) {
            try {
                const participantRows = await readWorksheet(workbook, state.config.sheetPeserta);
                state.participants = parseParticipants(participantRows);
            } catch (error) {
                state.participantError = error.message;
            }
        } else if (state.config.rekap) {
            state.participantError = "Nama peserta belum diaktifkan karena sheet_peserta belum diatur.";
        }

        prepareStorage();
        renderParticipants("");
        renderSettings();
        ui.filePanel.classList.add("hidden");
        ui.appPanel.classList.remove("hidden");
        ui.pageTitle.textContent = "Mulai Ujian";
        ui.pageSubtitle.textContent = state.config.rekap
            ? "Pilih nama bila ingin mencatat hasil, atau mulai tanpa nama."
            : "Mulai tanpa nama untuk melihat nilai tanpa menyimpan rekap.";
        ui.statusLabel.textContent = "SIAP";
    } catch (error) {
        state.workbook = null;
        state.questions = [];
        state.participants = [];
        state.participantError = "";
        state.workbookHash = "";
        ui.fileStatus.textContent = `File belum dapat digunakan: ${error.message}`;
        ui.pageTitle.textContent = "Pilih file Excel";
        ui.pageSubtitle.textContent = "Pilih workbook .xlsx yang sesuai dengan template.";
        ui.statusLabel.textContent = "PILIH FILE";
    }
}

async function initialize() {
    try {
        ui.loadingText.textContent = "Membaca pengaturan.txt…";
        const globalConfig = await fetchText("../Global/config.txt");
        const modeSetting = globalConfig.split(/\r?\n/).map(line => line.trim()).find(line => /^mode\s*;/i.test(line));
        state.mode = modeSetting ? modeSetting.slice(modeSetting.indexOf(";") + 1).trim().toUpperCase() : "";
        if (!["UH", "UJ"].includes(state.mode)) throw new Error("Global/config.txt harus berisi mode;UH atau mode;UJ.");
        const configText = await fetchText(`../${state.mode}/config_${state.mode}.txt`);
        state.config = parseConfig(configText, state.mode);
        ui.loadingPanel.classList.add("hidden");
        ui.filePanel.classList.remove("hidden");
        ui.pageTitle.textContent = "Siapkan file ujian";
        ui.pageSubtitle.textContent = "Unduh template Excel atau pilih workbook yang sudah disiapkan.";
        ui.statusLabel.textContent = "PILIH FILE";
        ui.fileStatus.textContent = `Worksheet soal: ${state.config.sheetSoal}. ${state.config.rekap && state.config.sheetPeserta ? `Worksheet peserta: ${state.config.sheetPeserta}.` : "Identitas peserta bersifat opsional."}`;
    } catch (error) {
        showError(error.message || "Terjadi kesalahan saat membaca pengaturan.");
    }
}

async function refreshAppCache() {
    try {
        if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.filter(key => key.startsWith("uh-")).map(key => caches.delete(key)));
        }
        if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            const basePath = location.pathname.replace(/[^/]*$/, "");
            await Promise.all(registrations.filter(reg => new URL(reg.scope).pathname.startsWith(basePath)).map(reg => reg.unregister()));
        }
    } finally {
        const url = new URL(location.href);
        url.searchParams.set("_r", Date.now());
        location.replace(url.href);
    }
}

$("refreshCacheButton").addEventListener("click", refreshAppCache);

ui.workbookInput.addEventListener("change", () => {
    loadWorkbook(ui.workbookInput.files?.[0]);
});
ui.anonymousStartButton.addEventListener("click", () => startExam(null));
ui.studentSearch.addEventListener("input", () => renderParticipants(ui.studentSearch.value));
ui.studentSelect.addEventListener("change", updateSelectedStudent);
ui.startExamButton.addEventListener("click", () => {
    const participant = state.participants[Number(ui.studentSelect.value)];
    if (participant) startExam(participant);
});
ui.prevQuestion.addEventListener("click", () => {
    if (!state.activeExam || state.activeExam.currentIndex <= 0) return;
    state.activeExam.currentIndex--;
    renderQuestion();
});
ui.nextQuestion.addEventListener("click", () => {
    if (!state.activeExam || state.activeExam.currentIndex >= state.activeExam.questions.length - 1) return;
    state.activeExam.currentIndex++;
    renderQuestion();
});
ui.finishExamButton.addEventListener("click", () => {
    if (!state.activeExam) return;
    const blank = state.activeExam.answers.filter(answer => answer === null).length;
    const message = blank ? `Masih ada ${blank} soal kosong. Selesaikan ujian sekarang?` : "Selesaikan ujian sekarang?";
    if (window.confirm(message)) finishExam(false);
});
$("backHomeButton").addEventListener("click", () => {
    state.result = null;
    ui.studentSelect.selectedIndex = -1;
    ui.studentSearch.value = "";
    renderParticipants("");
    showScreen("homeScreen");
    renderSettings();
});
ui.exportButton.addEventListener("click", exportRecap);

initialize();
