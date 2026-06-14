// ==========================================
//  KONFIGURASI UTAMA
//  GANTI DENGAN ID FOLDER GOOGLE DRIVE ANDA
// ==========================================
const MAIN_FOLDER_ID = "1db6W-oWkpu51jZS8kupUF6mGTbfHUYiO";

// ==========================================
//  ENDPOINT HANDLER
// ==========================================
function doGet(e) {
  return ContentService.createTextOutput("Method GET Not Allowed").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var data = {};

  // Mengambil data dari JSON mentah (karena foto wajah menggunakan payload JSON besar)
  if (e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      data = e.parameter;
    }
  } else {
    data = e.parameter;
  }

  var action = data.action;

  if (action === 'register') {
    return handleRegister(data);
  } else if (action === 'login') {
    return handleLogin(data);
  } else if (action === 'upload') {
    return handleFileUpload(data);
  } else if (action === 'getHistory') {
    return handleGetHistory(data);
  }

  return createResponse({ status: "FAILED", message: "Aksi tidak dikenali" });
}

// ==========================================
//  1. FUNGSI REGISTRASI + SIMPAN FOTO WAJIB
// ==========================================
function handleRegister(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Users");

  if (!sheet) {
    // Buat sheet Users jika belum ada
    sheet = ss.insertSheet("Users");
    sheet.getRange("A1:K1").setValues([[
      "Tanggal Daftar", "Nama", "No HP", "Email", "NIP",
      "Password", "Sheet Name", "Foto URL", "Jenis Kelamin",
      "Status Kepegawaian", "Asal Sekolah"
    ]]);
    sheet.getRange("A1:K1").setFontWeight("bold").setBackground("#016b39").setFontColor("white").setHorizontalAlignment("center");
  }

  const cleanNip = data.nip.toString().trim();
  const sheetName = data.nama.replace(/[^a-zA-Z0-9]/g, "_") + "_" + cleanNip;

  // Cek apakah NIP sudah terdaftar
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][4].toString().replace(/['\s]/g, "") === cleanNip) {
      return createResponse({ status: "FAILED", message: "NIP sudah terdaftar di sistem!" });
    }
  }

  let fotoUrl = "Tidak ada foto";

  // PROSES PEMBUATAN FOLDER & PENYIMPANAN FOTO WAJAH KE DRIVE
  try {
    const mainFolder = DriveApp.getFolderById(MAIN_FOLDER_ID);

    // Cari atau buat folder personal user
    const folders = mainFolder.getFoldersByName(sheetName);
    let targetFolder;
    if (folders.hasNext()) {
      targetFolder = folders.next();
    } else {
      targetFolder = mainFolder.createFolder(sheetName);
    }

    // Simpan data string base64 foto wajah ke Drive
    if (data.fotoWajah && data.fotoWajah.includes("base64,")) {
      const contentType = data.fotoWajah.substring(data.fotoWajah.indexOf(":") + 1, data.fotoWajah.indexOf(";"));
      const base64Data = data.fotoWajah.substring(data.fotoWajah.indexOf(",") + 1);
      const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, "Foto_Wajah_" + cleanNip + ".jpg");

      const fileFoto = targetFolder.createFile(blob);
      fileFoto.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fotoUrl = fileFoto.getUrl();
    } else {
      return createResponse({ status: "FAILED", message: "Data foto wajah tidak valid atau kosong!" });
    }

    // Buat Sheet baru khusus untuk riwayat user tersebut jika belum ada
    let newUserSheet = ss.getSheetByName(sheetName);
    if (!newUserSheet) {
      newUserSheet = ss.insertSheet(sheetName);
      newUserSheet.getRange("A1:E1").setValues([["Tanggal Upload", "Kategori Layanan", "Nama Berkas", "Link Google Drive", "Status"]]);
      newUserSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#016b39").setFontColor("white").setHorizontalAlignment("center");
      newUserSheet.setColumnWidth(1, 150);
      newUserSheet.setColumnWidth(2, 150);
      newUserSheet.setColumnWidth(3, 200);
      newUserSheet.setColumnWidth(4, 350);
      newUserSheet.setColumnWidth(5, 100);
    }

  } catch (e) {
    return createResponse({ status: "ERROR", message: "Gagal memproses media penyimpanan Drive: " + e.toString() });
  }

  // Masukkan data lengkap beserta LINK FOTO WAJAH ke sheet 'Users'
  // Kolom: Tanggal | Nama | HP | Email | NIP | Password | SheetName | FotoURL | JK | Status | Sekolah
  sheet.appendRow([
    new Date(),
    data.nama,
    "'" + data.hp,
    data.email,
    "'" + cleanNip,
    data.password,
    sheetName,
    fotoUrl,
    data.jk || "Tidak diisi",
    data.statusKepegawaian || "Tidak diisi",
    data.sekolah || "Tidak diisi"
  ]);

  return createResponse({ status: "SUCCESS", message: "Registrasi Berhasil" });
}

// ==========================================
//  2. FUNGSI LOGIN
// ==========================================
function handleLogin(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");

  if (!userSheet) {
    return createResponse({ status: "ERROR", message: "Database Users belum siap. Silahkan daftar terlebih dahulu." });
  }

  const rows = userSheet.getDataRange().getValues();
  const inputNip = data.nip.toString().trim();
  const inputPass = data.password.toString();

  for (let i = 1; i < rows.length; i++) {
    let sheetNip = rows[i][4].toString().replace(/['\s]/g, "");
    let sheetPass = rows[i][5].toString();

    if (sheetNip === inputNip && sheetPass === inputPass) {
      const sheetName = rows[i][6];
      const personalSheet = ss.getSheetByName(sheetName);
      let history = [];

      if (personalSheet) {
        const pRows = personalSheet.getDataRange().getValues();
        for (let j = 1; j < pRows.length; j++) {
          // Format tanggal konsisten yyyy-MM-dd
          let tanggalStr = "";
          if (pRows[j][0] instanceof Date) {
            tanggalStr = Utilities.formatDate(pRows[j][0], "GMT+8", "yyyy-MM-dd HH:mm:ss");
          } else {
            tanggalStr = pRows[j][0].toString();
          }

          history.push({
            tanggal: tanggalStr,
            layanan: pRows[j][1],
            namaBerkas: pRows[j][2],
            link: pRows[j][3],
            status: pRows[j][4]
          });
        }
      }

      return createResponse({
        status: "SUCCESS",
        user: { nip: sheetNip, nama: rows[i][1], sheetName: sheetName },
        history: history
      });
    }
  }
  return createResponse({ status: "FAILED", message: "NIP atau Password salah!" });
}

// ==========================================
//  3. FUNGSI UPLOAD BERKAS KE DRIVE & SHEET
// ==========================================
function handleFileUpload(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const personalSheet = ss.getSheetByName(data.sheetName);

  if (!personalSheet) {
    return createResponse({ status: "ERROR", message: "Sheet data pengajar tidak ditemukan." });
  }

  const mainFolder = DriveApp.getFolderById(MAIN_FOLDER_ID);
  const folders = mainFolder.getFoldersByName(data.sheetName);
  let targetFolder;
  if (folders.hasNext()) {
    targetFolder = folders.next();
  } else {
    targetFolder = mainFolder.createFolder(data.sheetName);
  }

  const contentType = data.fileData.substring(data.fileData.indexOf(":") + 1, data.fileData.indexOf(";"));
  const base64Data = data.fileData.substring(data.fileData.indexOf(",") + 1);
  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, data.fileName);

  const file = targetFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const fileUrl = file.getUrl();

  const formattedDate = Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd HH:mm:ss");

  personalSheet.appendRow([
    formattedDate,
    data.layanan,
    data.berkasType,
    fileUrl,
    "Sukses"
  ]);

  return createResponse({
    status: "SUCCESS",
    fileUrl: fileUrl,
    tanggal: formattedDate
  });
}

// ==========================================
//  4. FUNGSI GET HISTORY (UNTUK KALENDER)
// ==========================================
function handleGetHistory(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const personalSheet = ss.getSheetByName(data.sheetName);

  if (!personalSheet) {
    return createResponse({ status: "SUCCESS", history: [] });
  }

  const pRows = personalSheet.getDataRange().getValues();
  let history = [];

  for (let j = 1; j < pRows.length; j++) {
    let tanggalStr = "";
    if (pRows[j][0] instanceof Date) {
      tanggalStr = Utilities.formatDate(pRows[j][0], "GMT+8", "yyyy-MM-dd HH:mm:ss");
    } else {
      tanggalStr = pRows[j][0].toString();
    }

    history.push({
      tanggal: tanggalStr,
      layanan: pRows[j][1],
      namaBerkas: pRows[j][2],
      link: pRows[j][3],
      status: pRows[j][4]
    });
  }

  return createResponse({
    status: "SUCCESS",
    history: history
  });
}

// ==========================================
//  HELPER: CREATE JSON RESPONSE
// ==========================================
function createResponse(object) {
  return ContentService.createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}