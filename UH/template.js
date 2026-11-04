"use strict";

function templateEscape(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function templateWorksheet(rows, widths, filter = true) {
    const cols = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const data = rows.map((row, rowIndex) => {
        const cells = row.map((value, colIndex) => {
            if (value === null || value === undefined || value === "") return "";
            const ref = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
            return `<c r="${ref}"${rowIndex === 0 ? ' s="1"' : ""} t="inlineStr"><is><t xml:space="preserve">${templateEscape(value)}</t></is></c>`;
        }).join("");
        return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join("");
    const lastCol = String.fromCharCode(64 + widths.length);
    const lastRow = Math.max(1, rows.length);
    const autoFilter = filter ? `<autoFilter ref="A1:${lastCol}1"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/><cols>${cols}</cols><sheetData>${data}</sheetData>${autoFilter}</worksheet>`;
}

function makeTemplateWorkbook() {
    const sheets = [
        { name: "Soal", rows: [["N", "Q", "K", "1", "2", "3", "4", "5", "6"]], widths: [9, 48, 9, 24, 24, 24, 24, 24, 24] },
        { name: "Peserta", rows: [["N", "N2", "NISN", "NAMA", "JK", "C"]], widths: [9, 9, 20, 36, 10, 20] },
        {
            name: "Petunjuk",
            rows: [
                ["BAGIAN", "KETERANGAN"],
                ["Soal", "Isi satu soal pada setiap baris worksheet Soal."],
                ["N", "Nomor soal. Setiap nomor harus unik."],
                ["Q", "Teks pertanyaan."],
                ["K", "Nomor pilihan yang benar, berupa angka 1 sampai 6."],
                ["1–6", "Teks pilihan jawaban. Minimal dua pilihan harus terisi."],
                ["Peserta", "Data peserta bersifat opsional jika rekap diaktifkan."],
                ["NISN", "Nomor identitas peserta. Wajib diisi untuk setiap peserta."],
                ["NAMA", "Nama lengkap peserta."],
                ["N, N2, JK, C", "Kolom tambahan: nomor, nomor kelas, jenis kelamin, dan kelas/rombel."]
            ],
            widths: [22, 82]
        }
    ];
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, i) => `<sheet name="${sheet.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`;
    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B4B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const files = [
        ["[Content_Types].xml", contentTypes],
        ["_rels/.rels", rootRels],
        ["xl/workbook.xml", workbookXml],
        ["xl/_rels/workbook.xml.rels", workbookRels],
        ["xl/styles.xml", stylesXml]
    ];
    sheets.forEach((sheet, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, templateWorksheet(sheet.rows, sheet.widths, i < 2)]));
    return makeZip(files);
}

function downloadExamTemplate() {
    const blob = makeTemplateWorkbook();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "Template_UjianHarian.xlsx";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

document.getElementById("btnTemplate")?.addEventListener("click", downloadExamTemplate);
