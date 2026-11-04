UJIAN HARIAN — MODUL 05
=======================

MENJALANKAN APLIKASI
1. Simpan dan ekstrak folder aplikasi secara utuh.
2. Klik dua kali Buka_Ujian.bat.
3. Browser akan membuka aplikasi pada alamat lokal 127.0.0.1:8765.
4. Pada halaman awal, unduh template Excel baku atau pilih workbook .xlsx yang telah disiapkan.
5. Klik Muat workbook.
6. Setelah bank soal terbaca, mulai ujian tanpa nama atau pilih nama peserta.
7. Akhiri pengerjaan dengan tombol Selesai. Jangan tutup jendela server sebelum selesai.

KONSEP PENGERJAAN
- Tidak ada lagi mode DEMO dan ULANGAN.
- Mulai tanpa nama: soal tetap dikerjakan dan nilai ditampilkan, tetapi hasil tidak dicatat ke rekap.
- Mulai dengan nama peserta: hasil dikaitkan dengan identitas dan dimasukkan ke rekap, jika rekap=1.
- Kedua jalur menggunakan jumlah soal, pengacakan, dan aturan waktu yang sama.
- Tombol Selesai tersedia selama pengerjaan. Jika masih ada soal kosong, aplikasi meminta konfirmasi.
- Setiap percobaan bernama dicatat sebagai baris baru; belum ada pembatasan pengulangan peserta.

PENGATURAN.TXT
Format setiap baris adalah parameter;nilai. File Excel dipilih manual melalui browser.

sheet_soal;Soal            Nama worksheet bank soal.
sheet_peserta;Peserta      Nama worksheet peserta. Dibaca jika rekap=1.
jumlah_soal;20             Jumlah soal pada setiap pengerjaan.
durasi;30                  Batas waktu dalam menit. Isi 0 untuk tanpa batas.
acak_no;1                  1 = urutan soal diacak; 0 = mengikuti urutan Excel.
acak_pilihan;1             1 = posisi pilihan diacak dan kunci mengikuti; 0 = urutan tetap.
rekap;1                    1 = aktifkan pemilihan nama dan penyimpanan rekap; 0 = matikan identitas dan rekap.

Gunakan hanya angka 0 atau 1 untuk acak_no, acak_pilihan, dan rekap.
Jika rekap=1 tetapi sheet peserta belum ada/masih kosong, ujian tanpa nama tetap dapat dijalankan.
Jika durasi=0, jam pada halaman pengerjaan menghitung waktu yang telah berlalu.

TEMPLATE EXCEL
- Template_UjianHarian.xlsx disediakan di folder aplikasi dan dapat diunduh dari halaman pembuka.
- Sheet Soal: N | Q | K | 1 | 2 | 3 | 4 | 5 | 6
  N = nomor unik; Q = teks soal; K = nomor pilihan benar (1–6); 1–6 = teks pilihan.
- Sheet Peserta: N | N2 | NISN | NAMA | JK | C
  N = nomor global; N2 = nomor per rombel; NISN = nomor induk; NAMA = nama; JK = jenis kelamin; C = rombongan belajar.
- Sheet Petunjuk berisi ringkasan pengisian.
- Sheet Peserta boleh dibiarkan kosong jika ujian dilakukan tanpa nama.
- Jangan mengubah nama dan susunan header kolom.
- NISN disarankan disimpan sebagai teks agar angka nol di depan tetap terjaga.

REKAP
- Hanya pengerjaan yang dimulai dengan nama peserta yang masuk rekap.
- Hasil tanpa nama tidak dicatat.
- Hasil bernama disimpan sementara pada penyimpanan browser untuk workbook dan tanggal yang sama.
- Gunakan tombol Unduh Rekap Excel pada halaman awal untuk mencadangkan hasil.
- File rekap terpisah; workbook sumber tidak diubah.

PENGACAKAN
- acak_no=1: aplikasi memilih sejumlah soal secara acak dari seluruh bank.
- acak_no=0: aplikasi mengambil soal sesuai urutan Excel.
- acak_pilihan=1: pilihan diacak per soal; kunci jawaban mengikuti posisi baru.
- acak_pilihan=0: pilihan mengikuti urutan kolom Excel.

CATATAN
- Aplikasi berjalan lokal dan tidak mengirim data ke internet.
- Diperlukan Python 3 untuk menjalankan server lokal melalui BAT.
- Browser yang disarankan: Chrome atau Microsoft Edge modern.
- File sumber harus berformat .xlsx.
