import express from "express";
import session from "express-session";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

import multer from "multer";
import csv from "csv-parser";
import fs from "fs";
import * as XLSX from "xlsx";


const storage = multer.diskStorage({
    destination: "uploads/resources",
    filename: (req, file, cb) =>
        cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

const uploadCsv = multer({ dest: "uploads/tmp" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

/* ===================== MIDDLEWARE ===================== */
app.disable("x-powered-by");

app.use((req, res, next) => {
    const csp = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "img-src 'self' data: https://chinembiriprimaryschool.ac.zw",
        "font-src 'self' data: https://cdn.jsdelivr.net",
        "connect-src 'self'"
    ].join("; ");

    res.setHeader("Content-Security-Policy", csp);
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));
app.use(express.static("public"));
app.use(express.static(__dirname));
app.use(session({
    secret: "CENTERPOINT_SECRET_2026",
    resave: false,
    saveUninitialized: false
}));


app.set("view engine", "ejs");

app.use((req, res, next) => {
  if (req.path.startsWith("/admin")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  next();
});

async function initDatabase() {
    const connection = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "",
        database: "elearning_portal",
        multipleStatements: true
    });

    await ensureRegistrationUniqueness(connection);

    await connection.end();
}

async function ensureUniqueIndex(connection, tableName, indexName, columns, duplicateWhere = "1=1") {
    const [indexes] = await connection.query(
        `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = ?`,
        [indexName]
    );

    if (indexes.length) {
        return;
    }

    const columnList = columns.map((column) => `\`${column}\``).join(", ");
    const [duplicates] = await connection.query(
        `
        SELECT ${columnList}, COUNT(*) AS duplicate_count
        FROM \`${tableName}\`
        WHERE ${duplicateWhere}
        GROUP BY ${columnList}
        HAVING COUNT(*) > 1
        LIMIT 1
        `
    );

    if (duplicates.length) {
        console.warn(
            `⚠️  Skipping ${indexName}: duplicate rows already exist in ${tableName}. Clean them up, then restart the server.`
        );
        return;
    }

    await connection.query(
        `ALTER TABLE \`${tableName}\` ADD UNIQUE KEY \`${indexName}\` (${columnList})`
    );
}

async function ensureRegistrationUniqueness(connection) {
    await connection.query("UPDATE users SET unique_id = NULL WHERE unique_id = ''");
    await connection.query(`
        UPDATE students
        SET birth_id_number = NULL
        WHERE birth_id_number IS NOT NULL
          AND TRIM(birth_id_number) = ''
    `);
    await connection.query(`
        UPDATE students
        SET birth_id_number = UPPER(TRIM(birth_id_number))
        WHERE birth_id_number IS NOT NULL
    `);

    await deleteDuplicateStudentBirthIds(connection);

    await ensureUniqueIndex(
        connection,
        "users",
        "uniq_users_role_unique_id",
        ["role", "unique_id"],
        "unique_id IS NOT NULL"
    );

    await ensureUniqueIndex(
        connection,
        "students",
        "uniq_students_user_id",
        ["user_id"],
        "user_id IS NOT NULL"
    );

    await ensureUniqueIndex(
        connection,
        "students",
        "uniq_students_birth_id_number",
        ["birth_id_number"],
        "birth_id_number IS NOT NULL"
    );

    await ensureUniqueIndex(
        connection,
        "teachers",
        "uniq_teachers_user_id",
        ["user_id"],
        "user_id IS NOT NULL"
    );
}


async function startServer() {
    await initDatabase();

    const db = mysql.createPool({
        host: "localhost",
        user: "root",
        password: "",
        database: "elearning_portal",
        waitForConnections: true
    });

    app.locals.db = db;

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

startServer().catch(err => {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
});


function generateStudentReg() {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const start = letters[Math.floor(Math.random() * letters.length)];
    const end = letters[Math.floor(Math.random() * letters.length)];
    const numbers = Math.floor(1000 + Math.random() * 9000); // 4 digits
    return `${start}${numbers}${end}`;
}

function generateTeacherId() {

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

  let result = "T";

  for (let i = 0; i < 5; i++) {

    result += chars.charAt(
      Math.floor(
        Math.random() * chars.length
      )
    );
  }

  return result;
}

function normalizeBirthId(value) {
    return String(value || "").trim().toUpperCase();
}

function normalizeName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function deleteStudentRecord(conn, studentId) {
    const [[stu]] = await conn.query(
        "SELECT id, user_id FROM students WHERE id=? LIMIT 1",
        [studentId]
    );

    if (!stu) {
        return false;
    }

    await conn.query("DELETE FROM receipts WHERE student_id=?", [studentId]);
    await conn.query(
        `
        DELETE ip
        FROM invoice_payments ip
        JOIN invoices i ON i.id = ip.invoice_id
        WHERE i.student_id = ?
        `,
        [studentId]
    );

    await conn.query("DELETE FROM invoices WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM fees WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM grades WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM submissions WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM attendance WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM library_borrowings WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM student_ledger WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM student_balances WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM debtors_summary WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM sponsorships WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM fee_statements WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM student_classes WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM customers WHERE student_id=?", [studentId]);
    await conn.query("DELETE FROM students WHERE id=?", [studentId]);

    if (stu.user_id) {
        const [[studentRefs]] = await conn.query(
            "SELECT COUNT(*) AS total FROM students WHERE user_id=?",
            [stu.user_id]
        );
        const [[teacherRefs]] = await conn.query(
            "SELECT COUNT(*) AS total FROM teachers WHERE user_id=?",
            [stu.user_id]
        );

        if (!studentRefs.total && !teacherRefs.total) {
            await conn.query("DELETE FROM users WHERE id=?", [stu.user_id]);
        }
    }

    return true;
}

async function deleteDuplicateStudentBirthIds(connection) {
    const [duplicateGroups] = await connection.query(`
        SELECT birth_id_number, COUNT(*) AS duplicate_count
        FROM students
        WHERE birth_id_number IS NOT NULL
        GROUP BY birth_id_number
        HAVING COUNT(*) > 1
    `);

    if (!duplicateGroups.length) {
        return;
    }

    let deleted = 0;

    await connection.beginTransaction();

    try {
        for (const group of duplicateGroups) {
            const [students] = await connection.query(
                `
                SELECT id
                FROM students
                WHERE birth_id_number = ?
                ORDER BY id ASC
                `,
                [group.birth_id_number]
            );

            for (const student of students.slice(1)) {
                const didDelete = await deleteStudentRecord(connection, student.id);
                if (didDelete) {
                    deleted++;
                }
            }
        }

        await connection.commit();
        console.warn(`⚠️  Deleted ${deleted} duplicate student record(s) by Birth/National ID.`);
    } catch (err) {
        await connection.rollback();
        throw err;
    }
}
/* ===================== AUTH HELPERS ===================== */
function requireAuth(role) {
    return (req, res, next) => {

        console.log("ROLE CHECK");
        console.log("Session User:", req.session.user);

        if (!req.session.user) {
            console.log("No session user");
            return res.redirect("/");
        }

        if (req.session.user.role !== role) {
            console.log(
                "Role mismatch:",
                req.session.user.role,
                role
            );
            return res.redirect("/");
        }

        next();
    };
}

// ================= AUTH MIDDLEWARE =================
function authTeacher(req, res, next) {
    console.log("req.user =", req.user);

    if (!req.user) {
        console.log("No user found");
        return res.redirect("/login");
    }

    console.log("Role =", req.user.role);

    if (req.user.role !== "teacher") {
        console.log("Role mismatch");
        return res.status(403).send("Access denied");
    }

    next();
}
// Middleware to ensure the user is a teacher
function ensureTeacher(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === "teacher") {
        return next();
    }
    return res.status(403).send("Forbidden: Teacher access only");
}


// Middleware to ensure the user is a student
function ensureStudent(req, res, next) {
    if (req.session && req.session.role === "student") {
        return next();
    }
    // Not a student → redirect to login or show forbidden
    return res.status(403).send("Forbidden: Student access only");
}

/* ===================== ROUTES ===================== */

// PUBLIC SEO HOMEPAGE
app.get("/", (req, res) => {
    res.render("public_home");
});

async function handleLogin(req, res, allowedRoles) {
    const role = String(req.body.role || "").trim().toLowerCase();
    const { username, password } = req.body;
    const uniqueId = username;

    try {
        if (!allowedRoles.includes(role)) {
            return res.status(403).json({
                success: false,
                message: "Please use the correct login page for this account."
            });
        }

        // ===== STUDENT LOGIN =====
        if (role === "student") {
            const [rows] = await req.app.locals.db.query(
            "SELECT * FROM users WHERE unique_id=? AND role=?",
            [uniqueId, role]
            );

            if (!rows.length) {
                return res.json({ success: false, message: "Invalid Registration Number" });
            }

            const valid = await bcrypt.compare(password, rows[0].password);
            if (!valid) {
                return res.json({ success: false, message: "Incorrect password" });
            }

            req.session.user = rows[0];
            return res.json({ success: true, redirect: "/student" });
        }

        // ===== ADMIN / TEACHER LOGIN =====
        const [rows] = await req.app.locals.db.query(
            "SELECT * FROM users WHERE username=? AND role=?",
            [username, role]
        );

        if (!rows.length) {
            return res.json({ success: false, message: "Invalid credentials" });
        }

        const valid = await bcrypt.compare(password, rows[0].password);
        if (!valid) {
            return res.json({ success: false, message: "Invalid credentials" });
        }


        req.session.user = rows[0];
        
        req.session.save(err => {
            if (err) {
                console.error("Session save error:", err);
                return res.json({
                    success: false,
                    message: "Session error"
                });
            }
        
            return res.json({
                success: true,
                redirect: `/${role}`
            });
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Server error. Try again." });
    }
}

// LOGIN PAGE
app.get("/login", (req, res) => {
    res.render("views", { authMode: "portal" });
});

app.post("/login", async (req, res) => {
    return handleLogin(req, res, ["student", "teacher"]);
});

app.get("/login/admin-login", (req, res) => {
    return res.redirect("/admin-login");
});

app.get("/admin-login", (req, res) => {
    res.render("views", { authMode: "admin" });
});

app.post("/admin-login", async (req, res) => {
    req.body.role = "admin";
    return handleLogin(req, res, ["admin"]);
});

// REGISTER (STUDENT / TEACHER)
app.post("/register", async (req, res) => {
  try {
    const role = (req.body.role || "").trim().toLowerCase();
    const first_name = (req.body.first_name || req.body.firstName || "").trim();
    const last_name = (req.body.last_name || req.body.lastName || "").trim();
    const unique_id = (req.body.unique_id || req.body.uniqueId || "").trim().toUpperCase();
    const { password } = req.body;

    if (!["student", "teacher"].includes(role)) {
      return res.json({ error: "Invalid role" });
    }

    if (!first_name || !last_name || !unique_id || !password) {
      return res.json({ error: "Please complete all activation fields." });
    }

    if (role === "student" && !/^[A-Z][0-9]{4}[A-Z]$/.test(unique_id)) {
      return res.json({ error: "Invalid Student Registration Number format" });
    }

    if (role === "teacher" && !/^([0-9]{4}|T[A-Z0-9]{5})$/.test(unique_id)) {
      return res.json({ error: "Invalid Teacher ID format" });
    }

    const [rows] = await req.app.locals.db.query(
      `SELECT * FROM users WHERE unique_id=? AND role=?`,
      [unique_id, role]
    );

    if (!rows.length) return res.json({ error: "ID not found. Contact admin." });

    if (rows.length > 1) {
      return res.json({
        error: "Duplicate account records found for this ID. Contact admin."
      });
    }

    const user = rows[0];

    if (
      (user.first_name || "").toLowerCase() !== (first_name || "").toLowerCase() ||
      (user.last_name || "").toLowerCase() !== (last_name || "").toLowerCase()
    ) {
      return res.json({ error: "Name does not match records" });
    }

    if (user.password !== "NOT_SET") {
      return res.json({ error: "Account already activated" });
    }

    // ✅ Validate profile exists BEFORE activating
    if (role === "student") {
      const [[s]] = await req.app.locals.db.query(
        "SELECT id FROM students WHERE user_id=? LIMIT 1",
        [user.id]
      );
      if (!s) return res.json({ error: "Student profile missing. Contact admin." });
    } else {
      const [[t]] = await req.app.locals.db.query(
        "SELECT id FROM teachers WHERE user_id=? LIMIT 1",
        [user.id]
      );
      if (!t) return res.json({ error: "Teacher profile missing. Contact admin." });
    }

    const hashed = await bcrypt.hash(password, 10);

    const [result] = await req.app.locals.db.query("UPDATE users SET password=? WHERE id=? AND password='NOT_SET'", [
      hashed,
      user.id,
    ]);

    if (result.affectedRows === 0) {
      return res.json({ error: "Account already activated" });
    }

    res.json({ success: true, message: "Account activated successfully" });
  } catch (err) {
    console.error("❌ /register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// DASHBOARDS
// DASHBOARDS
app.get("/student", requireAuth("student"), async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Student record (force single row)
    const [[student]] = await req.app.locals.db.query(
      `SELECT id, form_level, email, phone, class_id
       FROM students
       WHERE user_id = ?
       ORDER BY id ASC
       LIMIT 1`,
      [userId]
    );

    // ✅ Guard: no student profile
    if (!student) {
      console.error("❌ Student row missing for user_id:", userId);
      return res.status(403).send("Student profile not found. Please contact the admin.");
    }

    // ✅ classId to use everywhere (NO subqueries)
    const classId = student.class_id;

    // Dashboard stats
    const [[subjects]] = await req.app.locals.db.query(
      "SELECT COUNT(DISTINCT subject_id) AS total FROM assignments"
    );

    const [[avgGrade]] = await req.app.locals.db.query(
      `
      SELECT ROUND(AVG(score)) AS avg
      FROM grades g
      JOIN students s ON s.id = g.student_id
      WHERE s.user_id = ?
      `,
      [userId]
    );

    const [[pending]] = await req.app.locals.db.query(
      `
      SELECT COUNT(*) AS total
      FROM assignments a
      LEFT JOIN grades g ON g.assignment_id = a.id
      JOIN students s ON s.user_id = ?
      WHERE g.id IS NULL
      `,
      [userId]
    );

    // ================= FEES =================
    const [[termFeeTotalResult]] = await req.app.locals.db.query(
      `
      SELECT IFNULL(SUM(amount), 0) AS total_billed
      FROM fees
      WHERE student_id = ?
      `,
      [student.id]
    );

    const [[amountPaidTotalResult]] = await req.app.locals.db.query(
      `
      SELECT IFNULL(SUM(paid), 0) AS total_paid
      FROM fees
      WHERE student_id = ?
      `,
      [student.id]
    );

    const [[fees]] = await req.app.locals.db.query(
      `
      SELECT IFNULL(SUM(amount - paid), 0) AS balance
      FROM fees
      WHERE student_id = ?
      `,
      [student.id]
    );

    const [paymentHistory] = await req.app.locals.db.query(
      `
      SELECT date_paid, paid AS amount_paid_today, method, reference
      FROM fees
      WHERE student_id = ?
      ORDER BY date_paid DESC
      `,
      [student.id]
    );

    const termFeeTotal = termFeeTotalResult?.total_billed || 0;
    const amountPaidTotal = amountPaidTotalResult?.total_paid || 0;
    const outstanding = fees?.balance || 0;

    // Grades
    const [grades] = await req.app.locals.db.query(
      `
      SELECT sub.name AS subject, a.title, g.score, g.grade
      FROM grades g
      JOIN assignments a ON a.id = g.assignment_id
      JOIN subjects sub ON sub.id = a.subject_id
      JOIN students s ON s.id = g.student_id
      WHERE s.user_id = ?
      ORDER BY a.title
      `,
      [userId]
    );

    // ✅ If class_id is NULL, just return empty class-based data
    let assignments = [];
    let timetable = [];
    let rawTimetableEntries = [];
    let resources = [];

    if (classId) {
      // Assignments (NO subquery)
      const [assRows] = await req.app.locals.db.query(
        `
        SELECT a.id, a.title, a.description, a.due_date, a.file_path
        FROM assignments a
        WHERE a.class_id = ?
        ORDER BY a.due_date
        `,
        [classId]
      );
      assignments = assRows;

      // Timetable (today list)
      const [ttRows] = await req.app.locals.db.query(
        `
        SELECT 
          CONCAT(t.start_time, ' - ', t.end_time) AS time,
          t.start_time AS period,
          s.name AS subject,
          CONCAT(u.first_name, ' ', u.last_name) AS teacher,
          t.room,
          t.day
        FROM timetable t
        JOIN subjects s ON t.subject_id = s.id
        JOIN teachers tr ON t.teacher_id = tr.id
        JOIN users u ON tr.user_id = u.id
        WHERE t.class_id = ?
        ORDER BY t.start_time
        `,
        [classId]
      );
      timetable = ttRows;

      // Weekly timetable raw entries
      const [rawRows] = await req.app.locals.db.query(
        `
        SELECT 
          t.start_time AS period,
          CONCAT(t.start_time, ' - ', t.end_time) AS time,
          s.name AS subject,
          t.day
        FROM timetable t
        JOIN subjects s ON t.subject_id = s.id
        WHERE t.class_id = ?
        ORDER BY t.start_time
        `,
        [classId]
      );
      rawTimetableEntries = rawRows;

      // Resources
      const [resRows] = await req.app.locals.db.query(
        `
        SELECT 
          r.id,
          r.title,
          r.description,
          r.type,
          r.file_path,
          r.created_at,
          s.name AS subject
        FROM resources r
        JOIN subjects s ON r.subject_id = s.id
        WHERE r.class_id = ?
        ORDER BY r.created_at DESC
        `,
        [classId]
      );
      resources = resRows;
    }

    // Transform raw timetable -> scheduleData
    const transformTimetable = (entries) => {
      const scheduleMap = new Map();

      entries.forEach((entry) => {
        const key = entry.period;

        if (!scheduleMap.has(key)) {
          scheduleMap.set(key, {
            period: entry.period,
            time: entry.time,
            monday: "",
            tuesday: "",
            wednesday: "",
            thursday: "",
            friday: "",
            isBreak: entry.subject === "Break" || entry.subject === "Morning Break",
            breakName:
              entry.subject === "Break" || entry.subject === "Morning Break"
                ? entry.subject
                : null,
          });
        }

        const row = scheduleMap.get(key);
        const day = (entry.day || "").toLowerCase();

        if (!row.isBreak && Object.prototype.hasOwnProperty.call(row, day)) {
          row[day] = entry.subject;
        }
      });

      return Array.from(scheduleMap.values()).sort((a, b) => {
        const numA = parseInt(a.period);
        const numB = parseInt(b.period);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return 0;
      });
    };

    const scheduleData = transformTimetable(rawTimetableEntries);

    // Notices
    const [notices] = await req.app.locals.db.query(
      "SELECT title, message, created_at FROM notices ORDER BY created_at DESC LIMIT 5"
    );

    // Library books
    const [library] = await req.app.locals.db.query(
      `
      SELECT 
        lb.id,
        lb.title,
        lb.author,
        s.name AS category,
        lb.file_type,
        lb.file_path,
        lb.available
      FROM library_books lb
      LEFT JOIN subjects s ON lb.subject_id = s.id
      ORDER BY lb.title
      `
    );

    res.render("student", {
      user: {
        ...req.session.user,
        form_level: student.form_level,
        email: student.email,
        phone: student.phone,
      },
      stats: {
        subjects: subjects?.total || 0,
        average: avgGrade?.avg || 0,
        pending: pending?.total || 0,
        termFeeTotal,
        amountPaidTotal,
        fees: outstanding,
      },
      grades,
      assignments,
      timetable,
      scheduleData,
      notices,
      library,
      resources,
      paymentHistory,
    });
  } catch (err) {
    console.error("❌ Error loading /student dashboard:", err);
    return res.status(500).send("Failed to load student dashboard.");
  }
});

app.get("/library/download/:id", async (req, res) => {
    const [[book]] = await req.app.locals.db.query(
        "SELECT file_path FROM library_books WHERE id = ?",
        [req.params.id]
    );

    if (!book || !book.file_path) {
        return res.status(404).send("File not found");
    }

    res.download(book.file_path);
});

// ================= ADMIN DASHBOARD =================
app.get("/admin", requireAuth("admin"), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const user = req.session.user;

    // These dashboard datasets are independent, so fetch them concurrently
    // instead of adding each database round trip to the page's response time.
    const [
      [[studentsCount]],
      [[teachersCount]],
      [[classesCount]],
      [[revenue]],
      [activities],
      [studentsList],
      [teachersList],
      [classesList],
      [subjects],
      [feeStructure]
    ] = await Promise.all([
      db.query("SELECT COUNT(*) AS total FROM students WHERE status='active'"),
      db.query("SELECT COUNT(*) AS total FROM teachers"),
      db.query("SELECT COUNT(*) AS total FROM classes"),
      db.query("SELECT IFNULL(SUM(paid),0) AS total FROM fees WHERE MONTH(date_paid)=MONTH(CURDATE())"),
      db.query(`
        SELECT message, created_at
        FROM system_logs
        ORDER BY created_at DESC
        LIMIT 5
      `).catch(() => [[]]),
      db.query(`
      SELECT 
        s.id,
        s.class_id,
        u.unique_id,
        u.first_name,
        u.last_name,
        s.form_level,
        s.email,
        s.phone,
        s.date_of_birth,
        s.birth_id_number,
        s.status
      FROM students s
      JOIN users u ON u.id = s.user_id
      ORDER BY u.last_name ASC, u.first_name ASC, u.unique_id ASC
      LIMIT 5000
      `),
      db.query(`
      SELECT 
        t.id,
        u.first_name,
        u.last_name,
        u.unique_id,
        t.employee_number,
        t.date_of_appointment,
        t.department,
        t.email,
        t.status
      FROM teachers t
      JOIN users u ON t.user_id = u.id
      ORDER BY u.last_name ASC, u.first_name ASC
      `),
      db.query(`
      SELECT
        c.id,
        c.class_code,
        c.name,
        c.form_level,
        c.room,
    
        COALESCE(
          GROUP_CONCAT(
            DISTINCT CONCAT(u.first_name,' ',u.last_name)
            SEPARATOR ', '
          ),
          'Unassigned'
        ) AS teachers,
    
        COUNT(DISTINCT s.id) AS students
    
      FROM classes c
    
      LEFT JOIN teaching_assignments ta
        ON ta.class_id = c.id
    
      LEFT JOIN teachers t
        ON ta.teacher_id = t.id
    
      LEFT JOIN users u
        ON t.user_id = u.id
    
      LEFT JOIN students s
        ON s.class_id = c.id
    
      GROUP BY c.id
    
      ORDER BY
        CASE
          WHEN UPPER(TRIM(c.form_level)) LIKE 'ECD A%' OR UPPER(TRIM(c.name)) LIKE 'ECD A%' THEN 1
          WHEN UPPER(TRIM(c.form_level)) LIKE 'ECD B%' OR UPPER(TRIM(c.name)) LIKE 'ECD B%' THEN 2
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 1%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*1' THEN 3
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 2%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*2' THEN 4
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 3%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*3' THEN 5
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 4%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*4' THEN 6
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 5%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*5' THEN 7
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 6%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*6' THEN 8
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 7%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*7' THEN 9
          ELSE 999
        END,
        c.name ASC,
        c.class_code ASC
      `),
      db.query("SELECT id, name FROM subjects ORDER BY name"),
      db.query("SELECT * FROM fee_structure ORDER BY CASE WHEN UPPER(form_level) LIKE 'ECD A%' THEN 1 WHEN UPPER(form_level) LIKE 'ECD B%' THEN 2 WHEN UPPER(form_level) LIKE 'GRADE 1%' THEN 3 WHEN UPPER(form_level) LIKE 'GRADE 2%' THEN 4 WHEN UPPER(form_level) LIKE 'GRADE 3%' THEN 5 WHEN UPPER(form_level) LIKE 'GRADE 4%' THEN 6 WHEN UPPER(form_level) LIKE 'GRADE 5%' THEN 7 WHEN UPPER(form_level) LIKE 'GRADE 6%' THEN 8 WHEN UPPER(form_level) LIKE 'GRADE 7%' THEN 9 ELSE 999 END, form_level")
    ]);

    /* ================= FINANCE ================= */

    // --- Income and expense totals ---
    const [
      [[totalIncome]],
      [[totalExpenses]]
    ] = await Promise.all([
      db.query(`
        SELECT IFNULL(SUM(amount),0) AS total
        FROM invoice_payments
      `),
      db.query(`
        SELECT IFNULL(SUM(amount),0) AS total
        FROM expenses
      `)
    ]);

    // --- Invoices (PAID from fees table, supports optional date range columns pay_start/pay_end) ---
    let invoices = [];
    try {
      // If your invoices table has pay_start + pay_end, this will work.
      const [rows] = await db.query(`
        SELECT
          i.id,
          i.student_id,
          i.term,
          i.year,
          i.total_amount,
          i.pay_start,
          i.pay_end,

          -- ✅ paid from fees (date range aware)
          IFNULL(SUM(
            CASE
              WHEN (i.pay_start IS NULL OR i.pay_end IS NULL) THEN f.paid
              WHEN f.date_paid BETWEEN i.pay_start AND i.pay_end THEN f.paid
              ELSE 0
            END
          ), 0) AS paid_amount,

          (i.total_amount - IFNULL(SUM(
            CASE
              WHEN (i.pay_start IS NULL OR i.pay_end IS NULL) THEN f.paid
              WHEN f.date_paid BETWEEN i.pay_start AND i.pay_end THEN f.paid
              ELSE 0
            END
          ), 0)) AS balance,

          CASE
            WHEN IFNULL(SUM(
              CASE
                WHEN (i.pay_start IS NULL OR i.pay_end IS NULL) THEN f.paid
                WHEN f.date_paid BETWEEN i.pay_start AND i.pay_end THEN f.paid
                ELSE 0
              END
            ), 0) = 0 THEN 'UNPAID'
            WHEN IFNULL(SUM(
              CASE
                WHEN (i.pay_start IS NULL OR i.pay_end IS NULL) THEN f.paid
                WHEN f.date_paid BETWEEN i.pay_start AND i.pay_end THEN f.paid
                ELSE 0
              END
            ), 0) < i.total_amount THEN 'PARTIAL'
            ELSE 'PAID'
          END AS status,

          u.first_name,
          u.last_name
        FROM invoices i
        JOIN students s ON s.id = i.student_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN fees f ON f.student_id = i.student_id
        GROUP BY i.id
        ORDER BY i.created_at DESC
      `);
      invoices = rows;
    } catch (err) {
      // Fallback if invoices table DOES NOT have pay_start/pay_end columns yet.
      const [rows] = await db.query(`
        SELECT
          i.id,
          i.student_id,
          i.term,
          i.year,
          i.total_amount,

          IFNULL(SUM(f.paid), 0) AS paid_amount,
          (i.total_amount - IFNULL(SUM(f.paid), 0)) AS balance,

          CASE
            WHEN IFNULL(SUM(f.paid), 0) = 0 THEN 'UNPAID'
            WHEN IFNULL(SUM(f.paid), 0) < i.total_amount THEN 'PARTIAL'
            ELSE 'PAID'
          END AS status,

          u.first_name,
          u.last_name
        FROM invoices i
        JOIN students s ON s.id = i.student_id
        JOIN users u ON u.id = s.user_id
        LEFT JOIN fees f ON f.student_id = i.student_id
        GROUP BY i.id
        ORDER BY i.created_at DESC
      `);
      invoices = rows;
    }

    // These finance tables are independent too. Fetch them together to avoid
    // serial database round trips while preserving the same page datasets.
    const [
      [payments],
      [expenses],
      [expenseCategories],
      [suppliers],
      [purchaseCategories],
      [assets],
      [ledger],
      [receipts],
      [studentLedger],
      [cashbook],
      [budgets],
      [auditLogs],
      [feeStatements],
      [beamCamfed],
      [[beamCamfedStats]],
      [employees]
    ] = await Promise.all([
      db.query(`
        SELECT *
        FROM invoice_payments
        ORDER BY paid_at DESC
      `),
      db.query(`
        SELECT id, category, description, amount, expense_date
        FROM expenses
        ORDER BY expense_date DESC
      `),
      db.query("SELECT * FROM expense_categories ORDER BY name"),
      db.query("SELECT * FROM suppliers ORDER BY name"),
      db.query("SELECT * FROM purchase_categories ORDER BY name"),
      db.query("SELECT * FROM assets ORDER BY name"),
      db.query("SELECT * FROM ledger ORDER BY transaction_date DESC"),
      db.query(`
      SELECT
        r.*,
        u.unique_id,
        u.first_name,
        u.last_name
      FROM receipts r
      JOIN students s ON s.id = r.student_id
      JOIN users u ON u.id = s.user_id
      ORDER BY r.receipt_date DESC
      `).catch(() => [[]]),
      db.query(`
      SELECT
        sl.*,
        u.unique_id,
        u.first_name,
        u.last_name,
        s.form_level
      FROM student_ledger sl
      JOIN students s ON s.id = sl.student_id
      JOIN users u ON u.id = s.user_id
      ORDER BY sl.transaction_date DESC, sl.id DESC
      LIMIT 500
      `).catch(() => [[]]),
      db.query(`
      SELECT *
      FROM cashbook
      ORDER BY transaction_date DESC, id DESC
      LIMIT 500
      `).catch(() => [[]]),
      db.query(`
      SELECT *
      FROM budgets
      ORDER BY year DESC, category ASC
      `).catch(() => [[]]),
      db.query(`
      SELECT
        a.*,
        CONCAT(u.first_name, ' ', u.last_name) AS user_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
      LIMIT 300
      `).catch(() => [[]]),
      db.query(`
      SELECT
        fs.*,
        u.unique_id,
        u.first_name,
        u.last_name
      FROM fee_statements fs
      JOIN students s ON s.id = fs.student_id
      JOIN users u ON u.id = s.user_id
      ORDER BY fs.created_at DESC
      LIMIT 300
      `).catch(() => [[]]),
      db.query(`
      SELECT
        sp.*,
        u.unique_id,
        u.first_name,
        u.last_name,
        s.form_level,
        c.name AS class_name,
        '' AS term,
        YEAR(sp.created_at) AS year
      FROM sponsorships sp
      JOIN students s ON s.id = sp.student_id
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      ORDER BY sp.created_at DESC
      `).catch(() => [[]]),
      db.query(`
      SELECT
        IFNULL(SUM(approved_amount),0) AS approved,
        IFNULL(SUM(paid_amount),0) AS paid,
        IFNULL(SUM(balance),0) AS balance
      FROM sponsorships
      `).catch(() => [[{ approved: 0, paid: 0, balance: 0 }]]),
      db.query(`
      SELECT *
      FROM employees
      ORDER BY first_name, last_name
      `)
    ]);

    /* ================= RENDER ================= */
    return res.render("admin", {
      user,

      stats: {
        students: studentsCount?.total || 0,
        teachers: teachersCount?.total || 0,
        classes: classesCount?.total || 0,
        revenue: revenue?.total || 0
      },

      students: studentsList || [],
      teachersList: teachersList || [],

      // ✅ pass BOTH (your EJS currently uses safeClassesList, but your new edits use safeClasses)
      classesList: classesList || [],
      safeClasses: classesList || [],

      subjects: subjects || [],
      feeStructure: feeStructure || [],
      activities: activities || [],

      finance: {
        total_income: totalIncome?.total || 0,
        total_expenses: totalExpenses?.total || 0,
        invoices: invoices || [],
        payments: payments || [],
        expenses: expenses || [],
        suppliers: suppliers || [],
        expenseCategories: expenseCategories || [],
        purchaseCategories: purchaseCategories || [],
        assets: assets || [],
        ledger: ledger || [],
        receipts: receipts || [],
        studentLedger: studentLedger || [],
        cashbook: cashbook || [],
        budgets: budgets || [],
        auditLogs: auditLogs || [],
        feeStatements: feeStatements || [],
        beamCamfed: beamCamfed || [],
        beamCamfedStats: beamCamfedStats || { approved: 0, paid: 0, balance: 0 },
        employees: employees || []
      },

      employees: employees || []
    });
  } catch (err) {
    console.error("Admin page error:", err);
    return res.status(500).send("Server Error");
  }
});

app.get("/admin/students/search", requireAuth("admin"), async (req, res) => {

    try {

        const db = req.app.locals.db;

        const query = req.query.q?.trim() || "";

        if (!query) {
            return res.json([]);
        }

        const searchTerm = `%${query}%`;

        const [students] = await db.query(`
            SELECT
                s.id,
                s.class_id,
                u.unique_id,
                u.first_name,
                u.last_name,
                s.form_level,
                s.email,
                s.phone,
                s.date_of_birth,
                s.birth_id_number,
                s.status
            FROM students s
            JOIN users u ON u.id = s.user_id
            WHERE
                u.first_name LIKE ?
                OR u.last_name LIKE ?
                OR u.unique_id LIKE ?
                OR s.phone LIKE ?
                OR s.birth_id_number LIKE ?
            ORDER BY u.last_name ASC, u.first_name ASC, u.unique_id ASC
            LIMIT 30
        `, [
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm,
            searchTerm
        ]);

        res.json(students);

    } catch (err) {

        console.error("Student search error:", err);

        res.status(500).json([]);

    }

});

app.get("/admin/students/:id/details", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const studentId = Number(req.params.id);

  if (!Number.isInteger(studentId) || studentId < 1) {
    return res.status(400).json({ message: "Invalid student ID" });
  }

  try {
    const [studentRows] = await db.query(`
      SELECT
        s.id,
        s.class_id,
        s.form_level,
        s.email,
        s.phone,
        s.date_of_birth,
        s.birth_id_number,
        s.status,
        s.admission_year,
        s.created_at AS admitted_at,
        u.unique_id,
        u.first_name,
        u.last_name,
        u.username,
        u.email AS account_email,
        u.created_at AS account_created_at,
        c.name AS class_name,
        c.class_code,
        c.room
      FROM students s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN classes c ON c.id = s.class_id
      WHERE s.id = ?
      LIMIT 1
    `, [studentId]);

    if (!studentRows.length) {
      return res.status(404).json({ message: "Student not found" });
    }

    const [
      [classHistory],
      [attendance],
      [grades],
      [submissions],
      [fees],
      [invoices],
      [receipts],
      [ledger],
      [sponsorships],
      guardian,
      [borrowings]
    ] = await Promise.all([
      db.query(`
        SELECT c.name AS class_name, c.class_code, c.room, c.form_level,
               t.name AS term_name, t.year
        FROM student_classes sc
        JOIN classes c ON c.id = sc.class_id
        JOIN terms t ON t.id = sc.term_id
        WHERE sc.student_id = ?
        ORDER BY t.year DESC, t.term_number DESC
      `, [studentId]).catch(() => [[]]),
      db.query(`
        SELECT date, status
        FROM attendance
        WHERE student_id = ?
        ORDER BY date DESC
      `, [studentId]),
      db.query(`
        SELECT g.score, g.grade, g.created_at, a.title AS assignment,
               sub.name AS subject
        FROM grades g
        LEFT JOIN assignments a ON a.id = g.assignment_id
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        WHERE g.student_id = ?
        ORDER BY g.created_at DESC
      `, [studentId]),
      db.query(`
        SELECT a.title AS assignment, sub.name AS subject,
               a.due_date, ss.file_path, ss.submitted_at
        FROM submissions ss
        JOIN assignments a ON a.id = ss.assignment_id
        LEFT JOIN subjects sub ON sub.id = a.subject_id
        WHERE ss.student_id = ?
        ORDER BY ss.submitted_at DESC
      `, [studentId]),
      db.query(`
        SELECT id, term_id, amount, paid, method, reference, date_paid
        FROM fees
        WHERE student_id = ?
        ORDER BY date_paid DESC, id DESC
      `, [studentId]),
      db.query(`
        SELECT id, term, year, total_amount, status, pay_start, pay_end, created_at
        FROM invoices
        WHERE student_id = ?
        ORDER BY year DESC, id DESC
      `, [studentId]),
      db.query(`
        SELECT receipt_number, amount, payment_method, reference, receipt_date
        FROM receipts
        WHERE student_id = ?
        ORDER BY receipt_date DESC
      `, [studentId]).catch(() => [[]]),
      db.query(`
        SELECT transaction_date, description, debit, credit, balance,
               reference_type, reference_id
        FROM student_ledger
        WHERE student_id = ?
        ORDER BY transaction_date DESC, id DESC
      `, [studentId]).catch(() => [[]]),
      db.query(`
        SELECT sponsor_type, approved_amount, paid_amount, balance, status,
               notes, created_at
        FROM sponsorships
        WHERE student_id = ?
        ORDER BY created_at DESC
      `, [studentId]).catch(() => [[]]),
      db.query(`
        SELECT name, email, phone
        FROM customers
        WHERE student_id = ?
        LIMIT 1
      `, [studentId]).then(([rows]) => rows[0] || null).catch(() => null),
      db.query(`
        SELECT b.title, b.author, lb.borrowed_at, lb.due_date,
               lb.returned_at, lb.status
        FROM library_borrowings lb
        JOIN library_books b ON b.id = lb.book_id
        WHERE lb.student_id = ?
        ORDER BY lb.borrowed_at DESC
      `, [studentId]).catch(() => [[]])
    ]);

    return res.json({
      student: studentRows[0],
      classHistory,
      attendance,
      grades,
      submissions,
      fees,
      invoices,
      receipts,
      ledger,
      sponsorships,
      guardian,
      borrowings
    });
  } catch (err) {
    console.error("Student details error:", err);
    return res.status(500).json({ message: "Could not load student details" });
  }
});

app.post("/admin/teachers/edit", requireAuth("admin"), async (req, res) => {
  const { id, first_name, last_name, email, department, status, employee_number, date_of_appointment } = req.body;

  await req.app.locals.db.query(`
    UPDATE teachers t
    JOIN users u ON t.user_id = u.id
    SET
      u.first_name = ?,
      u.last_name = ?,
      t.employee_number = ?,
      t.date_of_appointment = ?,
      t.email = ?,
      t.department = ?,
      t.status = ?
    WHERE t.id = ?
  `, [first_name, last_name, employee_number, date_of_appointment, email, department, status, id]);

  res.redirect("/admin#teachers");
});


app.post("/admin/teachers/delete/:id", requireAuth("admin"), async (req, res) => {
  const teacherId = req.params.id;

  // find user_id first
  const [[t]] = await req.app.locals.db.query(`SELECT user_id FROM teachers WHERE id=?`, [teacherId]);

  if (t?.user_id) {
    // users row will cascade delete teachers because teachers.user_id has ON DELETE CASCADE
    await req.app.locals.db.query("DELETE FROM users WHERE id=?", [t.user_id]);
  } else {
    await req.app.locals.db.query("DELETE FROM teachers WHERE id=?", [teacherId]);
  }

  res.redirect("/admin#teachers");
});

app.post(
  "/admin/teachers/import",
  requireAuth("admin"),
  uploadCsv.single("teachers_file"),
  async (req, res) => {

    const db = req.app.locals.db;
    const results = [];

    try {
      if (!req.file) {
        return res.status(400).send("No CSV uploaded");
      }

      fs.createReadStream(req.file.path)
        .pipe(csv({
          separator: ",",
          mapHeaders: ({ header }) =>
            header.trim().toLowerCase()
        }))
        .on("data", (row) => {
          results.push(row);
        })
        .on("end", async () => {

          let imported = 0;
          let skipped = 0;

          for (const r of results) {

            const firstName = (
              r["name"] ||
              r["first name"] ||
              r["firstname"] ||
              ""
            ).trim();

            const lastName = (
              r["last name"] ||
              r["lastname"] ||
              r["surname"] ||
              ""
            ).trim();

            if (!firstName || !lastName) {
              skipped++;
              continue;
            }

            const email = (
              r["email address"] ||
              r["email"] ||
              ""
            ).trim() || null;

            const phone = (
              r["phone number"] ||
              r["phone"] ||
              ""
            ).trim() || null;

            const department = (
              r["department"] ||
              "General"
            ).trim();

            const employeeNumber = (
              r["id number"] ||
              r["employee number"] ||
              ""
            ).trim() || null;

            const ecNumber = (
              r["e.c number"] ||
              r["ec number"] ||
              ""
            ).trim() || null;

            const appointmentDate = (
              r["date of first apointment"] ||
              r["date of first appointment"] ||
              r["appointment date"] ||
              r["date of appointment"] ||
              ""
            ).trim() || null;

            const status = (
              r["status"] ||
              "active"
            ).trim().toLowerCase();

            let teacherId = null;
            let exists = true;

            while (exists || !teacherId) {
              if (!teacherId) {
                teacherId = generateTeacherId();
              }

              const [check] = await db.query(
                `
                SELECT id
                FROM users
                WHERE username = ?
                   OR unique_id = ?
                `,
                [
                  teacherId.toLowerCase(),
                  teacherId
                ]
              );

              exists = check.length > 0;

              if (exists) {
                teacherId = null;
              }
            }

            const username = teacherId.toLowerCase();

            try {
              const [userResult] = await db.query(
                `
                INSERT INTO users
                (
                  username,
                  password,
                  role,
                  first_name,
                  last_name,
                  unique_id
                )
                VALUES (?, 'NOT_SET', 'teacher', ?, ?, ?)
                `,
                [
                  username,
                  firstName,
                  lastName,
                  teacherId
                ]
              );

              const userId = userResult.insertId;

              await db.query(
                `
                INSERT INTO teachers
                (
                  user_id,
                  department,
                  email,
                  phone,
                  employee_number,
                  ec_number,
                  date_of_appointment,
                  status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                  userId,
                  department,
                  email,
                  phone,
                  employeeNumber,
                  ecNumber,
                  appointmentDate,
                  status
                ]
              );

              imported++;

            } catch (err) {
              console.error("Teacher row failed:", err);
              skipped++;
            }
          }

          try {
            fs.unlinkSync(req.file.path);
          } catch (_) {}

          return res.redirect(
            `/admin?success=teachers_imported&imported=${imported}&skipped=${skipped}#teachers`
          );
        });

    } catch (err) {
      console.error("Teacher import error:", err);

      try {
        if (req.file?.path) {
          fs.unlinkSync(req.file.path);
        }
      } catch (_) {}

      return res.status(500).send("Failed to import teachers");
    }
  }
);

app.get("/admin/teachers/export", requireAuth("admin"), async (req, res) => {
  const [rows] = await req.app.locals.db.query(`
    SELECT
      u.unique_id AS "Teacher ID",
      u.first_name AS "First Name",
      u.last_name AS "Last Name",
      t.email AS "Email",
      t.department AS "Department",
      t.employee_number AS "ID Number",
      t.date_of_appointment AS "Appointment Date",
      t.status AS "Status"
    FROM teachers t
    JOIN users u ON t.user_id = u.id
    ORDER BY u.last_name ASC, u.first_name ASC
  `);

  res.header("Content-Type", "text/csv");
  res.attachment("teachers.csv");

  if (!rows.length) {
    return res.send("Teacher ID,First Name,Last Name,Email,Department,ID Number,Appointment Date,Status\n");
  }

  const headers = Object.keys(rows[0]).join(",");
  let csvOut = headers + "\n";

  for (const r of rows) {
    csvOut += Object.values(r)
      .map(v => {
        if (v === null || v === undefined) return "";
        // basic CSV escaping for commas/quotes/newlines
        const s = String(v);
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      })
      .join(",") + "\n";
  }

  res.send(csvOut);
});

app.post("/admin/students/add", requireAuth("admin"), async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    form_level,
    date_of_birth,
    birth_id_number
  } = req.body;

  const db = req.app.locals.db;
  const firstNameKey = normalizeName(first_name);
  const lastNameKey = normalizeName(last_name);
  const birthIdNumber = normalizeBirthId(birth_id_number);

  if (!firstNameKey || !lastNameKey) {
    return res.redirect("/admin?error=student_name_required#students");
  }

  const [[existingStudentName]] = await db.query(
    `
    SELECT s.id
    FROM students s
    JOIN users u ON u.id = s.user_id
    WHERE LOWER(TRIM(u.first_name)) = ?
      AND LOWER(TRIM(u.last_name)) = ?
    LIMIT 1
    `,
    [firstNameKey, lastNameKey]
  );

  if (existingStudentName) {
    return res.redirect("/admin?error=student_exists#students");
  }

  if (!birthIdNumber) {
    return res.redirect("/admin?error=birth_id_required#students");
  }

  const [[existingBirthId]] = await db.query(
    "SELECT id FROM students WHERE birth_id_number=? LIMIT 1",
    [birthIdNumber]
  );

  if (existingBirthId) {
    return res.redirect("/admin?error=duplicate_birth_id#students");
  }

  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    let regNumber;
    let exists = true;

    while (exists) {
      regNumber = generateStudentReg();
      const [check] = await conn.query(
        "SELECT id FROM users WHERE unique_id=?",
        [regNumber]
      );
      exists = check.length > 0;
    }

    const username = regNumber.toLowerCase();

    const [userResult] = await conn.query(
      `
      INSERT INTO users (username, password, role, first_name, last_name, unique_id)
      VALUES (?, 'NOT_SET', 'student', ?, ?, ?)
      `,
      [username, first_name, last_name, regNumber]
    );

    const userId = userResult.insertId;

    await conn.query(
      `
      INSERT INTO students (user_id, form_level, email, phone, date_of_birth, birth_id_number)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        form_level,
        email,
        phone,
        date_of_birth || null,
        birthIdNumber
      ]
    );

    await conn.commit();
    res.redirect("/admin#students");

  } catch (err) {
    if (conn) {
      await conn.rollback();
    }

    console.error("Add student error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.redirect("/admin?error=duplicate_birth_id#students");
    }

    res.redirect("/admin?error=student_add_failed#students");
  } finally {
    if (conn) {
      conn.release();
    }
  }
});


app.post("/admin/students/delete/:id", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const studentId = req.params.id;

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // Get linked user (so we can optionally delete the login account too)
    const [[stu]] = await conn.query(
      "SELECT id, user_id FROM students WHERE id=? LIMIT 1",
      [studentId]
    );

    if (!stu) {
      await conn.rollback();
      return res.redirect("/admin#students?error=student_not_found");
    }

    await deleteStudentRecord(conn, studentId);

    await conn.commit();
    return res.redirect("/admin#students?success=student_deleted_permanently");
  } catch (err) {
    try { if (conn) await conn.rollback(); } catch (_) {}
    console.error("Hard delete student error:", err);
    return res.redirect("/admin#students?error=delete_failed");
  } finally {
    if (conn) conn.release();
  }
});

app.get(
  "/admin/classes/:id/students",
  requireAuth("admin"),
  async (req, res) => {

    try {

      const db = req.app.locals.db;

      const classId = req.params.id;

      const [students] = await db.query(`
        SELECT
          s.id,
          s.form_level,
          s.email,
          s.phone,
          s.status,
          u.unique_id,
          u.first_name,
          u.last_name
        FROM students s
        JOIN users u
          ON u.id = s.user_id
        WHERE s.class_id = ?
        ORDER BY
          u.first_name ASC,
          u.last_name ASC
      `, [classId]);

      return res.json(students);

    } catch (err) {

      console.error(
        "CLASS STUDENTS ERROR:",
        err
      );

      return res.status(500).json({
        success: false,
        message: "Failed loading students"
      });

    }

  }
);
app.post("/admin/students/edit", requireAuth("admin"), async (req, res) => {
  const {
    id,
    first_name,
    last_name,
    email,
    phone,
    form_level,
    status,
    date_of_birth,
    birth_id_number
  } = req.body;

  const firstNameKey = normalizeName(first_name);
  const lastNameKey = normalizeName(last_name);
  const birthIdNumber = normalizeBirthId(birth_id_number);

  if (!firstNameKey || !lastNameKey) {
    return res.redirect("/admin?error=student_name_required#students");
  }

  const [[existingStudentName]] = await req.app.locals.db.query(
    `
    SELECT s.id
    FROM students s
    JOIN users u ON u.id = s.user_id
    WHERE LOWER(TRIM(u.first_name)) = ?
      AND LOWER(TRIM(u.last_name)) = ?
      AND s.id <> ?
    LIMIT 1
    `,
    [firstNameKey, lastNameKey, id]
  );

  if (existingStudentName) {
    return res.redirect("/admin?error=student_exists#students");
  }

  if (!birthIdNumber) {
    return res.redirect("/admin?error=birth_id_required#students");
  }

  const [[existingBirthId]] = await req.app.locals.db.query(
    "SELECT id FROM students WHERE birth_id_number=? AND id<>? LIMIT 1",
    [birthIdNumber, id]
  );

  if (existingBirthId) {
    return res.redirect("/admin?error=duplicate_birth_id#students");
  }

  try {
    await req.app.locals.db.query(
      `
      UPDATE students s
      JOIN users u ON s.user_id = u.id
      SET
        u.first_name = ?,
        u.last_name  = ?,
        s.email      = ?,
        s.phone      = ?,
        s.form_level = ?,
        s.status     = ?,
        s.date_of_birth     = ?,
        s.birth_id_number   = ?
      WHERE s.id = ?
      `,
      [
        first_name,
        last_name,
        email,
        phone,
        form_level,
        status,
        date_of_birth || null,
        birthIdNumber,
        id
      ]
    );

    res.redirect("/admin#students");
  } catch (err) {
    console.error("Edit student error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.redirect("/admin?error=duplicate_birth_id#students");
    }

    res.redirect("/admin?error=student_edit_failed#students");
  }
});

const csvUpload = multer({ dest: "uploads/tmp" });

app.post(
  "/admin/students/import",
  requireAuth("admin"),
  uploadCsv.single("students_file"),
  async (req, res) => {

    const db = req.app.locals.db;
    const results = [];

    try {

      if (!req.file) {
        return res.status(400).send("No CSV uploaded");
      }

      console.log("Uploaded File:", req.file);

      fs.createReadStream(req.file.path)

        .pipe(csv({
          mapHeaders: ({ header }) =>
            header
              .trim()
              .toLowerCase()
        }))

        .on("data", (row) => {

          // Debug CSV rows
          console.log("CSV Row:", row);

          results.push(row);
        })

        .on("end", async () => {

          let imported = 0;
          let skipped = 0;
          const seenBirthIds = new Set();

          console.log("CSV Rows Found:", results.length);

          for (const r of results) {

            // =========================
            // STUDENT DETAILS
            // =========================

            const firstName =
              r["first name"] ||
              r["firstname"] ||
              r["first_name"] ||
              r["first name "] ||
              "";

            const lastName =
              r["last name"] ||
              r["lastname"] ||
              r["surname"] ||
              r["last_name"] ||
              r["last name "] ||
              "";

            // Skip invalid rows
            if (
              !firstName.trim() ||
              !lastName.trim()
            ) {

              console.log(
                "Skipped row (missing names):",
                r
              );

              skipped++;
              continue;
            }

            const email =
              r["email"] ||
              r["e mail"] ||
              r["e-mail"] ||
              null;

            const phone =
              r["phone"] ||
              r["phone number"] ||
              null;

            const formLevel =
              r["form"] ||
              r["form level"] ||
              r["form_level"] ||
              null;

            const dob =
              r["dob"] ||
              r["d o b"] ||
              r["date of birth"] ||
              null;

            const birthId = normalizeBirthId(
              r["birth id"] ||
              r["birth id number"] ||
              r["birthid"] ||
              r["national id"] ||
              r["national id number"] ||
              ""
            );

            if (!birthId || seenBirthIds.has(birthId)) {
              skipped++;
              continue;
            }

            const [[existingBirthId]] = await db.query(
              "SELECT id FROM students WHERE birth_id_number=? LIMIT 1",
              [birthId]
            );

            if (existingBirthId) {
              skipped++;
              continue;
            }

            seenBirthIds.add(birthId);

            const status =
              (
                r["status"] ||
                "active"
              )
              .trim()
              .toLowerCase();

            // =========================
            // REG NUMBER
            // =========================

            let regNumber =
              r["reg no"] ||
              r["reg number"] ||
              r["registration number"] ||
              null;

            let exists = true;

            while (exists || !regNumber) {

              // Auto-generate if missing
              if (!regNumber) {
                regNumber = generateStudentReg();
              }

              const [check] = await db.query(
                `
                SELECT id
                FROM users
                WHERE username=? OR unique_id=?
                `,
                [
                  regNumber.toLowerCase(),
                  regNumber
                ]
              );

              exists = check.length > 0;

              // Reg already exists
              if (exists) {
                regNumber = null;
              }
            }

            const username =
              regNumber.toLowerCase();

            try {

              // =========================
              // INSERT USER
              // =========================

              const [userResult] =
                await db.query(
                  `
                  INSERT INTO users
                  (
                    username,
                    password,
                    role,
                    first_name,
                    last_name,
                    unique_id
                  )
                  VALUES
                  (?, 'NOT_SET', 'student', ?, ?, ?)
                  `,
                  [
                    username,
                    firstName.trim(),
                    lastName.trim(),
                    regNumber
                  ]
                );

              const userId =
                userResult.insertId;

              // =========================
              // INSERT STUDENT
              // =========================

              await db.query(
                `
                INSERT INTO students
                (
                  user_id,
                  form_level,
                  email,
                  phone,
                  date_of_birth,
                  birth_id_number,
                  status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                [
                  userId,
                  formLevel,
                  email,
                  phone,
                  dob || null,
                  birthId || null,
                  status
                ]
              );

              imported++;

              console.log(
                `Imported: ${firstName} ${lastName}`
              );

            } catch (err) {

              console.error(
                "Row import failed:",
                err
              );

              skipped++;
            }
          }

          // =========================
          // DELETE TEMP FILE
          // =========================

          try {

            fs.unlinkSync(req.file.path);

          } catch (err) {

            console.error(
              "File delete error:",
              err
            );
          }

          console.log({
            imported,
            skipped
          });

          // =========================
          // REDIRECT
          // =========================

          res.redirect(
            `/admin?success=students_imported&imported=${imported}&skipped=${skipped}#students`
          );

        });

    } catch (err) {

      console.error(
        "Student import error:",
        err
      );

      try {

        if (req.file?.path) {
          fs.unlinkSync(req.file.path);
        }

      } catch (_) {}

      res
        .status(500)
        .send("Failed to import students");
    }
  }
);

app.get("/admin/students/export", requireAuth("admin"), async (req, res) => {
  const [rows] = await req.app.locals.db.query(`
    SELECT 
      u.unique_id AS "Reg No",
      u.first_name AS "First Name",
      u.last_name AS "Last Name",
      s.form_level AS "Form",
      s.email AS "Email",
      s.phone AS "Phone",
      s.date_of_birth AS "DOB",
      s.birth_id_number AS "Birth ID Number",
      s.status AS "Status"
    FROM students s
    JOIN users u ON s.user_id = u.id
    ORDER BY u.last_name ASC, u.first_name ASC, u.unique_id ASC
  `);

  res.header("Content-Type", "text/csv");
  res.attachment("students.csv");

  if (!rows.length) {
    return res.send("Reg No,First Name,Last Name,Form,Email,Phone,DOB,Birth ID Number,Status\n");
  }

  // safer CSV building (handles commas/quotes)
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headers = Object.keys(rows[0]);
  let csvOut = headers.join(",") + "\n";

  for (const r of rows) {
    csvOut += headers.map((h) => esc(r[h])).join(",") + "\n";
  }

  res.send(csvOut);
});


app.post("/admin/teachers/add", requireAuth("admin"), async (req, res) => {
  const { first_name, last_name, email, department, status, employee_number, date_of_appointment } = req.body;

  let teacherId;
  let exists = true;

  while (exists) {
    teacherId = generateTeacherId();
    const [check] = await req.app.locals.db.query(
      "SELECT id FROM users WHERE unique_id=?",
      [teacherId]
    );
    exists = check.length > 0;
  }

  const username = teacherId;

  const [userResult] = await req.app.locals.db.query(`
    INSERT INTO users (username, password, role, first_name, last_name, unique_id)
    VALUES (?, 'NOT_SET', 'teacher', ?, ?, ?)
  `, [username, first_name, last_name, teacherId]);

  const userId = userResult.insertId;

  await req.app.locals.db.query(`
    INSERT INTO teachers (user_id, employee_number, date_of_appointment, email, department, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [userId, employee_number, date_of_appointment, email, department, status]);

  res.redirect("/admin#teachers");
});


app.post("/admin/classes/add", requireAuth("admin"), async (req, res) => {
    const { name, form_level, room } = req.body;

    const [count] = await req.app.locals.db.query("SELECT COUNT(*) AS total FROM classes");
    const classCode = `CLS${String(count[0].total + 1).padStart(3, "0")}`;

    await req.app.locals.db.query(`
        INSERT INTO classes (class_code, name, form_level, room)
        VALUES (?, ?, ?, ?)
    `, [classCode, name, form_level, room]);

    res.redirect("/admin#classes");
});

app.post("/admin/classes/edit", requireAuth("admin"), async (req, res) => {
    const { id, name, form_level, room } = req.body;
    await req.app.locals.db.query(
        "UPDATE classes SET name=?, form_level=?, room=? WHERE id=?",
        [name, form_level, room, id]
    );
    res.redirect("/admin#classes");
});

app.post("/admin/classes/assign-teacher", requireAuth("admin"), async (req, res) => {
    let { class_id, teacher_ids } = req.body;

    if (!Array.isArray(teacher_ids)) {
        teacher_ids = [teacher_ids];
    }

    for (const teacher_id of teacher_ids) {
        // Prevent duplicates
        const [[existing]] = await req.app.locals.db.query(
            "SELECT * FROM teaching_assignments WHERE class_id = ? AND teacher_id = ?",
            [class_id, teacher_id]
        );
        if (!existing) {
            await req.app.locals.db.query(
                "INSERT INTO teaching_assignments (class_id, teacher_id) VALUES (?, ?)",
                [class_id, teacher_id]
            );
        }
    }

    res.redirect("/admin#classes");
});

app.post("/admin/classes/deassign-teacher", requireAuth("admin"), async (req, res) => {
    let { class_id, teacher_ids } = req.body;

    if (!Array.isArray(teacher_ids)) {
        teacher_ids = [teacher_ids];
    }

    for (const teacher_id of teacher_ids) {
        await req.app.locals.db.query(
            "DELETE FROM teaching_assignments WHERE class_id = ? AND teacher_id = ?",
            [class_id, teacher_id]
        );
    }

    res.redirect("/admin#classes");
});

// Get all teachers assigned to a class
app.get("/admin/classes/:class_id/assigned-teachers", requireAuth("admin"), async (req, res) => {
    const class_id = req.params.class_id;

    const [teachers] = await req.app.locals.db.query(`
        SELECT t.id, u.first_name, u.last_name
        FROM teaching_assignments ta
        JOIN teachers t ON ta.teacher_id = t.id
        JOIN users u ON t.user_id = u.id
        WHERE ta.class_id = ?
        ORDER BY u.last_name, u.first_name
    `, [class_id]);

    res.json(teachers);
});

app.post('/admin/classes/assign-subjects', requireAuth("admin"), async (req, res) => {
    try {
        const { class_id } = req.body;

        // Normalize subject_ids into an array
        let subjectIds = req.body.subject_ids || [];
        if (!Array.isArray(subjectIds)) subjectIds = [subjectIds];

        // If no subjects selected, optionally block
        if (subjectIds.length === 0) {
            return res.status(400).send("Select at least one subject");
        }

        // Remove existing assignments
        await req.app.locals.db.query(
            "DELETE FROM class_subjects WHERE class_id = ?",
            [class_id]
        );

        // Insert new assignments (allowing multiple subjects)
        await Promise.all(subjectIds.map(sid => 
            req.app.locals.db.query(
                "INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)",
                [class_id, sid]
            )
        ));

        res.redirect('/admin#classes');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error assigning subjects");
    }
});


app.post("/admin/classes/delete/:id", requireAuth("admin"), async (req, res) => {
    const { id } = req.params;
    const db = req.app.locals.db;

    try {
        // 🔥 Disable foreign key checks
        await db.query("SET FOREIGN_KEY_CHECKS = 0");

        // 1️⃣ Delete students in the class
        await db.query(
            "DELETE FROM students WHERE class_id = ?",
            [id]
        );

        // 2️⃣ Delete teaching assignments
        await db.query(
            "DELETE FROM teaching_assignments WHERE class_id = ?",
            [id]
        );

        // 3️⃣ Delete class subjects
        await db.query(
            "DELETE FROM class_subjects WHERE class_id = ?",
            [id]
        );

        // 4️⃣ Delete the class itself
        await db.query(
            "DELETE FROM classes WHERE id = ?",
            [id]
        );

        // 🔒 Re-enable FK checks
        await db.query("SET FOREIGN_KEY_CHECKS = 1");

        res.redirect("/admin#classes");

    } catch (err) {
        console.error("HARD delete class error:", err);

        // Ensure FK checks are restored even on failure
        await db.query("SET FOREIGN_KEY_CHECKS = 1");

        res.status(500).send("Failed to delete class and related data");
    }
});

app.post('/admin/classes/assign-student', requireAuth("admin"), async (req, res) => {
  try {
    const { class_id } = req.body;

    let studentIds = req.body.student_ids || req.body["student_ids[]"] || [];

    if (!Array.isArray(studentIds)) {
      studentIds = [studentIds];
    }

    if (!class_id || studentIds.length === 0) {
      return res.redirect("/admin?error=missing_assignment_data#classes");
    }

    for (const studentId of studentIds) {
      await req.app.locals.db.query(
        "UPDATE students SET class_id = ? WHERE id = ?",
        [class_id, studentId]
      );

      await req.app.locals.db.query(
        "INSERT INTO system_logs (message) VALUES (?)",
        [`Student ID ${studentId} assigned to class ID ${class_id}`]
      );
    }

    res.redirect(`/admin?updated=${Date.now()}#classes`);
  } catch (err) {
    console.error("Assign student error:", err);
    res.redirect("/admin?error=assign_student_failed#classes");
  }
});

app.post('/admin/classes/assign-subjects', async (req, res) => {
    try {
        let { class_id, subject_ids } = req.body;

        // Ensure class_id exists
        if (!class_id) throw new Error("Class ID is required");

        // Normalize subject_ids to an array
        if (!Array.isArray(subject_ids)) {
            subject_ids = subject_ids ? [subject_ids] : [];
        }

        // Remove existing assignments
        await req.app.locals.db.query(
            "DELETE FROM class_subjects WHERE class_id = ?",
            [class_id]
        );

        // Insert new assignments (only if there are subjects)
        if (subject_ids.length > 0) {
            const inserts = subject_ids.map(sid =>
                req.app.locals.db.query(
                    "INSERT INTO class_subjects (class_id, subject_id) VALUES (?, ?)",
                    [class_id, sid]
                )
            );

            await Promise.all(inserts);
        }

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
});


app.post('/admin/subjects/add', async (req, res) => {
    try {
        const { name, class_id } = req.body;

        await req.app.locals.db.query(
            "INSERT INTO subjects (name, class_id) VALUES (?, ?)",
            [name, class_id]
        );

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
});


app.post('/admin/subjects/edit', async (req, res) => {
    try {
        const { id, name } = req.body;

        await req.app.locals.db.query(
            "UPDATE subjects SET name = ? WHERE id = ?",
            [name, id]
        );

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
});


app.post('/admin/subjects/delete/:id', async (req, res) => {
    try {
        await req.app.locals.db.query(
            "DELETE FROM subjects WHERE id = ?",
            [req.params.id]
        );

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
});

app.post("/admin/fees/structure/save", async (req, res) => {
    const { form_level, term_fee, annual_fee } = req.body;

    await req.app.locals.db.query(`
        INSERT INTO fee_structure (form_level, term_fee, annual_fee)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
            term_fee = VALUES(term_fee),
            annual_fee = VALUES(annual_fee)
    `, [form_level, term_fee, annual_fee]);

    res.redirect("/admin");
});


app.post("/admin/fees/pay", async (req, res) => {
    const {
        student_id,
        amount,
        paid,
        method,
        reference,
        date_paid
    } = req.body;

    await req.app.locals.db.query(`
        INSERT INTO fees
        (student_id, amount, paid, method, reference, date_paid)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [
        student_id,
        amount,
        paid,
        method,
        reference,
        date_paid
    ]);

    res.redirect("/admin");
});

app.get("/admin/fees/reports", async (req, res) => {
    const { student_id, form_level, period, start_date, end_date } = req.query;

    let whereClauses = ["1=1"];
    let params = [];

    // Period filters
    if (period === "month") {
        whereClauses.push("MONTH(f.date_paid) = MONTH(CURDATE())");
    } 
    if (period === "year") {
        whereClauses.push("YEAR(f.date_paid) = YEAR(CURDATE())");
    } 
    if (period === "custom" && start_date && end_date) {
        whereClauses.push("f.date_paid BETWEEN ? AND ?");
        params.push(start_date, end_date);
    }

    // Student & form_level filters
    if (student_id) {
        whereClauses.push("s.id = ?");
        params.push(student_id);
    }
    if (form_level) {
        whereClauses.push("s.form_level = ?");
        params.push(form_level);
    }

    // Build the query
    const query = `
        SELECT
            s.id AS student_id,
            s.user_id,
            u.first_name,
            u.last_name,
            s.form_level,
            s.phone,
            IFNULL(SUM(f.paid), 0) AS total_paid,
            fs.annual_fee
        FROM students s
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN fees f ON f.student_id = s.id
        LEFT JOIN fee_structure fs ON fs.form_level = s.form_level
        WHERE ${whereClauses.join(" AND ")}
        GROUP BY s.id
    `;


    const [report] = await req.app.locals.db.query(query, params);

    res.render("fees-report", { report });
});


app.post("/admin/fees/structure/update", async (req, res) => {
    const { id, term_fee, annual_fee } = req.body;

    await req.app.locals.db.query(`
        UPDATE fee_structure
        SET term_fee = ?, annual_fee = ?
        WHERE id = ?
    `, [term_fee, annual_fee, id]);

    res.redirect("/admin");
});

app.get("/api/library", async (req, res) => {
  try {
    const [rows] = await req.app.locals.db.query(`
      SELECT
        lb.id,
        lb.title,
        lb.author,
        s.name AS category,
        lb.file_type,
        lb.available,
        lb.file_path
      FROM library_books lb
      LEFT JOIN subjects s ON lb.subject_id = s.id
      ORDER BY lb.id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("API /library error:", err);
    res.status(500).json({ error: "Failed to load library" });
  }
});

app.delete("/api/library/:id", async (req, res) => {
    await req.app.locals.db.query("DELETE FROM library_books WHERE id = ?", [req.params.id]);
    res.json({ success: true });
});

app.post("/api/library", async (req, res) => {
    const { title, author, category, type } = req.body;

    await req.app.locals.db.query(
        "INSERT INTO library_books (title, author, category, type) VALUES (?, ?, ?, ?)",
        [title, author, category, type]
    );

    res.json({ success: true });
});

app.post(
    "/admin/library/add",
    upload.single("resource_file"),
    async (req, res) => {
        try {
            const { title, author, subject_id } = req.body;

            if (!req.file) {
                return res.status(400).send("No file uploaded");
            }

            // ✅ DEFINE THESE (THIS WAS MISSING)
            const filePath = `uploads/resources/${req.file.filename}`;
            const fileType = req.file.originalname
                .split(".")
                .pop()
                .toUpperCase();

            await req.app.locals.db.query(
                `
                INSERT INTO library_books
                (title, author, subject_id, file_path, file_type)
                VALUES (?, ?, ?, ?, ?)
                `,
                [title, author, subject_id, filePath, fileType]
            );

            res.redirect("/admin");

        } catch (err) {
            console.error("Library upload error:", err);
            res.status(500).send("Failed to add library book");
        }
    }
);


app.put("/api/library/:id", async (req, res) => {
    const { title, author, category, available } = req.body;

    await req.app.locals.db.query(
        "UPDATE library_books SET title=?, author=?, category=?, available=? WHERE id=?",
        [title, author, category, available, req.params.id]
    );

    res.json({ success: true });
});

app.post("/api/library/borrow", async (req, res) => {
    const { student_id, book_id, due_date } = req.body;

    // Prevent borrowing unavailable books
    const [[book]] = await req.app.locals.db.query(
        "SELECT available, file_path FROM library_books WHERE id = ?",
        [book_id]
    );
    
    if (book.file_path) {
        return res.status(400).json({ error: "Digital resources cannot be borrowed" });
    }
    
    if (!book.available) {
        return res.status(400).json({ error: "Book not available" });
    }


    // Create borrow record
    await req.app.locals.db.query(`
        INSERT INTO library_borrowings
        (student_id, book_id, borrowed_at, due_date)
        VALUES (?, ?, CURDATE(), ?)
    `, [student_id, book_id, due_date]);

    // Mark book as unavailable
    await req.app.locals.db.query(
        "UPDATE library_books SET available = FALSE WHERE id = ?",
        [book_id]
    );

    res.json({ success: true });
});

app.post("/api/library/return/:borrow_id", async (req, res) => {

    const [[record]] = await req.app.locals.db.query(
        "SELECT book_id FROM library_borrowings WHERE id = ?",
        [req.params.borrow_id]
    );

    await req.app.locals.db.query(`
        UPDATE library_borrowings
        SET returned_at = CURDATE(), status = 'RETURNED'
        WHERE id = ?
    `, [req.params.borrow_id]);

    await req.app.locals.db.query(
        "UPDATE library_books SET available = TRUE WHERE id = ?",
        [record.book_id]
    );

    res.json({ success: true });
});


// ================= RESOURCE DOWNLOAD =================
app.get("/resources/download/:id", requireAuth("student"), async (req, res) => {
    const [rows] = await req.app.locals.db.query(
        "SELECT file_path FROM resources WHERE id = ?",
        [req.params.id]
    );

    if (!rows.length) return res.status(404).send("File not found");

    res.download(rows[0].file_path);
});


app.get("/api/notices", async (req, res) => {
    const role = req.session.role?.toUpperCase() || "ALL";

    const [rows] = await req.app.locals.db.query(`
        SELECT *
        FROM notices
        WHERE status = 'PUBLISHED'
        AND (
            visibility = 'ALL'
            OR visibility = ?
        )
        ORDER BY created_at DESC
    `, [role]);

    res.json(rows);
});

app.post("/api/notices", async (req, res) => {
    const { title, message, category } = req.body;

    await req.app.locals.db.query(
        "INSERT INTO notices (title, message, category) VALUES (?, ?, ?)",
        [title, message, category]
    );

    res.json({ success: true });
});

app.put("/api/notices/:id", async (req, res) => {
    const { title, message, category } = req.body;

    await req.app.locals.db.query(
        "UPDATE notices SET title=?, message=?, category=? WHERE id=?",
        [title, message, category, req.params.id]
    );

    res.json({ success: true });
});

app.delete("/api/notices/:id", async (req, res) => {
    await req.app.locals.db.query("DELETE FROM notices WHERE id=?", [req.params.id]);
    res.json({ success: true });
});

app.post("/api/notices/schedule", async (req, res) => {
    const { title, message, category, visibility, publish_at } = req.body;

    await req.app.locals.db.query(`
        INSERT INTO notices
        (title, message, category, visibility, publish_at, status)
        VALUES (?, ?, ?, ?, ?, 'SCHEDULED')
    `, [title, message, category, visibility, publish_at]);

    res.json({ success: true });
});

app.get("/api/reports/kpi", async (req, res) => {

    // Example dynamic queries
    const [[{ total_students }]] = await req.app.locals.db.query(`SELECT COUNT(*) AS total_students FROM students`);
    const [[{ active_teachers }]] = await req.app.locals.db.query(`SELECT COUNT(*) AS active_teachers FROM teachers WHERE status='active'`);
    const [[{ monthly_revenue }]] = await req.app.locals.db.query(`
        SELECT IFNULL(SUM(paid),0) AS monthly_revenue
        FROM fees
        WHERE MONTH(date_paid) = MONTH(CURDATE()) AND YEAR(date_paid) = YEAR(CURDATE())
    `);

    res.json({
        total_students,
        active_teachers,
        monthly_revenue
    });
});

// ✅ Get school info (always returns an object)
app.get("/api/system/school-info", requireAuth("admin"), async (req, res) => {
  try {
    const [[info]] = await req.app.locals.db.query(
      `SELECT id, name, address, phone, email
       FROM school_info
       ORDER BY id ASC
       LIMIT 1`
    );

    // If empty, return safe defaults so UI doesn't break
    res.json(
      info || { id: 0, name: "", address: "", phone: "", email: "" }
    );
  } catch (err) {
    console.error("❌ school-info GET error:", err);
    res.status(500).json({ error: "Failed to load school info" });
  }
});

// ✅ Save school info (UPSERT)
app.put("/api/system/school-info", requireAuth("admin"), async (req, res) => {
  try {
    const { name, address, phone, email } = req.body;

    await req.app.locals.db.query(
      `
      INSERT INTO school_info (id, name, address, phone, email)
      VALUES (1, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        address = VALUES(address),
        phone = VALUES(phone),
        email = VALUES(email)
      `,
      [name, address, phone, email]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("❌ school-info PUT error:", err);
    res.status(500).json({ error: "Failed to save school info" });
  }
});


app.get("/api/system/status", async (req, res) => {
    const dbStatus = "Online"; // can ping DB for real check
    const [[backup]] = await req.app.locals.db.query(`
        SELECT MAX(created_at) AS last_backup
        FROM backups
    `);
    const version = "v15.0";

    res.json({
        dbStatus,
        lastBackup: backup.last_backup || "Never",
        version
    });
});


app.post("/api/system/maintenance", async (req, res) => {
    // Example maintenance tasks
    await req.app.locals.db.query("OPTIMIZE TABLE students");
    await req.app.locals.db.query("OPTIMIZE TABLE teachers");
    await req.app.locals.db.query("OPTIMIZE TABLE fees");
    await req.app.locals.db.query("OPTIMIZE TABLE library_books");

    res.json({ success: true });
});


// Get all users
app.get("/api/system/users", async (req, res) => {
    const [rows] = await req.app.locals.db.query("SELECT id, first_name, last_name, email, role, status FROM users");
    res.json(rows);
});

// Add, update, delete users can follow same pattern


// Get backups
app.get("/api/system/backups", async (req, res) => {
    const [rows] = await req.app.locals.db.query("SELECT backup_file, created_at FROM backups ORDER BY created_at DESC");
    res.json(rows);
});

// Run backup (example: just record entry)
app.post("/api/system/backup", async (req, res) => {
    const file = `backup_${Date.now()}.sql`;
    await req.app.locals.db.query("INSERT INTO backups (backup_file) VALUES (?)", [file]);
    res.json({ success: true });
});

// LOGOUT
app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/"));
});


// ================= TEACHER DASHBOARD =================
app.get("/teacher", requireAuth("teacher"), async (req, res) => {
    const userId = req.session.user.id;

    try {
        // =====================================================
        // GET TEACHER ID
        // =====================================================
        const [[teacher]] = await req.app.locals.db.query(
            `SELECT id FROM teachers WHERE user_id = ?`,
            [userId]
        );

        if (!teacher) {
            return res.status(403).send("Teacher profile not found");
        }

        const teacherId = teacher.id;

        // =====================================================
        // CLASSES WITH SUBJECTS ASSIGNED TO TEACHER
        // =====================================================
        const [classes] = await req.app.locals.db.query(`
            SELECT
                c.id,
                c.name,
                c.form_level,
                c.room,
                COUNT(DISTINCT s.id) AS students,
                GROUP_CONCAT(DISTINCT sub.name ORDER BY sub.name SEPARATOR ', ') AS subjects
            FROM classes c
            JOIN teaching_assignments ta ON ta.class_id = c.id
            LEFT JOIN students s
                ON s.class_id = c.id AND s.status = 'active'
            LEFT JOIN class_subjects cs
                ON cs.class_id = c.id
            LEFT JOIN subjects sub
                ON sub.id = cs.subject_id
            WHERE ta.teacher_id = ?
            GROUP BY c.id
            ORDER BY
                CASE
          WHEN UPPER(TRIM(c.form_level)) LIKE 'ECD A%' OR UPPER(TRIM(c.name)) LIKE 'ECD A%' THEN 1
          WHEN UPPER(TRIM(c.form_level)) LIKE 'ECD B%' OR UPPER(TRIM(c.name)) LIKE 'ECD B%' THEN 2
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 1%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*1' THEN 3
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 2%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*2' THEN 4
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 3%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*3' THEN 5
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 4%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*4' THEN 6
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 5%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*5' THEN 7
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 6%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*6' THEN 8
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 7%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*7' THEN 9
          ELSE 999
        END,
                c.name ASC
        `, [teacherId]);

        // =====================================================
        // STATS
        // =====================================================
        const [[classStat]] = await req.app.locals.db.query(`
            SELECT COUNT(DISTINCT ta.class_id) AS total
            FROM teaching_assignments ta
            WHERE ta.teacher_id = ?
        `, [teacherId]);

        const [[studentStat]] = await req.app.locals.db.query(`
            SELECT COUNT(DISTINCT s.id) AS total
            FROM teaching_assignments ta
            JOIN students s ON s.class_id = ta.class_id
            WHERE ta.teacher_id = ? AND s.status = 'active'
        `, [teacherId]);

        const [[assignmentStat]] = await req.app.locals.db.query(`
            SELECT COUNT(*) AS total
            FROM assignments
            WHERE teacher_id = ?
        `, [teacherId]);

        // =====================================================
        // TODAY'S CLASSES
        // =====================================================
        const [todayClasses] = await req.app.locals.db.query(`
            SELECT
                c.id,
                c.name AS class_name,
                c.form_level,
                c.room,
                COUNT(DISTINCT s.id) AS students
            FROM timetable tt
            JOIN classes c ON c.id = tt.class_id
            JOIN teaching_assignments ta ON ta.class_id = c.id
            LEFT JOIN students s
                ON s.class_id = c.id AND s.status = 'active'
            WHERE ta.teacher_id = ?
              AND tt.day = DAYNAME(CURDATE())
            GROUP BY c.id
            ORDER BY
                CASE
          WHEN UPPER(TRIM(c.form_level)) LIKE 'ECD A%' OR UPPER(TRIM(c.name)) LIKE 'ECD A%' THEN 1
          WHEN UPPER(TRIM(c.form_level)) LIKE 'ECD B%' OR UPPER(TRIM(c.name)) LIKE 'ECD B%' THEN 2
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 1%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*1' THEN 3
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 2%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*2' THEN 4
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 3%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*3' THEN 5
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 4%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*4' THEN 6
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 5%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*5' THEN 7
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 6%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*6' THEN 8
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 7%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*7' THEN 9
          ELSE 999
        END,
                c.name ASC
        `, [teacherId]);

        // =====================================================
        // RESOURCES
        // =====================================================
        const [resources] = await req.app.locals.db.query(`
            SELECT r.*, sub.name AS subject_name, c.form_level
            FROM resources r
            JOIN subjects sub ON r.subject_id = sub.id
            JOIN classes c ON r.class_id = c.id
            WHERE r.uploaded_by = ?
            ORDER BY r.created_at DESC
        `, [userId]);

        // =====================================================
        // SUBJECTS ASSIGNED TO TEACHER
        // =====================================================
        const [subjects] = await req.app.locals.db.query(`
            SELECT DISTINCT sub.id, sub.name
            FROM teaching_assignments ta
            JOIN class_subjects cs ON cs.class_id = ta.class_id
            JOIN subjects sub ON sub.id = cs.subject_id
            WHERE ta.teacher_id = ?
        `, [teacherId]);

        // =====================================================
        // CLASS PERFORMANCE REPORT
        // =====================================================
        const [classPerformance] = await req.app.locals.db.query(`
            SELECT
                c.name AS class_name,
                COUNT(DISTINCT s.id) AS students,
                AVG(g.score) AS average_score
            FROM classes c
            JOIN assignments a ON a.class_id = c.id
            LEFT JOIN grades g ON g.assignment_id = a.id
            LEFT JOIN students s ON s.class_id = c.id
            WHERE a.teacher_id = ?
            GROUP BY c.id
        `, [teacherId]);

        // =====================================================
        // STUDENT PROGRESS REPORT
        // =====================================================
        const [studentProgress] = await req.app.locals.db.query(`
            SELECT
                CONCAT(u.first_name, ' ', u.last_name) AS student_name,
                c.name AS class_name,
                AVG(g.score) AS average_score
            FROM grades g
            JOIN students s ON s.id = g.student_id
            JOIN users u ON u.id = s.user_id
            JOIN assignments a ON a.id = g.assignment_id
            JOIN classes c ON c.id = a.class_id
            WHERE a.teacher_id = ?
            GROUP BY s.id
        `, [teacherId]);

        // =====================================================
        // ATTENDANCE REPORT
        // =====================================================
        const [attendanceReport] = await req.app.locals.db.query(`
            SELECT 
                c.name AS class_name,
                CONCAT(u.first_name, ' ', u.last_name) AS student_name,
                SUM(a.status = 'PRESENT') AS presents,
                SUM(a.status = 'ABSENT') AS absents
            FROM attendance a
            JOIN students s ON s.id = a.student_id
            JOIN users u ON u.id = s.user_id
            JOIN classes c ON c.id = a.class_id
            JOIN teaching_assignments ta ON ta.class_id = c.id
            WHERE ta.teacher_id = ?
            GROUP BY a.student_id, a.class_id
            ORDER BY c.name, student_name
        `, [teacherId]);

        // =====================================================
        // GRADEBOOK
        // =====================================================
        const [gradebook] = await req.app.locals.db.query(`
            SELECT 
                c.id AS class_id,
                c.name AS class_name,
                s.id AS student_id,
                CONCAT(u.first_name, ' ', u.last_name) AS student_name,
                a.id AS assignment_id,
                a.title AS assignment_title,
                g.score,
                g.grade
            FROM teaching_assignments ta
            JOIN classes c ON c.id = ta.class_id
            JOIN assignments a 
                ON a.class_id = c.id 
               AND a.subject_id = ta.subject_id
               AND a.teacher_id = ta.teacher_id
            JOIN students s ON s.class_id = c.id
            JOIN users u ON u.id = s.user_id
            LEFT JOIN grades g 
                ON g.student_id = s.id AND g.assignment_id = a.id
            WHERE ta.teacher_id = ?
            ORDER BY c.name, student_name, a.title
        `, [teacherId]);

        // =====================================================
        // TIMETABLE (FIXED)
        // =====================================================
        const [timetable] = await req.app.locals.db.query(`
          SELECT 
            t.id,
            t.day,
            t.start_time,
            t.end_time,
            c.name AS class_name,
            sub.name AS subject,
            t.room
          FROM timetable t
          JOIN classes c ON t.class_id = c.id
          JOIN subjects sub ON t.subject_id = sub.id
          WHERE t.teacher_id = ?
          ORDER BY FIELD(t.day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'),
                   t.start_time
        `, [teacherId]);

        // =====================================================
        // RENDER TEACHER DASHBOARD
        // =====================================================
        res.render("teacher", {
            user: req.session.user,
            stats: {
                classes: classStat.total || 0,
                students: studentStat.total || 0,
                assignments: assignmentStat.total || 0
            },
            classes,
            todayClasses,
            resources,
            subjects,
            classPerformance,
            studentProgress,
            attendanceReport,
            gradebook,
            timetable
        });

    
    }   catch (err) {
            console.error("Teacher dashboard error:", err);
            return res.status(500).send(`
                <h2>Teacher Dashboard Error</h2>
                <pre>${err.message}</pre>
            `);
        }
});

app.get(
  "/teacher/assignments/by-class/:classId",
  requireAuth("teacher"),
  async (req, res) => {

    const { classId } = req.params;
    const { subject_id } = req.query;
    const userId = req.session.user.id;

    if (!subject_id) return res.json([]);

    try {
      const [rows] = await req.app.locals.db.query(
        `
        SELECT a.id, a.title
        FROM assignments a
        JOIN teachers t ON t.id = a.teacher_id
        JOIN teaching_assignments ta 
          ON ta.teacher_id = t.id
         AND ta.class_id = a.class_id
         AND ta.subject_id = a.subject_id
        WHERE a.class_id = ?
          AND a.subject_id = ?
          AND t.user_id = ?
        ORDER BY a.title
        `,
        [classId, subject_id, userId]
      );

      res.json(rows);
    } catch (err) {
      console.error("Assignments fetch error:", err);
      res.status(500).json({ error: "Failed to load assignments" });
    }
  }
);

app.post(
  "/teacher/assignments/add",
  requireAuth("teacher"),
  upload.single("file"),
  async (req, res) => {

    const { title, description, class_id, subject_id, due_date } = req.body;
    const userId = req.session.user.id;

    if (!req.file) {
      return res.status(400).send("PDF file required");
    }

    const [[teacher]] = await req.app.locals.db.query(
      "SELECT id FROM teachers WHERE user_id = ?",
      [userId]
    );

    await req.app.locals.db.query(`
      INSERT INTO assignments
      (title, description, subject_id, class_id, teacher_id, due_date, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      title,
      description,
      subject_id,
      class_id,
      teacher.id,
      due_date,
      req.file.filename
    ]);

    res.redirect("/teacher");
  }
);


app.get("/student/assignments", requireAuth("student"), async (req, res) => {
  const userId = req.session.user.id;

  const [[student]] = await req.app.locals.db.query(
    "SELECT id, class_id FROM students WHERE user_id = ?",
    [userId]
  );

  const [assignments] = await req.app.locals.db.query(`
    SELECT a.title, a.due_date, a.file_path, s.name AS subject
    FROM assignments a
    JOIN subjects s ON s.id = a.subject_id
    WHERE a.class_id = ?
    ORDER BY a.due_date
  `, [student.class_id]);

  res.render("student/assignments", { assignments });
});

app.get("/teacher/gradebook/:classId/:assignmentId", async (req, res) => {
    const { classId, assignmentId } = req.params;

    const [rows] = await req.app.locals.db.query(`
        SELECT 
            s.id AS student_id,
            CONCAT(u.first_name, ' ', u.last_name) AS student_name,
            g.score,
            g.grade
        FROM students s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN grades g 
            ON g.student_id = s.id AND g.assignment_id = ?
        WHERE s.class_id = ?
        ORDER BY student_name
    `, [assignmentId, classId]);

    res.json(rows);
});

app.post("/teacher/gradebook/save", async (req, res) => {
    const { assignment_id, grades } = req.body;

    try {
        for (const g of grades) {
            const [exists] = await req.app.locals.db.query(
                "SELECT id FROM grades WHERE student_id = ? AND assignment_id = ?",
                [g.student_id, assignment_id]
            );

            if (exists.length) {
                await req.app.locals.db.query(
                    "UPDATE grades SET score = ?, grade = ? WHERE id = ?",
                    [g.score, g.grade, exists[0].id]
                );
            } else {
                await req.app.locals.db.query(
                    "INSERT INTO grades (student_id, assignment_id, score, grade) VALUES (?,?,?,?)",
                    [g.student_id, assignment_id, g.score, g.grade]
                );
            }
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Grade save error:", err);
        res.status(500).json({ success: false });
    }
});

app.get("/teacher/attendance", requireAuth("teacher"), async (req, res) => {
    const userId = req.session.user.id;

    const [classes] = await req.app.locals.db.query(`
        SELECT DISTINCT c.id, c.name, c.form_level
        FROM classes c
        JOIN teaching_assignments ta ON ta.class_id = c.id
        JOIN teachers t ON t.id = ta.teacher_id
        WHERE t.user_id = ?
        ORDER BY
          CASE
          WHEN UPPER(TRIM(c.form_level)) LIKE 'ECD A%' OR UPPER(TRIM(c.name)) LIKE 'ECD A%' THEN 1
          WHEN UPPER(TRIM(c.form_level)) LIKE 'ECD B%' OR UPPER(TRIM(c.name)) LIKE 'ECD B%' THEN 2
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 1%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*1' THEN 3
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 2%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*2' THEN 4
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 3%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*3' THEN 5
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 4%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*4' THEN 6
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 5%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*5' THEN 7
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 6%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*6' THEN 8
          WHEN UPPER(TRIM(c.form_level)) LIKE 'GRADE 7%' OR UPPER(TRIM(c.name)) REGEXP 'GRADE[[:space:]]*7' THEN 9
          ELSE 999
        END,
          c.name ASC
    `, [userId]);

    res.render("teacher-attendance", {
        user: req.session.user,
        classes
    });
});

app.get("/teacher/attendance/:classId", requireAuth("teacher"), async (req, res) => {
  const { classId } = req.params;
  const userId = req.session.user.id;

  const [[validClass]] = await req.app.locals.db.query(`
      SELECT c.id
      FROM classes c
      JOIN teaching_assignments ta ON ta.class_id = c.id
      JOIN teachers t ON t.id = ta.teacher_id
      WHERE c.id = ? AND t.user_id = ?
  `, [classId, userId]);

  if (!validClass) return res.status(403).json({ error: "Unauthorized" });

  const [students] = await req.app.locals.db.query(`
      SELECT 
        s.id AS id,
        u.first_name AS first_name,
        u.last_name AS last_name
      FROM students s
      JOIN users u ON u.id = s.user_id
      WHERE s.class_id = ? AND s.status = 'active'
      ORDER BY u.last_name ASC, u.first_name ASC
  `, [classId]);

  res.json(students);
});

app.get("/teacher/attendance/:classId/today", requireAuth("teacher"), async (req, res) => {
    const { classId } = req.params;
    const userId = req.session.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const [[validClass]] = await req.app.locals.db.query(`
        SELECT c.id
        FROM classes c
        JOIN teaching_assignments ta ON ta.class_id = c.id
        JOIN teachers t ON t.id = ta.teacher_id
        WHERE c.id = ? AND t.user_id = ?
    `, [classId, userId]);

    if (!validClass) return res.status(403).json({});

    const [rows] = await req.app.locals.db.query(`
        SELECT student_id, status
        FROM attendance
        WHERE class_id = ? AND date = ?
    `, [classId, today]);

    const attendanceMap = {};
    rows.forEach(r => { attendanceMap[r.student_id] = r.status; });

    res.json(attendanceMap);
});

// ================= SAVE ATTENDANCE =================
app.post("/teacher/attendance", requireAuth("teacher"), async (req, res) => {
  try {
    const { class_id } = req.body;
    const userId = req.session.user.id;
    const today = new Date().toISOString().slice(0, 10);

    // ✅ Handle both attendance formats:
    let attendance = req.body.attendance;

    // If attendance is missing, rebuild it from attendance[ID] keys
    if (!attendance || typeof attendance !== "object") {
      attendance = {};
      for (const [key, value] of Object.entries(req.body)) {
        const m = key.match(/^attendance\[(\d+)\]$/);
        if (m) attendance[m[1]] = value;
      }
    }

    if (!class_id || !Object.keys(attendance).length) {
      return res.status(400).send("No attendance submitted");
    }

    // Verify teacher is assigned to class
    const [[validClass]] = await req.app.locals.db.query(`
      SELECT c.id
      FROM classes c
      JOIN teaching_assignments ta ON ta.class_id = c.id
      JOIN teachers t ON t.id = ta.teacher_id
      WHERE c.id = ? AND t.user_id = ?
    `, [class_id, userId]);

    if (!validClass) return res.status(403).send("Unauthorized");

    for (const [studentIdStr, status] of Object.entries(attendance)) {
      const sid = Number(studentIdStr);
      if (!Number.isInteger(sid) || sid <= 0) continue;
      if (!["PRESENT", "ABSENT"].includes(status)) continue;

      // Ensure student belongs to class
      const [[student]] = await req.app.locals.db.query(
        "SELECT id FROM students WHERE id = ? AND class_id = ?",
        [sid, class_id]
      );
      if (!student) continue;

      await req.app.locals.db.query(
        `
        INSERT INTO attendance (class_id, student_id, date, status, marked_by)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          marked_by = VALUES(marked_by)
        `,
        [class_id, sid, today, status, userId]
      );
    }

    return res.redirect("/teacher#attendance");
  } catch (err) {
    console.error("❌ Error saving attendance:", err);
    res.status(500).send("Server error saving attendance");
  }
});




app.get("/teacher/resources", async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.redirect("/login");
        }

        const teacherId = req.session.user.id;

        const sql = `
            SELECT r.*, s.name AS subject_name, c.form_level
            FROM resources r
            JOIN subjects s ON r.subject_id = s.id
            JOIN classes c ON r.class_id = c.id
            WHERE r.uploaded_by = ?
            ORDER BY r.created_at DESC
        `;

        const [resources] = await req.app.locals.db.query(sql, [teacherId]);

        res.render("teacher_resources", {
            user: req.session.user,
            resources
        });

    } catch (err) {
        console.error("Teacher resources error:", err);
        res.sendStatus(500);
    }
});

app.post(
    "/teacher/resources/upload",
    upload.single("file"),

    (req, res) => {

        if (!req.session.user || req.session.user.role !== "teacher") {
            return res.redirect("/login");
        }
        const db = req.app.locals.db; // <-- must do this
        const {
            title,
            description,
            subject_id,
            class_id,
            type,
            target_form
        } = req.body;

        const sql = `
            INSERT INTO resources
            (title, description, subject_id, class_id, type, target_form, file_path, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
            sql,
            [
                title,
                description,
                subject_id,
                class_id,
                type,
                target_form,
                req.file.filename,
                req.session.user.id
            ],
            (err) => {
                if (err) {
                    console.error(err);
                    return res.sendStatus(500);
                }

                res.redirect("/teacher/resources");
            }
        );
    }
);

app.post("/teacher/resources/:id/delete", (req, res) => {
    if (!req.session.user || req.session.user.role !== "teacher") {
        return res.redirect("/login");
    }

    const resourceId = req.params.id;
    const teacherId = req.session.user.id;

    db.query(
        "DELETE FROM resources WHERE id = ? AND uploaded_by = ?",
        [resourceId, teacherId],
        (err) => {
            if (err) {
                console.error(err);
                return res.sendStatus(500);
            }

            res.redirect("/teacher/resources");
        }
    );
});

app.post("/teacher/grades/save", async (req, res) => {
    if (!req.session.user || req.session.user.role !== "teacher") {
        return res.redirect("/login");
    }

    const { student_id, assignment_id, score, grade } = req.body;

    try {
        // Check if grade already exists
        const [existing] = await req.app.locals.db.query(
            `
            SELECT id FROM grades
            WHERE student_id = ? AND assignment_id = ?
            `,
            [student_id, assignment_id]
        );

        if (existing.length > 0) {
            // UPDATE
            await req.app.locals.db.query(
                `
                UPDATE grades
                SET score = ?, grade = ?
                WHERE student_id = ? AND assignment_id = ?
                `,
                [score, grade, student_id, assignment_id]
            );
        } else {
            // INSERT
            await req.app.locals.db.query(
                `
                INSERT INTO grades
                (student_id, assignment_id, score, grade)
                VALUES (?, ?, ?, ?)
                `,
                [student_id, assignment_id, score, grade]
            );
        }

        res.redirect("/teacher#grades");

    } catch (err) {
        console.error("Save grade error:", err);
        res.sendStatus(500);
    }
});

app.get("/teacher/results", requireAuth("teacher"), async (req, res) => {
    const teacherUserId = req.session.user.id;
    const {
        date_from,
        date_to,
        class_id,
        subject_id,
        form_level
    } = req.query;

    let filters = [];
    let params = [teacherUserId];

    if (date_from && date_to) {
        filters.push("DATE(g.created_at) BETWEEN ? AND ?");
        params.push(date_from, date_to);
    } else if (date_from) {
        filters.push("DATE(g.created_at) >= ?");
        params.push(date_from);
    } else if (date_to) {
        filters.push("DATE(g.created_at) <= ?");
        params.push(date_to);
    }

    if (class_id) {
        filters.push("c.id = ?");
        params.push(class_id);
    }

    if (subject_id) {
        filters.push("sub.id = ?");
        params.push(subject_id);
    }

    if (form_level) {
        filters.push("c.form_level = ?");
        params.push(form_level);
    }

    const whereClause = filters.length
        ? "AND " + filters.join(" AND ")
        : "";

    const [rows] = await req.app.locals.db.query(`
        SELECT
            CONCAT(u.first_name, ' ', u.last_name) AS student_name,
            a.title AS assignment_title,
            sub.name AS subject_name,
            c.name AS class_name,
            g.score,
            g.grade,
            DATE(g.created_at) AS date
        FROM grades g
        JOIN students s ON s.id = g.student_id
        JOIN users u ON u.id = s.user_id
        JOIN assignments a ON a.id = g.assignment_id
        JOIN subjects sub ON sub.id = a.subject_id
        JOIN classes c ON c.id = a.class_id
        JOIN teachers t ON t.id = c.teacher_id
        WHERE t.user_id = ?
        ${whereClause}
        ORDER BY g.created_at DESC
    `, params);

    res.json(rows);
});

app.get("/teacher/notices", requireAuth("teacher"), async (req, res) => {
    try {
        const [notices] = await req.app.locals.db.query(`
            SELECT id, title, message, category, created_at
            FROM notices
            WHERE status = 'PUBLISHED'
              AND publish_at <= NOW()
              AND visibility IN ('ALL', 'TEACHERS')
            ORDER BY publish_at DESC
        `);

        res.json(notices);
    } catch (err) {
        console.error("Teacher notices error:", err);
        res.status(500).json({ error: "Failed to load notices" });
    }
});

// =====================================================
// TEACHER → CLASS STUDENTS WITH FEES / DEBTORS / BEAM
// =====================================================
app.get("/teacher/classes/:classId/students", requireAuth("teacher"), async (req, res) => {
  const db = req.app.locals.db;
  const classId = req.params.classId;

  try {

    console.log("=================================");
    console.log("TEACHER CLASS PAGE OPENED");
    console.log("User:", req.session.user);
    console.log("Class ID:", classId);
    console.log("=================================");

    const [classRows] = await db.query(
      `
      SELECT
        id,
        name,
        form_level
      FROM classes
      WHERE id = ?
      `,
      [classId]
    );

    if (!classRows.length) {
      return res.status(404).send("Class not found");
    }

    // OPTIONAL: Verify teacher assignment
    if (req.session.user?.id) {

      const [[teacher]] = await db.query(
        `
        SELECT id
        FROM teachers
        WHERE user_id = ?
        `,
        [req.session.user.id]
      );

      if (teacher) {

        const [[assigned]] = await db.query(
          `
          SELECT 1
          FROM teaching_assignments
          WHERE teacher_id = ?
          AND class_id = ?
          LIMIT 1
          `,
          [teacher.id, classId]
        );

        if (!assigned) {
          return res.status(403).send("You are not assigned to this class.");
        }
      }
    }

    const [students] = await db.query(
      `
      SELECT
          s.id,
          s.form_level,
          s.status,

          u.first_name,
          u.last_name,
          u.unique_id,

          c.name AS class_name,

          COALESCE(fs.term_fee,0) AS total_invoiced,

          COALESCE(pay.total_paid,0) AS total_paid,

          sp.sponsor_type,
          COALESCE(sp.approved_amount,0) AS approved_amount,
          COALESCE(sp.paid_amount,0) AS sponsor_paid_amount,
          COALESCE(sp.balance,0) AS sponsor_balance,
          sp.status AS sponsor_status,

          GREATEST(
              COALESCE(fs.term_fee,0)
              - COALESCE(pay.total_paid,0)
              - COALESCE(sp.paid_amount,0),
              0
          ) AS balance

      FROM students s

      INNER JOIN users u
          ON u.id = s.user_id

      LEFT JOIN classes c
          ON c.id = s.class_id

      LEFT JOIN fee_structure fs
          ON TRIM(UPPER(fs.form_level))
           = TRIM(UPPER(s.form_level))

      LEFT JOIN (
          SELECT
              student_id,
              SUM(paid) AS total_paid
          FROM fees
          GROUP BY student_id
      ) pay
          ON pay.student_id = s.id

      LEFT JOIN (
          SELECT sp1.*
          FROM sponsorships sp1
          INNER JOIN (
              SELECT
                  student_id,
                  MAX(id) AS latest_id
              FROM sponsorships
              GROUP BY student_id
          ) latest
          ON latest.latest_id = sp1.id
      ) sp
          ON sp.student_id = s.id

      WHERE s.class_id = ?

      ORDER BY
          u.last_name,
          u.first_name
      `,
      [classId]
    );

    console.log("Students found:", students.length);

    if (students.length > 0) {
      console.log("First student:");
      console.log(students[0]);
    }

    res.render("teacher_class_students", {
      user: req.session.user,
      classInfo: classRows[0],
      students
    });

  } catch (error) {

    console.error("=================================");
    console.error("Teacher class students error:");
    console.error(error);
    console.error("=================================");

    return res.status(500).send(error.message);
  }
});
app.get(
    "/teacher/classes/:classId/subjects",
    requireAuth("teacher"),
    async (req, res) => {
        const { classId } = req.params;
        const userId = req.session.user.id;

        // 🔐 Verify class belongs to teacher
        const [[cls]] = await req.app.locals.db.query(`
            SELECT c.id
            FROM classes c
            JOIN teaching_assignments ta ON ta.class_id = c.id
            JOIN teachers t ON t.id = ta.teacher_id
            WHERE c.id = ? AND t.user_id = ?
        `, [classId, userId]);

        if (!cls) {
            return res.status(403).json([]);
        }

        // Fetch subjects for this class
        const [subjects] = await req.app.locals.db.query(`
            SELECT s.id, s.name
            FROM subjects s
            JOIN class_subjects cs ON cs.subject_id = s.id
            WHERE cs.class_id = ?
            ORDER BY s.name
        `, [classId]);

        res.json(subjects);
    }
);


// Teacher sees their timetable
app.get("/teacher/timetable", ensureTeacher, async (req, res) => {
    const user_id = req.session.user.id;

    // Get teacher.id from teachers table
    const [[teacher]] = await req.app.locals.db.query(
        "SELECT id FROM teachers WHERE user_id = ?",
        [user_id]
    );

    if (!teacher) return res.status(403).send("Teacher profile not found");
    const teacher_id = teacher.id;

    // Fetch timetable
    const [timetableRows] = await req.app.locals.db.query(`
        SELECT t.id, t.day, t.start_time, t.end_time, c.name AS class_name, s.name AS subject, t.room
        FROM timetable t
        JOIN classes c ON t.class_id = c.id
        JOIN subjects s ON t.subject_id = s.id
        WHERE t.teacher_id = ?
        ORDER BY FIELD(t.day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'), t.start_time
    `, [teacher_id]);

    // Fetch classes assigned to teacher
    const [classRows] = await req.app.locals.db.query(`
        SELECT c.id, c.name, c.form_level, c.room
        FROM classes c
        JOIN teacher_classes tc ON tc.class_id = c.id
        WHERE tc.teacher_id = ?
    `, [teacher_id]);

    // Fetch subjects taught by teacher
    const [subjectRows] = await req.app.locals.db.query(`
        SELECT s.id, s.name
        FROM subjects s
        JOIN teacher_subjects ts ON ts.subject_id = s.id
        WHERE ts.teacher_id = ?
    `, [teacher_id]);

    // Render template with all required data
    res.render("teacher", {
        user: req.session.user,    // ✅ Pass user
        timetable: timetableRows,
        classes: classRows,
        subjects: subjectRows
    });
});

app.get("/student/timetable/:class_id", ensureStudent, async (req, res) => {
    const class_id = req.params.class_id;

    const [rows] = await req.app.locals.db.query(`
        SELECT t.id, t.day, t.start_time, t.end_time, t.room, s.name AS subject, te.first_name, te.last_name
        FROM timetable t
        JOIN subjects s ON t.subject_id = s.id
        JOIN teachers te ON t.teacher_id = te.id
        WHERE t.class_id = ?
        ORDER BY FIELD(t.day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'), t.start_time
    `, [class_id]);

    res.render("student/timetable", { timetable: rows });
});


// View timetable
app.get("/teacher/timetable",  async (req, res) => {
  const userId = req.session.user.id;

  const [[teacher]] = await req.app.locals.db.query(
    "SELECT id FROM teachers WHERE user_id = ?",
    [userId]
  );

  if (!teacher) return res.status(403).send("Teacher profile not found");

  const [timetable] = await req.app.locals.db.query(`
    SELECT t.id, t.day, t.start_time, t.end_time,
           c.name AS class_name, s.name AS subject, t.room
    FROM timetable t
    JOIN classes c ON t.class_id = c.id
    JOIN subjects s ON t.subject_id = s.id
    WHERE t.teacher_id = ?
    ORDER BY FIELD(t.day,'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'),
             t.start_time
  `, [teacher.id]);

  res.render("teacher", {
    user: req.session.user,
    timetable
  });
});

app.post("/teacher/timetable/add", ensureTeacher, async (req, res) => {
    const user_id = req.session.user.id; 
    const { class_id, subject_id, day, start_time, end_time, room } = req.body;

    try {
        // Get teacher.id
        const [[teacher]] = await req.app.locals.db.query(
            "SELECT id FROM teachers WHERE user_id = ?",
            [user_id]
        );
        if (!teacher) return res.status(403).send("Teacher profile not found");

        const teacher_id = teacher.id;

        await req.app.locals.db.query(`
            INSERT INTO timetable (teacher_id, class_id, subject_id, day, start_time, end_time, room)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [teacher_id, class_id, subject_id, day, start_time, end_time, room]);

        // Refresh page
        res.redirect("back"); // <- simple page refresh
    } catch (err) {
        console.error(err);
        res.status(500).send("Error adding timetable entry");
    }
});

app.post("/teacher/timetable/edit/:id", async (req, res) => {
    const teacher_id = req.session.user.id;
    const timetable_id = req.params.id;
    const { day, start_time, end_time, room } = req.body;

    // Ensure this entry belongs to the teacher
    const [[entry]] = await req.app.locals.db.query("SELECT * FROM timetable WHERE id=? AND teacher_id=?", [timetable_id, teacher_id]);
    if (!entry) return res.status(403).send("Cannot edit others' timetable");

    await req.app.locals.db.query(`
        UPDATE timetable
        SET day=?, start_time=?, end_time=?, room=?
        WHERE id=? AND teacher_id=?
    `, [day, start_time, end_time, room, timetable_id, teacher_id]);

    res.redirect("/teacher/timetable");
});

app.post("/teacher/timetable/delete/:id", async (req, res) => {
    const timetableId = req.params.id;

    try {
        await req.app.locals.db.query("DELETE FROM timetable WHERE id = ?", [timetableId]);

        // Simply refresh the page
        res.redirect("back"); // <- refreshes the current page
    } catch (err) {
        console.error(err);
        res.status(500).send("Error deleting timetable entry");
    }
});



app.post("/reset-password", async (req, res) => {
    const { role, fullName, uniqueId, newPassword } = req.body;

    const [firstName, lastName] = fullName.trim().split(" ");

    if (!firstName || !lastName) {
        return res.json({ message: "Enter full name (First Last)" });
    }

    try {
        // 1️⃣ Find user
        const [[user]] = await req.app.locals.db.query(`
            SELECT id FROM users
            WHERE first_name = ?
              AND last_name = ?
              AND unique_id = ?
              AND role = ?
        `, [firstName, lastName, uniqueId, role]);

        if (!user) {
            return res.json({ message: "Details not found" });
        }

        // 2️⃣ Update password
        const hashed = await bcrypt.hash(newPassword, 10);

        await req.app.locals.db.query(`
            UPDATE users SET password = ?
            WHERE id = ?
        `, [hashed, user.id]);

        res.json({ message: "✅ Password reset successful" });

    } catch (err) {
        console.error(err);
        res.json({ message: "Error resetting password" });
    }
});



// ====================== FINANCE HELPERS ======================

/**
 * Load all finance datasets used on the Admin page.
 * NOTE: Always pass the pool (req.app.locals.db).
 */
async function loadFinanceData(db) {
  // Total income (invoice payments)
  const [[income]] = await db.query(`
    SELECT IFNULL(SUM(amount),0) AS total
    FROM invoice_payments
  `);

  // Total expenses
  const [[expense]] = await db.query(`
    SELECT IFNULL(SUM(amount),0) AS total
    FROM expenses
  `);

  // Invoices (with student names)
  const [invoices] = await db.query(`
    SELECT 
      i.*,
      u.first_name,
      u.last_name,
      u.unique_id AS student_reg
    FROM invoices i
    JOIN students s ON s.id = i.student_id
    JOIN users u ON u.id = s.user_id
    ORDER BY i.created_at DESC
  `);

  // Payments (invoice_payments)
  const [payments] = await db.query(`
    SELECT 
      ip.*,
      i.student_id,
      u.first_name,
      u.last_name,
      u.unique_id AS student_reg
    FROM invoice_payments ip
    JOIN invoices i ON i.id = ip.invoice_id
    JOIN students s ON s.id = i.student_id
    JOIN users u ON u.id = s.user_id
    ORDER BY ip.paid_at DESC
  `);

  // Expenses list (try to include category name if schema uses category_id)
  let expenses = [];
  try {
    const [rows] = await db.query(`
      SELECT 
        e.id,
        COALESCE(ec.name, e.category) AS category,
        e.description,
        e.amount,
        e.expense_date
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      ORDER BY e.expense_date DESC
    `);
    expenses = rows;
  } catch (err) {
    // Fallback if category_id doesn't exist
    const [rows] = await db.query(`
      SELECT id, category, description, amount, expense_date
      FROM expenses
      ORDER BY expense_date DESC
    `);
    expenses = rows;
  }

  // Purchases (optional)
  let purchases = [];
  try {
    const [rows] = await db.query(`
      SELECT 
        p.id,
        p.purchase_date,
        COALESCE(pc.name, p.category) AS category,
        COALESCE(sup.name, '') AS supplier,
        p.description,
        p.amount
      FROM purchases p
      LEFT JOIN purchase_categories pc ON pc.id = p.category_id
      LEFT JOIN suppliers sup ON sup.id = p.supplier_id
      ORDER BY p.purchase_date DESC
    `);
    purchases = rows;
  } catch (err) {
    // minimal fallback
    try {
      const [rows] = await db.query(`SELECT * FROM purchases ORDER BY purchase_date DESC`);
      purchases = rows;
    } catch (_) {
      purchases = [];
    }
  }

  return {
    total_income: income?.total || 0,
    total_expenses: expense?.total || 0,
    invoices,
    payments,
    expenses,
    purchases
  };
}

/**
 * Utility: small CSV escape helper
 */
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function sendCsv(res, filename, rows, fallbackHeaderLine) {
  res.header("Content-Type", "text/csv");
  res.attachment(filename);

  if (!rows || !rows.length) return res.send(fallbackHeaderLine + "\n");

  const headers = Object.keys(rows[0]);
  let out = headers.join(",") + "\n";
  for (const r of rows) {
    out += headers.map((h) => csvEscape(r[h])).join(",") + "\n";
  }
  return res.send(out);
}

// ====================== FINANCE ROUTES ======================
app.post("/admin/finance/invoices", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;

  try {
    const {
      scope,            // single | level | class | school
      student_id,
      form_level,
      class_id,
      term,
      year,
      pay_start,
      pay_end
    } = req.body;

    if (!scope || !term || !year) {
      return res.status(400).send("Missing scope/term/year");
    }

    // ✅ date range optional but recommended for accurate Paid
    const start = pay_start || null;
    const end = pay_end || null;

    // 1) pick students by scope
    let students = [];

    if (scope === "single") {
      if (!student_id) return res.status(400).send("Select a student");
      const [rows] = await db.query(
        `SELECT id, form_level FROM students WHERE id=? LIMIT 1`,
        [student_id]
      );
      students = rows;
    }

    if (scope === "level") {
      if (!form_level) return res.status(400).send("Select a level");
      const [rows] = await db.query(
        `SELECT id, form_level FROM students WHERE form_level=? AND status='active'`,
        [form_level]
      );
      students = rows;
    }

    if (scope === "class") {
      if (!class_id) return res.status(400).send("Select a class");
      const [rows] = await db.query(
        `SELECT id, form_level FROM students WHERE class_id=? AND status='active'`,
        [class_id]
      );
      students = rows;
    }

    if (scope === "school") {
      const [rows] = await db.query(
        `SELECT id, form_level FROM students WHERE status='active'`
      );
      students = rows;
    }

    if (!students.length) {
      return res.status(400).send("No students found for that scope");
    }

    // 2) build a fee_structure map (form_level -> term_fee)
    const [fees] = await db.query(`SELECT form_level, term_fee FROM fee_structure`);
    const feeMap = new Map(fees.map(f => [String(f.form_level), Number(f.term_fee || 0)]));

    // 3) insert invoices (skip duplicates)
    for (const st of students) {
      const amount = feeMap.get(String(st.form_level)) ?? 0;

      // Skip if already exists (same student, term, year, range)
      const [[exists]] = await db.query(
        `
        SELECT id FROM invoices
        WHERE student_id=? AND term=? AND year=?
          AND ((pay_start IS NULL AND ? IS NULL) OR pay_start=?)
          AND ((pay_end   IS NULL AND ? IS NULL) OR pay_end=?)
        LIMIT 1
        `,
        [st.id, term, year, start, start, end, end]
      );
      if (exists) continue;

      await db.query(
        `
        INSERT INTO invoices (student_id, term, year, total_amount, pay_start, pay_end, created_at)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
        `,
        [st.id, term, year, amount, start, end]
      );
    }

    return res.redirect("/admin#finance");
  } catch (e) {
    console.error("Create invoice error:", e);
    return res.status(500).send("Server error");
  }
});
// Pay invoice (records invoice_payments + updates invoice status + writes ledger)
app.post("/admin/finance/payments", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const invoice_id = req.body.invoice_id;
  const amount = Number(req.body.amount || 0);
  const payment_method = req.body.payment_method || req.body.method || "Cash";
  const reference = req.body.reference || null;
  const paid_at = req.body.paid_at || req.body.date || new Date().toISOString().slice(0, 10);
  const userId = req.session.user.id;

  let conn;
  try {
    if (!invoice_id || amount <= 0) return res.status(400).send("Invalid payment details");

    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[invoice]] = await conn.query(
      `SELECT i.*, s.id AS student_id
       FROM invoices i
       JOIN students s ON s.id = i.student_id
       WHERE i.id = ?
       LIMIT 1`,
      [invoice_id]
    );

    if (!invoice) {
      await conn.rollback();
      return res.status(404).send("Invoice not found");
    }

    const [paymentResult] = await conn.query(
      `INSERT INTO invoice_payments
       (invoice_id, amount, payment_method, reference, paid_at, received_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [invoice_id, amount, payment_method, reference, paid_at, userId]
    );

    const paymentId = paymentResult.insertId;

    const [[receiptCount]] = await conn.query(`SELECT COUNT(*) AS total FROM receipts`);
    const receiptNumber = `RCP${String((receiptCount?.total || 0) + 1).padStart(6, "0")}`;

    await conn.query(
      `INSERT INTO receipts
       (receipt_number, student_id, invoice_id, payment_id, amount, payment_method, reference, received_by, receipt_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [receiptNumber, invoice.student_id, invoice_id, paymentId, amount, payment_method, reference, userId]
    );

    const [[paidTotals]] = await conn.query(
      `SELECT IFNULL(SUM(amount),0) AS paid FROM invoice_payments WHERE invoice_id = ?`,
      [invoice_id]
    );

    const paid = Number(paidTotals?.paid || 0);
    const total = Number(invoice.total_amount || 0);
    const status = paid >= total ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";

    await conn.query(`UPDATE invoices SET status=? WHERE id=?`, [status, invoice_id]);

    const [[lastLedger]] = await conn.query(
      `SELECT balance FROM student_ledger WHERE student_id=? ORDER BY id DESC LIMIT 1`,
      [invoice.student_id]
    );
    const newBalance = Number(lastLedger?.balance || total) - amount;

    await conn.query(
      `INSERT INTO student_ledger
       (student_id, transaction_date, description, debit, credit, balance, reference_type, reference_id)
       VALUES (?, ?, ?, 0, ?, ?, 'RECEIPT', ?)`,
      [invoice.student_id, paid_at, `Payment received - ${receiptNumber}`, amount, newBalance, paymentId]
    );

    await conn.query(
      `INSERT INTO cashbook
       (transaction_date, description, inflow, outflow, running_balance, reference_type, reference_id, created_by)
       VALUES (?, ?, ?, 0, 0, 'RECEIPT', ?, ?)`,
      [paid_at, `Fees payment ${receiptNumber}`, amount, paymentId, userId]
    );

    await conn.query(
      `INSERT INTO ledger (transaction_date, type, category, description, amount)
       VALUES (?, 'INCOME', 'Fees', ?, ?)`,
      [paid_at, `Student fee payment ${receiptNumber}`, amount]
    ).catch(() => {});

    await conn.query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, ip_address)
       VALUES (?, 'CREATE_PAYMENT', 'invoice_payments', ?, ?, ?)`,
      [userId, paymentId, JSON.stringify({ invoice_id, amount, receiptNumber }), req.ip]
    ).catch(() => {});

    await conn.commit();
    return res.redirect("/admin#finance");
  } catch (err) {
    try { if (conn) await conn.rollback(); } catch (_) {}
    console.error("Finance payment error:", err);
    return res.status(500).send("Failed to record payment");
  } finally {
    if (conn) conn.release();
  }
});

// Add expense (supports category_id OR category string)
app.post("/admin/finance/expenses", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  let { category_id, new_category, category, description, amount, expense_date } = req.body;

  // If UI sends category_id=NEW, create a category row
  if (category_id === "NEW") {
    const [ins] = await db.query(`INSERT INTO expense_categories (name) VALUES (?)`, [new_category]);
    category_id = ins.insertId;
  }

  // Try insert with category_id schema first
  try {
    await db.query(
      `INSERT INTO expenses (category_id, description, amount, expense_date)
       VALUES (?, ?, ?, ?)`,
      [category_id || null, description, amount, expense_date]
    );
  } catch (err) {
    // Fallback: category text column
    const categoryName = category || new_category || "Expense";
    await db.query(
      `INSERT INTO expenses (category, description, amount, expense_date)
       VALUES (?, ?, ?, ?)`,
      [categoryName, description, amount, expense_date]
    );
  }

  // Ledger entry (best-effort)
  try {
    await db.query(
      `INSERT INTO ledger (transaction_date, type, category, description, amount)
       VALUES (?, 'EXPENSE', 'Expense', ?, ?)`,
      [expense_date, description, amount]
    );
  } catch (_) {}

  res.redirect("/admin#finance");
});

// Add supplier
app.post("/admin/finance/suppliers", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const { name, phone, email } = req.body;

  await db.query(`INSERT INTO suppliers (name, phone, email) VALUES (?, ?, ?)`, [name, phone || null, email || null]);
  res.redirect("/admin#finance");
});

// Add purchase (supports category_id OR category string)
app.post("/admin/finance/purchases", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  let { supplier_id, category_id, new_category, category, description, amount, purchase_date } = req.body;

  if (category_id === "NEW") {
    const [ins] = await db.query(`INSERT INTO purchase_categories (name) VALUES (?)`, [new_category]);
    category_id = ins.insertId;
  }

  try {
    await db.query(
      `INSERT INTO purchases (supplier_id, category_id, description, amount, purchase_date)
       VALUES (?, ?, ?, ?, ?)`,
      [supplier_id || null, category_id || null, description, amount, purchase_date]
    );
  } catch (err) {
    // Fallback if purchases table uses category text column
    const categoryName = category || new_category || "Purchase";
    await db.query(
      `INSERT INTO purchases (supplier_id, category, description, amount, purchase_date)
       VALUES (?, ?, ?, ?, ?)`,
      [supplier_id || null, categoryName, description, amount, purchase_date]
    );
  }

  // Ledger entry (best-effort)
  try {
    await db.query(
      `INSERT INTO ledger (transaction_date, type, category, description, amount)
       VALUES (?, 'EXPENSE', 'Purchase', ?, ?)`,
      [purchase_date, description, amount]
    );
  } catch (_) {}

  res.redirect("/admin#finance");
});

// Add asset
app.post("/admin/finance/assets", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const { name, category, purchase_date, purchase_value } = req.body;

  await db.query(
    `INSERT INTO assets (name, category, purchase_date, purchase_value, current_value)
     VALUES (?, ?, ?, ?, ?)`,
    [name, category || null, purchase_date || null, purchase_value, purchase_value]
  );

  res.redirect("/admin#finance");
});

// Pay bill
app.post("/admin/finance/pay-bill", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const { bill_id } = req.body;

  await db.query(`UPDATE bills SET status='PAID' WHERE id=?`, [bill_id]);

  // Optional: record as an expense if bills has amount column
  try {
    const [[bill]] = await db.query(`SELECT amount FROM bills WHERE id=?`, [bill_id]);
    if (bill?.amount) {
      await db.query(
        `INSERT INTO expenses (category, description, amount, expense_date)
         VALUES ('Supplier Bill', 'Bill Payment', ?, CURDATE())`,
        [bill.amount]
      );
    }
  } catch (_) {}

  res.redirect("/admin#finance");
});

// ===== EXPORTS (CSV) =====

app.get("/admin/finance/export/invoices", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const [rows] = await db.query(`
    SELECT
      i.id AS "Invoice ID",
      u.unique_id AS "Student Reg",
      CONCAT(u.first_name,' ',u.last_name) AS "Student Name",
      i.term AS "Term",
      i.year AS "Year",
      i.total_amount AS "Total Amount",
      i.status AS "Status",
      i.created_at AS "Created At"
    FROM invoices i
    JOIN students s ON s.id = i.student_id
    JOIN users u ON u.id = s.user_id
    ORDER BY i.id DESC
  `);
  return sendCsv(res, "invoices.csv", rows, "Invoice ID,Student Reg,Student Name,Term,Year,Total Amount,Status,Created At");
});

app.get("/admin/finance/export/payments", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const [rows] = await db.query(`
    SELECT
      ip.id AS "Payment ID",
      ip.invoice_id AS "Invoice ID",
      u.unique_id AS "Student Reg",
      CONCAT(u.first_name,' ',u.last_name) AS "Student Name",
      ip.amount AS "Amount",
      ip.payment_method AS "Method",
      ip.reference AS "Reference",
      ip.paid_at AS "Paid At"
    FROM invoice_payments ip
    JOIN invoices i ON i.id = ip.invoice_id
    JOIN students s ON s.id = i.student_id
    JOIN users u ON u.id = s.user_id
    ORDER BY ip.id DESC
  `);
  return sendCsv(res, "payments.csv", rows, "Payment ID,Invoice ID,Student Reg,Student Name,Amount,Method,Reference,Paid At");
});

app.get("/admin/finance/export/expenses", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  let rows = [];
  try {
    const [r] = await db.query(`
      SELECT
        e.id AS "Expense ID",
        COALESCE(ec.name, e.category) AS "Category",
        e.description AS "Description",
        e.amount AS "Amount",
        e.expense_date AS "Date"
      FROM expenses e
      LEFT JOIN expense_categories ec ON ec.id = e.category_id
      ORDER BY e.id DESC
    `);
    rows = r;
  } catch (err) {
    const [r] = await db.query(`
      SELECT
        id AS "Expense ID",
        category AS "Category",
        description AS "Description",
        amount AS "Amount",
        expense_date AS "Date"
      FROM expenses
      ORDER BY id DESC
    `);
    rows = r;
  }
  return sendCsv(res, "expenses.csv", rows, "Expense ID,Category,Description,Amount,Date");
});

app.get("/admin/finance/export/purchases", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  let rows = [];
  try {
    const [r] = await db.query(`
      SELECT
        p.id AS "Purchase ID",
        p.purchase_date AS "Date",
        COALESCE(pc.name, p.category) AS "Category",
        COALESCE(sup.name, '') AS "Supplier",
        p.description AS "Description",
        p.amount AS "Amount"
      FROM purchases p
      LEFT JOIN purchase_categories pc ON pc.id = p.category_id
      LEFT JOIN suppliers sup ON sup.id = p.supplier_id
      ORDER BY p.id DESC
    `);
    rows = r;
  } catch (err) {
    const [r] = await db.query(`SELECT * FROM purchases ORDER BY id DESC`);
    rows = r;
  }
  return sendCsv(res, "purchases.csv", rows, "Purchase ID,Date,Category,Supplier,Description,Amount");
});

app.get("/admin/finance/export/ledger", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const [rows] = await db.query(`SELECT * FROM ledger ORDER BY transaction_date DESC`);
  return sendCsv(res, "ledger.csv", rows, "id,transaction_date,type,category,description,amount");
});

app.get("/admin/finance/export/assets", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const [rows] = await db.query(`SELECT * FROM assets ORDER BY id DESC`);
  return sendCsv(res, "assets.csv", rows, "id,name,category,purchase_date,purchase_value,current_value");
});

app.get("/admin/finance/export/suppliers", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const [rows] = await db.query(`SELECT * FROM suppliers ORDER BY id DESC`);
  return sendCsv(res, "suppliers.csv", rows, "id,name,phone,email");
});



// ====================== PROFESSIONAL FINANCE ROUTES ======================
app.post("/admin/finance/beam-camfed/add", requireAuth("admin"), async (req, res) => {
  const db = req.app.locals.db;
  const { student_id, sponsor_type, approved_amount, paid_amount, notes } = req.body;
  const approved = Number(approved_amount || 0);
  const paid = Number(paid_amount || 0);
  const balance = Math.max(approved - paid, 0);
  let status = req.body.status || "APPROVED";
  if (paid >= approved && approved > 0) status = "PAID";
  else if (paid > 0) status = "PARTIAL";

  await db.query(
    `INSERT INTO sponsorships (student_id, sponsor_type, approved_amount, paid_amount, balance, status, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [student_id, sponsor_type || "BEAM", approved, paid, balance, status, notes || null, req.session.user.id]
  );

  if (paid > 0) {
    await db.query(
      `INSERT INTO fees (student_id, amount, paid, method, reference, date_paid)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [student_id, approved, paid, sponsor_type || "SPONSOR", req.body.reference || "Sponsored payment", req.body.payment_date || req.body.support_date || new Date().toISOString().slice(0,10)]
    );
  }

  res.redirect("/admin#finance");
});

app.post("/admin/finance/beam-camfed/delete/:id", requireAuth("admin"), async (req, res) => {
  await req.app.locals.db.query(`DELETE FROM sponsorships WHERE id=?`, [req.params.id]);
  res.redirect("/admin#finance");
});

app.post("/admin/finance/cashbook", requireAuth("admin"), async (req, res) => {
  const { transaction_date, description, inflow, outflow } = req.body;
  await req.app.locals.db.query(
    `INSERT INTO cashbook (transaction_date, description, inflow, outflow, running_balance, created_by)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [transaction_date, description, Number(inflow || 0), Number(outflow || 0), req.session.user.id]
  );
  res.redirect("/admin#finance");
});

app.post("/admin/finance/budgets", requireAuth("admin"), async (req, res) => {
  const { category, year, allocated_amount } = req.body;
  await req.app.locals.db.query(
    `INSERT INTO budgets (category, year, allocated_amount, spent_amount, remaining_amount)
     VALUES (?, ?, ?, 0, ?)
     ON DUPLICATE KEY UPDATE allocated_amount=VALUES(allocated_amount), remaining_amount=VALUES(remaining_amount)`,
    [category, year, allocated_amount, allocated_amount]
  );
  res.redirect("/admin#finance");
});

app.post("/admin/finance/statements/generate", requireAuth("admin"), async (req, res) => {
  const { student_id, statement_period } = req.body;
  await req.app.locals.db.query(
    `INSERT INTO fee_statements (student_id, statement_period, generated_by, pdf_file)
     VALUES (?, ?, ?, NULL)`,
    [student_id, statement_period || "Current Period", req.session.user.id]
  );
  res.redirect("/admin#finance");
});

app.get("/admin/finance/student-ledger/:studentId", requireAuth("admin"), async (req, res) => {
  const [rows] = await req.app.locals.db.query(
    `SELECT * FROM student_ledger WHERE student_id=? ORDER BY transaction_date ASC, id ASC`,
    [req.params.studentId]
  );
  res.json(rows);
});

app.get("/admin/finance/receipts/:id/print", requireAuth("admin"), async (req, res) => {
  const [[r]] = await req.app.locals.db.query(
    `SELECT r.*, u.unique_id, u.first_name, u.last_name
     FROM receipts r
     JOIN students s ON s.id = r.student_id
     JOIN users u ON u.id = s.user_id
     WHERE r.id=?`,
    [req.params.id]
  );
  if (!r) return res.status(404).send("Receipt not found");
  res.send(`<!DOCTYPE html><html><head><title>${r.receipt_number}</title><style>body{font-family:Arial;padding:30px}.box{max-width:480px;margin:auto;border:1px solid #ddd;padding:24px;border-radius:14px}h2{text-align:center}.row{display:flex;justify-content:space-between;border-bottom:1px dashed #ddd;padding:8px 0}.btn{margin-top:20px}</style></head><body><div class="box"><h2>Chinembiri Primary School</h2><h3>Official Receipt</h3><div class="row"><b>Receipt No:</b><span>${r.receipt_number}</span></div><div class="row"><b>Student:</b><span>${r.first_name} ${r.last_name}</span></div><div class="row"><b>Reg No:</b><span>${r.unique_id}</span></div><div class="row"><b>Amount:</b><span>$${Number(r.amount||0).toFixed(2)}</span></div><div class="row"><b>Method:</b><span>${r.payment_method||'-'}</span></div><div class="row"><b>Reference:</b><span>${r.reference||'-'}</span></div><div class="row"><b>Date:</b><span>${String(r.receipt_date).slice(0,24)}</span></div><button class="btn" onclick="window.print()">Print</button></div></body></html>`);
});

app.get("/admin/finance/export/receipts", requireAuth("admin"), async (req, res) => {
  const [rows] = await req.app.locals.db.query(`SELECT * FROM receipts ORDER BY receipt_date DESC`);
  return sendCsv(res, "receipts.csv", rows, "id,receipt_number,student_id,invoice_id,amount,payment_method,reference,receipt_date");
});

app.get("/admin/finance/export/student-ledger", requireAuth("admin"), async (req, res) => {
  const [rows] = await req.app.locals.db.query(`SELECT * FROM student_ledger ORDER BY transaction_date DESC`);
  return sendCsv(res, "student-ledger.csv", rows, "id,student_id,transaction_date,description,debit,credit,balance");
});

app.get("/admin/finance/export/cashbook", requireAuth("admin"), async (req, res) => {
  const [rows] = await req.app.locals.db.query(`SELECT * FROM cashbook ORDER BY transaction_date DESC`);
  return sendCsv(res, "cashbook.csv", rows, "id,transaction_date,description,inflow,outflow,running_balance");
});

app.get("/admin/finance/export/budgets", requireAuth("admin"), async (req, res) => {
  const [rows] = await req.app.locals.db.query(`SELECT * FROM budgets ORDER BY year DESC, category`);
  return sendCsv(res, "budgets.csv", rows, "id,category,year,allocated_amount,spent_amount,remaining_amount");
});

app.get("/admin/finance/export/audit", requireAuth("admin"), async (req, res) => {
  const [rows] = await req.app.locals.db.query(`SELECT * FROM audit_logs ORDER BY created_at DESC`);
  return sendCsv(res, "audit-trail.csv", rows, "id,user_id,action,table_name,record_id,created_at");
});

app.get("/admin/finance/export/beam-camfed", requireAuth("admin"), async (req, res) => {
  const [rows] = await req.app.locals.db.query(`SELECT * FROM sponsorships ORDER BY created_at DESC`);
  return sendCsv(res, "beam-camfed.csv", rows, "id,student_id,sponsor_type,approved_amount,paid_amount,balance,status,created_at");
});

// POST add employee
app.post("/admin/employees", requireAuth("admin"), async (req, res) => {
    const db = req.app.locals.db; // <-- must do this

    const { first_name, last_name, position, department, phone, email, basic_salary, status } = req.body;

    await db.query(
        "INSERT INTO employees (first_name, last_name, position, department, phone, email, basic_salary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [first_name, last_name, position, department, phone, email, basic_salary, status]
    );

    res.redirect("/admin");
});

// GET edit employee form
app.get('/admin/employees/:id/edit', async (req, res) => {
    const db = req.app.locals.db; // <-- must do this
    const emp = await db.query('SELECT * FROM employees WHERE id = ?', [req.params.id]);
    res.render('admin/edit-employee', { emp: emp[0] });
});

// POST update employee
app.post('/admin/employees/:id/edit', async (req, res) => {
    const db = req.app.locals.db; // <-- must do this
    const { first_name, last_name, position, department, phone, email, basic_salary, status } = req.body;
    await db.query(
        'UPDATE employees SET first_name=?, last_name=?, position=?, department=?, phone=?, email=?, basic_salary=?, status=? WHERE id=?',
        [first_name, last_name, position, department, phone, email, basic_salary, status, req.params.id]
    );
    res.redirect('/admin/employees');
});

// POST delete employee
app.post('/admin/employees/:id/delete', async (req, res) => {
    const db = req.app.locals.db; // <-- must do this
    await db.query('DELETE FROM employees WHERE id=?', [req.params.id]);
    res.redirect('/admin/employees');
});

// Background job to auto-publish notices
setInterval(async () => {
    try {
        await app.locals.db.query(`
            UPDATE notices
            SET status = 'PUBLISHED'
            WHERE status = 'SCHEDULED'
            AND publish_at <= NOW()
        `);
        console.log('Auto-published scheduled notices at', new Date());
    } catch (err) {
        console.error('Error auto-publishing notices:', err);
    }
}, 60_000); // every minute


app.get("/download/:filename", async (req, res) => {
  try {
    const filePath = path.join(UPLOAD_DIR, req.params.filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }

    res.download(filePath);
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).send("Download failed");
  }
});

app.get("/student/classes", requireAuth("student"), async (req, res) => {
  const userId = req.session.user.id;

  // Get student
  const [[student]] = await req.app.locals.db.query(
    "SELECT id, class_id FROM students WHERE user_id = ? AND status='active'",
    [userId]
  );

  if (!student) return res.status(403).send("Student not found");

  // Get class info
  const [[cls]] = await req.app.locals.db.query(
    "SELECT id, name, form_level FROM classes WHERE id = ?",
    [student.class_id]
  );

  // Get resources
  const [resources] = await req.app.locals.db.query(`
    SELECT r.id, r.title, r.type, r.file_path, s.name AS subject
    FROM resources r
    JOIN subjects s ON s.id = r.subject_id
    WHERE r.class_id = ?
    ORDER BY r.created_at DESC
  `, [student.class_id]);

  res.render("student/classes", {
    classInfo: cls,
    resources
  });
});

// ====================== DEBTORS (Outstanding Balances) ======================
async function getDebtorRows(db, filters = {}) {
  const invoiceWhere = [];
  const invoiceParams = [];
  const studentWhere = ["s.status = 'active'"];
  const studentParams = [];

  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    invoiceWhere.push("i.created_at >= ?");
    invoiceParams.push(filters.from);
  }
  if (filters.to && /^\d{4}-\d{2}-\d{2}$/.test(filters.to)) {
    invoiceWhere.push("i.created_at < DATE_ADD(?, INTERVAL 1 DAY)");
    invoiceParams.push(filters.to);
  }
  if (filters.class_id) {
    studentWhere.push("s.class_id = ?");
    studentParams.push(filters.class_id);
  }
  if (filters.form_level) {
    studentWhere.push("s.form_level = ?");
    studentParams.push(filters.form_level);
  }

  const invoiceFilterSql = invoiceWhere.length
    ? `WHERE ${invoiceWhere.join(" AND ")}`
    : "";

  const sql = `
    SELECT
      s.id AS student_id,
      u.unique_id AS student_reg,
      u.first_name,
      u.last_name,
      s.form_level,
      c.name AS class_name,
      debt.invoice_terms,
      debt.total_invoiced,
      debt.total_paid,
      debt.balance,
      COALESCE(sp.sponsor_type, '') AS sponsor_type,
      COALESCE(sp.approved_amount, 0) AS approved_amount,
      COALESCE(sp.sponsor_paid, 0) AS sponsor_paid
    FROM students s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN classes c ON c.id = s.class_id
    JOIN (
      SELECT
        i.student_id,
        GROUP_CONCAT(DISTINCT CONCAT(i.term, ' ', i.year)
                     ORDER BY i.year, i.term SEPARATOR ', ') AS invoice_terms,
        SUM(i.total_amount) AS total_invoiced,
        SUM(COALESCE(pay.total_paid, 0)) AS total_paid,
        GREATEST(SUM(i.total_amount) - SUM(COALESCE(pay.total_paid, 0)), 0) AS balance
      FROM invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) AS total_paid
        FROM invoice_payments
        GROUP BY invoice_id
      ) pay ON pay.invoice_id = i.id
      ${invoiceFilterSql}
      GROUP BY i.student_id
    ) debt ON debt.student_id = s.id
    LEFT JOIN (
      SELECT
        student_id,
        GROUP_CONCAT(DISTINCT sponsor_type ORDER BY sponsor_type SEPARATOR ', ') AS sponsor_type,
        SUM(approved_amount) AS approved_amount,
        SUM(paid_amount) AS sponsor_paid
      FROM sponsorships
      WHERE status IN ('APPROVED', 'PARTIAL', 'PAID')
      GROUP BY student_id
    ) sp ON sp.student_id = s.id
    WHERE ${studentWhere.join(" AND ")}
      AND debt.balance > 0
    ORDER BY debt.balance DESC, u.last_name, u.first_name
  `;

  const [rows] = await db.query(sql, [...invoiceParams, ...studentParams]);
  return rows;
}

app.get("/admin/finance/debtors", requireAuth("admin"), async (req, res) => {
  try {
    const rows = await getDebtorRows(req.app.locals.db, req.query);
    const total_outstanding = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    return res.json({ rows, total_outstanding });
  } catch (err) {
    console.error("Debtors route error:", err);
    return res.status(500).json({ rows: [], total_outstanding: 0 });
  }
});

app.get("/admin/finance/export/debtors.xlsx", requireAuth("admin"), async (req, res) => {
  try {
    const rows = await getDebtorRows(req.app.locals.db, req.query);
    const table = [
      ["Student ID", "Registration No.", "Student Name", "Form / Grade", "Class", "Invoice Terms", "Total Invoiced", "Total Paid", "Outstanding Balance", "Sponsor Type", "Sponsorship Approved", "Sponsorship Paid"],
      ...rows.map(row => [
        Number(row.student_id),
        row.student_reg || "",
        `${row.first_name || ""} ${row.last_name || ""}`.trim(),
        row.form_level || "",
        row.class_name || "",
        row.invoice_terms || "",
        Number(row.total_invoiced || 0),
        Number(row.total_paid || 0),
        Number(row.balance || 0),
        row.sponsor_type || "",
        Number(row.approved_amount || 0),
        Number(row.sponsor_paid || 0)
      ])
    ];
    const totalOutstanding = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    table.push([]);
    table.push(["Total Debtors", rows.length]);
    table.push(["Total Outstanding", "", "", "", "", "", "", "", totalOutstanding]);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(table);
    worksheet["!cols"] = [
      { wch: 12 }, { wch: 18 }, { wch: 28 }, { wch: 16 },
      { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 16 },
      { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 20 }
    ];
    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      for (const column of [6, 7, 8, 10, 11]) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: column });
        if (worksheet[cellAddress]) worksheet[cellAddress].z = '"$"#,##0.00';
      }
    }
    const totalCell = XLSX.utils.encode_cell({ r: rows.length + 3, c: 8 });
    if (worksheet[totalCell]) worksheet[totalCell].z = '"$"#,##0.00';
    XLSX.utils.book_append_sheet(workbook, worksheet, "Debtors");

    const excelFile = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="debtors-list.xlsx"');
    return res.send(excelFile);
  } catch (err) {
    console.error("Debtors Excel export error:", err);
    return res.status(500).send("Could not export the debtors list.");
  }
});

app.post(
  "/admin/students/:id/remove-class",
  requireAuth("admin"),
  async (req, res) => {

    try {

      const db = req.app.locals.db;

      const studentId = req.params.id;

      await db.query(`
        UPDATE students
        SET class_id = NULL
        WHERE id = ?
      `, [studentId]);

      res.json({
        success: true
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        success: false,
        message: "Failed to remove student from class"
      });

    }

  }
);
