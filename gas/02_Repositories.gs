/**
 * ============================================================================
 * LAYER: INFRASTRUCTURE — Repository (adapter Google Sheets)
 * Service tidak mengetahui Sheets; ia hanya memakai antarmuka repository
 * (port). Mengganti ke Firestore/Postgres cukup dengan repository baru.
 * ============================================================================
 */
const Db = (() => {
  let spreadsheet;
  return {
    spreadsheet() {
      if (!spreadsheet) {
        const id = Config.spreadsheetId();
        spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
        if (!spreadsheet) throw new AppError('server', 'Spreadsheet tidak ditemukan. Atur SPREADSHEET_ID atau gunakan script terikat.');
      }
      return spreadsheet;
    },
    sheet(name) {
      const sheet = this.spreadsheet().getSheetByName(name);
      if (!sheet) throw new AppError('server', 'Sheet "' + name + '" belum ada. Jalankan setup().');
      return sheet;
    },
  };
})();

/**
 * Repository generik berbasis baris. Pencarian memakai TextFinder pada kolom
 * kunci (berlaku seperti index → tidak membaca seluruh sheet).
 */
class SheetRepository {
  constructor(sheetName) {
    this.sheetName = sheetName;
    this.columns = SCHEMA[sheetName];
  }

  get sheet() {
    return Db.sheet(this.sheetName);
  }

  toEntity(row, rowNumber) {
    const entity = { _row: rowNumber };
    this.columns.forEach((col, i) => (entity[col] = row[i] instanceof Date ? row[i].toISOString() : row[i]));
    return entity;
  }

  toRow(entity) {
    return this.columns.map((col) => Sanitize.cell(entity[col] === undefined ? '' : entity[col]));
  }

  /** Cari satu entitas berdasarkan nilai persis pada kolom tertentu. */
  findOneBy(column, value) {
    if (value === undefined || value === null || value === '') return null;
    const colIndex = this.columns.indexOf(column) + 1;
    const lastRow = this.sheet.getLastRow();
    if (lastRow < 2) return null;
    const cell = this.sheet
      .getRange(2, colIndex, lastRow - 1, 1)
      .createTextFinder(String(value))
      .matchEntireCell(true)
      .matchCase(true)
      .findNext();
    if (!cell) return null;
    const rowNumber = cell.getRow();
    return this.toEntity(this.sheet.getRange(rowNumber, 1, 1, this.columns.length).getValues()[0], rowNumber);
  }

  findAll() {
    const lastRow = this.sheet.getLastRow();
    if (lastRow < 2) return [];
    return this.sheet
      .getRange(2, 1, lastRow - 1, this.columns.length)
      .getValues()
      .map((row, i) => this.toEntity(row, i + 2));
  }

  insert(entity) {
    this.sheet.appendRow(this.toRow(entity));
    return entity;
  }

  update(entity) {
    if (!entity._row) throw new AppError('server', 'Entitas tanpa nomor baris tidak dapat diperbarui.');
    this.sheet.getRange(entity._row, 1, 1, this.columns.length).setValues([this.toRow(entity)]);
    return entity;
  }

  remove(entity) {
    if (entity && entity._row) this.sheet.deleteRow(entity._row);
  }

  /** Bulk delete efisien: tulis ulang baris yang dipertahankan dalam satu operasi. */
  removeWhere(predicate) {
    const all = this.findAll();
    const keep = all.filter((e) => !predicate(e));
    if (keep.length === all.length) return 0;
    const sheet = this.sheet;
    sheet.getRange(2, 1, Math.max(all.length, 1), this.columns.length).clearContent();
    if (keep.length) sheet.getRange(2, 1, keep.length, this.columns.length).setValues(keep.map((e) => this.toRow(e)));
    return all.length - keep.length;
  }
}

/* -------------------------- Repository spesifik -------------------------- */
class UserRepository extends SheetRepository {
  constructor() {
    super('Users');
  }
  findByEmail(email) {
    return this.findOneBy('email', email);
  }
  findById(id) {
    return this.findOneBy('id', id);
  }
  /** Optimistic locking: tolak pembaruan bila versi sudah berubah. */
  save(user) {
    const current = user._row ? this.toEntity(this.sheet.getRange(user._row, 1, 1, this.columns.length).getValues()[0], user._row) : null;
    if (current && Number(current.version) !== Number(user.version)) throw new AppError('busy', 'Data berubah bersamaan. Coba lagi.');
    user.version = Number(user.version || 0) + 1;
    user.updatedAt = nowIso();
    return current ? this.update(user) : this.insert(user);
  }
}

class OtpRepository extends SheetRepository {
  constructor() {
    super('Otps');
  }
  find(email, purpose) {
    return this.findOneBy('key', purpose + ':' + email);
  }
  upsert(record) {
    const existing = this.find(record.email, record.purpose);
    record.key = record.purpose + ':' + record.email;
    if (existing) {
      record._row = existing._row;
      return this.update(record);
    }
    return this.insert(record);
  }
}

class SessionRepository extends SheetRepository {
  constructor() {
    super('Sessions');
  }
  findByTokenHash(tokenHash) {
    return this.findOneBy('tokenHash', tokenHash);
  }
  removeByUser(userId) {
    return this.removeWhere((s) => s.userId === userId);
  }
}

class AuditRepository extends SheetRepository {
  constructor() {
    super('AuditLog');
  }
  record(entry) {
    try {
      this.insert(Object.assign({ timestamp: nowIso() }, entry));
    } catch (error) {
      Log.error('audit.failed', error); // audit tidak boleh menggagalkan proses utama
    }
  }
}
