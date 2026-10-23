import mysql from "mysql2/promise";

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "elearning_portal",
  multipleStatements: false
};

const YEAR = 2026;
const TERM = "Term 3";
const PAY_START = "2026-09-08";
const PAY_END = "2026-12-04";

const feeStructure = [
  ["ECD A", 80],
  ["ECD B", 85],
  ["Grade 1", 100],
  ["Grade 2", 110],
  ["Grade 3", 120],
  ["Grade 4", 130],
  ["Grade 5", 140],
  ["Grade 6", 150],
  ["Grade 7", 160]
];

const classes = [
  { code: "FIN-ECD-A", name: "ECD A Finance Test", formLevel: "ECD A", room: "A1" },
  { code: "FIN-ECD-B", name: "ECD B Finance Test", formLevel: "ECD B", room: "B1" },
  { code: "FIN-G1", name: "Grade 1 Finance Test", formLevel: "Grade 1", room: "G1" },
  { code: "FIN-G2", name: "Grade 2 Finance Test", formLevel: "Grade 2", room: "G2" },
  { code: "FIN-G3", name: "Grade 3 Finance Test", formLevel: "Grade 3", room: "G3" },
  { code: "FIN-G4", name: "Grade 4 Finance Test", formLevel: "Grade 4", room: "G4" },
  { code: "FIN-G5", name: "Grade 5 Finance Test", formLevel: "Grade 5", room: "G5" },
  { code: "FIN-G6", name: "Grade 6 Finance Test", formLevel: "Grade 6", room: "G6" },
  { code: "FIN-G7", name: "Grade 7 Finance Test", formLevel: "Grade 7", room: "G7" }
];

const students = [
  ["TESTFIN001", "Aaliyah", "Moyo", "ECD A", "2019-04-12", "FIN-TST-0001", 0],
  ["TESTFIN002", "Tadiwa", "Ncube", "ECD A", "2019-08-03", "FIN-TST-0002", 40],
  ["TESTFIN003", "Nyasha", "Dube", "ECD B", "2018-02-19", "FIN-TST-0003", "full"],
  ["TESTFIN004", "Kudakwashe", "Sibanda", "ECD B", "2018-11-24", "FIN-TST-0004", 20],
  ["TESTFIN005", "Ruvimbo", "Chirwa", "Grade 1", "2017-05-14", "FIN-TST-0005", 0],
  ["TESTFIN006", "Farai", "Gumbo", "Grade 1", "2017-07-27", "FIN-TST-0006", "full"],
  ["TESTFIN007", "Munashe", "Zhou", "Grade 2", "2016-01-31", "FIN-TST-0007", 65],
  ["TESTFIN008", "Anesu", "Maposa", "Grade 2", "2016-09-09", "FIN-TST-0008", 0],
  ["TESTFIN009", "Tanaka", "Madziva", "Grade 3", "2015-03-18", "FIN-TST-0009", "full"],
  ["TESTFIN010", "Ashley", "Mutasa", "Grade 3", "2015-12-02", "FIN-TST-0010", 75],
  ["TESTFIN011", "Blessing", "Nyoni", "Grade 4", "2014-06-21", "FIN-TST-0011", 30],
  ["TESTFIN012", "Makanaka", "Chikore", "Grade 4", "2014-10-16", "FIN-TST-0012", "full"],
  ["TESTFIN013", "Simba", "Marufu", "Grade 5", "2013-02-25", "FIN-TST-0013", 0],
  ["TESTFIN014", "Rutendo", "Banda", "Grade 5", "2013-08-30", "FIN-TST-0014", 95],
  ["TESTFIN015", "Tinashe", "Mare", "Grade 6", "2012-04-08", "FIN-TST-0015", "full"],
  ["TESTFIN016", "Chiedza", "Tembo", "Grade 6", "2012-11-11", "FIN-TST-0016", 50],
  ["TESTFIN017", "Shamiso", "Makoni", "Grade 7", "2011-01-20", "FIN-TST-0017", 0],
  ["TESTFIN018", "Takudzwa", "Chari", "Grade 7", "2011-07-05", "FIN-TST-0018", "full"]
];

const sponsorships = {
  TESTFIN004: { sponsorType: "BEAM", approved: 85, paid: 20, status: "PARTIAL" },
  TESTFIN011: { sponsorType: "CAMFED", approved: 130, paid: 30, status: "PARTIAL" },
  TESTFIN017: { sponsorType: "BEAM", approved: 160, paid: 0, status: "APPROVED" }
};

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

async function tableExists(conn, tableName) {
  const [rows] = await conn.query("SHOW TABLES LIKE ?", [tableName]);
  return rows.length > 0;
}

async function optionalQuery(conn, sql, params = []) {
  try {
    await conn.query(sql, params);
  } catch (err) {
    if (!["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(err.code)) {
      throw err;
    }
  }
}

async function upsertTerm(conn) {
  await conn.query(
    `
    INSERT INTO terms (name, year, term_number, start_date, end_date, is_active)
    VALUES (?, ?, 3, ?, ?, 1)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      start_date = VALUES(start_date),
      end_date = VALUES(end_date),
      is_active = VALUES(is_active)
    `,
    [TERM, YEAR, PAY_START, PAY_END]
  );

  const [[term]] = await conn.query(
    "SELECT id FROM terms WHERE year = ? AND term_number = 3 LIMIT 1",
    [YEAR]
  );

  return term.id;
}

async function upsertClassLevels(conn) {
  for (const [formLevel] of feeStructure) {
    await conn.query(
      `
      INSERT INTO class_levels (name)
      VALUES (?)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
      `,
      [formLevel]
    );
  }
}

async function upsertClasses(conn) {
  const classIds = new Map();

  for (const cls of classes) {
    const [[level]] = await conn.query(
      "SELECT id FROM class_levels WHERE name = ? LIMIT 1",
      [cls.formLevel]
    );

    await conn.query(
      `
      INSERT INTO classes (level_id, class_code, name, form_level, room)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        level_id = VALUES(level_id),
        name = VALUES(name),
        form_level = VALUES(form_level),
        room = VALUES(room)
      `,
      [level?.id || null, cls.code, cls.name, cls.formLevel, cls.room]
    );

    const [[savedClass]] = await conn.query(
      "SELECT id FROM classes WHERE class_code = ? LIMIT 1",
      [cls.code]
    );
    classIds.set(cls.formLevel, savedClass.id);
  }

  return classIds;
}

async function upsertFeeStructure(conn) {
  const fees = new Map();

  for (const [formLevel, termFee] of feeStructure) {
    const annualFee = money(termFee * 3);

    await conn.query(
      `
      INSERT INTO fee_structure
        (form_level, term_fee, annual_fee, tuition_fee, levy_fee, sports_fee, practical_fee, examination_fee)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        term_fee = VALUES(term_fee),
        annual_fee = VALUES(annual_fee),
        tuition_fee = VALUES(tuition_fee),
        levy_fee = VALUES(levy_fee),
        sports_fee = VALUES(sports_fee),
        practical_fee = VALUES(practical_fee),
        examination_fee = VALUES(examination_fee)
      `,
      [
        formLevel,
        termFee,
        annualFee,
        money(termFee * 0.55),
        money(termFee * 0.2),
        money(termFee * 0.1),
        money(termFee * 0.1),
        money(termFee * 0.05)
      ]
    );

    fees.set(formLevel, money(termFee));
  }

  return fees;
}

async function cleanupSeedFinance(conn, seedUserIds, seedStudentIds) {
  if (!seedStudentIds.length) return;

  await optionalQuery(conn, "DELETE FROM fee_statements WHERE student_id IN (?)", [seedStudentIds]);
  await optionalQuery(conn, "DELETE FROM sponsorships WHERE student_id IN (?)", [seedStudentIds]);
  await optionalQuery(conn, "DELETE FROM student_balances WHERE student_id IN (?)", [seedStudentIds]);
  await optionalQuery(conn, "DELETE FROM debtors_summary WHERE student_id IN (?)", [seedStudentIds]);
  await optionalQuery(conn, "DELETE FROM student_ledger WHERE student_id IN (?)", [seedStudentIds]);
  await optionalQuery(conn, "DELETE FROM fees WHERE student_id IN (?)", [seedStudentIds]);
  await optionalQuery(conn, "DELETE FROM receipts WHERE student_id IN (?)", [seedStudentIds]);
  await optionalQuery(
    conn,
    "DELETE ip FROM invoice_payments ip JOIN invoices i ON i.id = ip.invoice_id WHERE i.student_id IN (?)",
    [seedStudentIds]
  );
  await optionalQuery(conn, "DELETE FROM invoices WHERE student_id IN (?)", [seedStudentIds]);

  await optionalQuery(conn, "DELETE FROM cashbook WHERE reference_type = 'SEED'");
  await optionalQuery(conn, "DELETE FROM ledger WHERE description LIKE 'Seed finance:%'");
  await optionalQuery(conn, "DELETE FROM expenses WHERE description LIKE 'Seed finance:%'");
  await optionalQuery(conn, "DELETE FROM purchases WHERE description LIKE 'Seed finance:%'");
  await optionalQuery(conn, "DELETE FROM audit_logs WHERE user_id IN (?) AND action LIKE 'SEED_%'", [seedUserIds]);
}

async function upsertStudents(conn, classIds) {
  const saved = [];

  for (const [reg, firstName, lastName, formLevel, dob, birthId] of students) {
    await conn.query(
      `
      INSERT INTO users (username, password, role, first_name, last_name, unique_id, email, status)
      VALUES (?, 'NOT_SET', 'student', ?, ?, ?, ?, 'active')
      ON DUPLICATE KEY UPDATE
        first_name = VALUES(first_name),
        last_name = VALUES(last_name),
        email = VALUES(email),
        status = VALUES(status)
      `,
      [reg.toLowerCase(), firstName, lastName, reg, `${reg.toLowerCase()}@example.test`]
    );

    const [[user]] = await conn.query(
      "SELECT id FROM users WHERE role = 'student' AND unique_id = ? LIMIT 1",
      [reg]
    );

    await conn.query(
      `
      INSERT INTO students
        (user_id, form_level, email, phone, date_of_birth, birth_id_number, class_id, status, admission_year)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
      ON DUPLICATE KEY UPDATE
        form_level = VALUES(form_level),
        email = VALUES(email),
        phone = VALUES(phone),
        date_of_birth = VALUES(date_of_birth),
        class_id = VALUES(class_id),
        status = VALUES(status),
        admission_year = VALUES(admission_year)
      `,
      [
        user.id,
        formLevel,
        `${reg.toLowerCase()}@example.test`,
        `0772${reg.slice(-3).padStart(6, "0")}`,
        dob,
        birthId,
        classIds.get(formLevel) || null,
        YEAR
      ]
    );

    const [[student]] = await conn.query(
      "SELECT id, user_id, form_level FROM students WHERE user_id = ? LIMIT 1",
      [user.id]
    );

    saved.push({ reg, firstName, lastName, formLevel, userId: user.id, studentId: student.id });
  }

  return saved;
}

async function seedFinance(conn, termId, savedStudents, feesByLevel) {
  let paymentCounter = 1;
  let runningCashBalance = 0;
  let paidStudents = 0;
  let partialStudents = 0;
  let unpaidStudents = 0;

  for (const saved of savedStudents) {
    const template = students.find(([reg]) => reg === saved.reg);
    const paymentRule = template[6];
    const total = feesByLevel.get(saved.formLevel) || 0;
    const paid = paymentRule === "full" ? total : money(paymentRule);
    const balance = money(total - paid);
    const status = paid >= total ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";

    if (status === "PAID") paidStudents++;
    if (status === "PARTIAL") partialStudents++;
    if (status === "UNPAID") unpaidStudents++;

    const [invoiceResult] = await conn.query(
      `
      INSERT INTO invoices (student_id, term_id, term, year, total_amount, status, pay_start, pay_end, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [saved.studentId, termId, TERM, YEAR, total, status, PAY_START, PAY_END]
    );

    const invoiceId = invoiceResult.insertId;

    await conn.query(
      `
      INSERT INTO student_ledger
        (student_id, transaction_date, description, debit, credit, balance, reference_type, reference_id)
      VALUES (?, ?, ?, ?, 0, ?, 'INVOICE', ?)
      `,
      [saved.studentId, PAY_START, `Seed finance: ${TERM} ${YEAR} invoice`, total, total, invoiceId]
    );

    if (paid > 0) {
      const paidAt = paymentCounter % 2 === 0 ? "2026-10-03" : "2026-09-19";
      const reference = `SEED-FIN-${String(paymentCounter).padStart(3, "0")}`;
      const receiptNumber = `RCP-TST-${String(paymentCounter).padStart(3, "0")}`;

      await conn.query(
        `
        INSERT INTO fees (student_id, term_id, amount, paid, method, reference, date_paid)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [saved.studentId, termId, total, paid, paymentCounter % 3 === 0 ? "Bank Transfer" : "Cash", reference, paidAt]
      );

      const [paymentResult] = await conn.query(
        `
        INSERT INTO invoice_payments (invoice_id, amount, payment_method, reference, paid_at, received_by)
        VALUES (?, ?, ?, ?, ?, NULL)
        `,
        [invoiceId, paid, paymentCounter % 3 === 0 ? "Bank Transfer" : "Cash", reference, paidAt]
      );

      const paymentId = paymentResult.insertId;

      await conn.query(
        `
        INSERT INTO receipts
          (receipt_number, student_id, invoice_id, payment_id, amount, payment_method, reference, received_by, receipt_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
        `,
        [receiptNumber, saved.studentId, invoiceId, paymentId, paid, paymentCounter % 3 === 0 ? "Bank Transfer" : "Cash", reference, `${paidAt} 09:00:00`]
      );

      await conn.query(
        `
        INSERT INTO student_ledger
          (student_id, transaction_date, description, debit, credit, balance, reference_type, reference_id)
        VALUES (?, ?, ?, 0, ?, ?, 'RECEIPT', ?)
        `,
        [saved.studentId, paidAt, `Seed finance: payment ${receiptNumber}`, paid, balance, paymentId]
      );

      runningCashBalance = money(runningCashBalance + paid);

      await conn.query(
        `
        INSERT INTO cashbook
          (transaction_date, description, inflow, outflow, running_balance, reference_type, reference_id, created_by)
        VALUES (?, ?, ?, 0, ?, 'SEED', ?, NULL)
        `,
        [paidAt, `Seed finance: fees payment ${receiptNumber}`, paid, runningCashBalance, paymentId]
      );

      await conn.query(
        `
        INSERT INTO ledger (transaction_date, type, category, description, amount)
        VALUES (?, 'INCOME', 'Fees', ?, ?)
        `,
        [paidAt, `Seed finance: student fee payment ${receiptNumber}`, paid]
      );

      paymentCounter++;
    }

    await conn.query(
      `
      INSERT INTO student_balances (student_id, balance)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE balance = VALUES(balance)
      `,
      [saved.studentId, balance]
    );

    await conn.query(
      `
      INSERT INTO debtors_summary (student_id, total_invoiced, total_paid, balance)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_invoiced = VALUES(total_invoiced),
        total_paid = VALUES(total_paid),
        balance = VALUES(balance)
      `,
      [saved.studentId, total, paid, balance]
    );

    if (sponsorships[saved.reg]) {
      const sponsor = sponsorships[saved.reg];
      await conn.query(
        `
        INSERT INTO sponsorships
          (student_id, sponsor_type, approved_amount, paid_amount, balance, status, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        `,
        [
          saved.studentId,
          sponsor.sponsorType,
          sponsor.approved,
          sponsor.paid,
          money(sponsor.approved - sponsor.paid),
          sponsor.status,
          "Seed finance: sponsored-fee test record"
        ]
      );
    }
  }

  return { paidStudents, partialStudents, unpaidStudents };
}

async function seedOperationalFinance(conn) {
  await optionalQuery(conn, "DELETE FROM suppliers WHERE name LIKE 'Seed Finance %'");

  await conn.query(
    `
    INSERT INTO suppliers (name, contact_person, phone, email, address, status)
    VALUES
      ('Seed Finance Stationers', 'Memory K.', '0772000101', 'stationers@example.test', 'Main Road', 'ACTIVE'),
      ('Seed Finance Uniforms', 'David M.', '0772000102', 'uniforms@example.test', 'Market Street', 'ACTIVE')
    `
  );

  await conn.query(
    `
    INSERT INTO expense_categories (name)
    VALUES ('Stationery'), ('Maintenance')
    ON DUPLICATE KEY UPDATE name = VALUES(name)
    `
  );

  await conn.query(
    `
    INSERT INTO purchase_categories (name)
    VALUES ('Learning Materials'), ('Uniforms')
    ON DUPLICATE KEY UPDATE name = VALUES(name)
    `
  );

  await conn.query(
    `
    INSERT INTO expenses (category, description, amount, expense_date, recorded_by)
    VALUES
      ('Stationery', 'Seed finance: exercise books and markers', 185.50, '2026-09-22', NULL),
      ('Maintenance', 'Seed finance: classroom door repairs', 95.00, '2026-10-04', NULL)
    `
  );

  const [[supplier]] = await conn.query(
    "SELECT id FROM suppliers WHERE name = 'Seed Finance Stationers' ORDER BY id DESC LIMIT 1"
  );

  await conn.query(
    `
    INSERT INTO purchases (supplier_id, category, description, amount, purchase_date, status)
    VALUES (?, 'Learning Materials', 'Seed finance: textbooks for test classes', 420.00, '2026-09-25', 'PENDING')
    `,
    [supplier?.id || null]
  );

  await conn.query(
    `
    INSERT INTO ledger (transaction_date, type, category, description, amount)
    VALUES
      ('2026-09-22', 'EXPENSE', 'Stationery', 'Seed finance: exercise books and markers', 185.50),
      ('2026-10-04', 'EXPENSE', 'Maintenance', 'Seed finance: classroom door repairs', 95.00)
    `
  );
}

async function main() {
  const conn = await mysql.createConnection(dbConfig);

  try {
    await conn.beginTransaction();

    const requiredTables = ["users", "students", "classes", "fee_structure", "fees", "invoices"];
    for (const table of requiredTables) {
      if (!(await tableExists(conn, table))) {
        throw new Error(`Missing required table: ${table}. Run database.sql before seeding.`);
      }
    }

    const termId = await upsertTerm(conn);
    await upsertClassLevels(conn);
    const classIds = await upsertClasses(conn);
    const feesByLevel = await upsertFeeStructure(conn);
    const savedStudents = await upsertStudents(conn, classIds);

    await cleanupSeedFinance(
      conn,
      savedStudents.map((student) => student.userId),
      savedStudents.map((student) => student.studentId)
    );

    const financeSummary = await seedFinance(conn, termId, savedStudents, feesByLevel);
    await seedOperationalFinance(conn);

    await conn.commit();

    const [[totals]] = await conn.query(
      `
      SELECT
        COUNT(*) AS seed_students,
        IFNULL(SUM(i.total_amount), 0) AS invoiced,
        IFNULL(SUM(p.paid), 0) AS paid
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN invoices i ON i.student_id = s.id AND i.term = ? AND i.year = ?
      LEFT JOIN (
        SELECT student_id, SUM(paid) AS paid
        FROM fees
        GROUP BY student_id
      ) p ON p.student_id = s.id
      WHERE u.unique_id LIKE 'TESTFIN%'
      `,
      [TERM, YEAR]
    );

    console.log("Seeded finance students successfully.");
    console.log({
      students: Number(totals.seed_students || 0),
      invoices: money(totals.invoiced),
      payments: money(totals.paid),
      balances: money(totals.invoiced - totals.paid),
      ...financeSummary
    });
  } catch (err) {
    await conn.rollback();
    console.error("Finance student seed failed:", err);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main();
