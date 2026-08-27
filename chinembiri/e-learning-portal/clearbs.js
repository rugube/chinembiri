// clear_db.js
import mysql from "mysql2/promise";

// Database credentials
const dbConfig = {
    host: "localhost",
    user: "elearn_user",
    password: "StrongPassword123",
    database: "elearning_portal",
    waitForConnections: true
};

// Tables to truncate
const tablesToTruncate = [
  "assignments",
  "attendance",
  "backups",
  "class_subjects",
  "classes",
  "fee_structure",
  "fees",
  "grades",
  "library_books",
  "library_borrowings",
  "notices",
  "resources",
  "school_info",
  "students",
  "subjects",
  "system_logs",
  "teacher_subjects",
  "teachers",
  "teaching_assignments",
  "timetable"
];

async function clearDatabase() {
    // Create pool and get a connection
    const pool = mysql.createPool(dbConfig);
    const connection = await pool.getConnection();

    try {
        console.log("Disabling foreign key checks...");
        await connection.query("SET FOREIGN_KEY_CHECKS = 0;");

        for (const table of tablesToTruncate) {
            console.log(`Truncating table: ${table} ...`);
            await connection.query(`TRUNCATE TABLE \`${table}\`;`);
        }

        console.log("Re-enabling foreign key checks...");
        await connection.query("SET FOREIGN_KEY_CHECKS = 1;");

        console.log("✅ Database cleared (except users table).");
    } catch (err) {
        console.error("❌ Error clearing database:", err);
    } finally {
        connection.release(); // release back to pool
        await pool.end();
    }
}

// Run the script
clearDatabase();
