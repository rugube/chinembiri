CREATE DATABASE IF NOT EXISTS elearning_portal;
USE elearning_portal;

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================
-- CORE LOOKUP TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS terms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50),
    year INT NOT NULL,
    term_number INT NOT NULL,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT 0,
    UNIQUE KEY uniq_term (year, term_number)
);

CREATE TABLE IF NOT EXISTS class_levels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(20) UNIQUE,
    next_level_id INT NULL,
    is_exit_level BOOLEAN DEFAULT 0,
    CONSTRAINT fk_class_levels_next
        FOREIGN KEY (next_level_id) REFERENCES class_levels(id)
);

-- =====================================================
-- USERS
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('student','teacher','admin') NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    unique_id VARCHAR(30),
    email VARCHAR(100),
    status ENUM('active','inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_users_role_unique_id (role, unique_id)
);

-- =====================================================
-- CLASSES
-- =====================================================

CREATE TABLE IF NOT EXISTS classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    level_id INT NULL,
    class_code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    form_level VARCHAR(20) NOT NULL,
    room VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_classes_level
        FOREIGN KEY (level_id) REFERENCES class_levels(id)
);

-- =====================================================
-- STUDENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS students (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    form_level VARCHAR(20),
    email VARCHAR(100),
    phone VARCHAR(20),
    date_of_birth DATE NULL,
    birth_id_number VARCHAR(50) NULL,
    class_id INT NULL,
    status ENUM('active','inactive','graduated') DEFAULT 'active',
    admission_year INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_students_user_id (user_id),
    UNIQUE KEY uniq_students_birth_id_number (birth_id_number),
    CONSTRAINT fk_students_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_students_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

-- =====================================================
-- TEACHERS
-- =====================================================

CREATE TABLE IF NOT EXISTS teachers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    employee_number VARCHAR(100),
    ec_number VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(255),
    department VARCHAR(100),
    date_of_appointment VARCHAR(100),
    status ENUM('active','leave','inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_teachers_user_id (user_id),
    UNIQUE KEY uniq_teacher_employee_number (employee_number),
    CONSTRAINT fk_teachers_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- SUBJECTS
-- =====================================================

CREATE TABLE IF NOT EXISTS subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NULL,
    name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subjects_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_subject_class_name (class_id, name)
);

CREATE TABLE IF NOT EXISTS class_subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    subject_id INT NOT NULL,
    CONSTRAINT fk_class_subjects_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_class_subjects_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_class_subject (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    subject_id INT NOT NULL,
    UNIQUE KEY uniq_teacher_subject (teacher_id, subject_id),
    CONSTRAINT fk_teacher_subjects_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    CONSTRAINT fk_teacher_subjects_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teaching_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT,
    class_id INT,
    subject_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_teaching_assignment (teacher_id, class_id, subject_id),
    CONSTRAINT fk_teaching_assignments_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
    CONSTRAINT fk_teaching_assignments_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_teaching_assignments_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- =====================================================
-- ASSIGNMENTS / SUBMISSIONS / GRADES
-- =====================================================

CREATE TABLE IF NOT EXISTS assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_id INT,
    teacher_id INT,
    class_id INT,
    title VARCHAR(150),
    description TEXT,
    due_date DATE,
    file_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assignments_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
    CONSTRAINT fk_assignments_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
    CONSTRAINT fk_assignments_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,
    student_id INT NOT NULL,
    file_path VARCHAR(255),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_submission (assignment_id, student_id),
    CONSTRAINT fk_submissions_assignment
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    CONSTRAINT fk_submissions_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS grades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT,
    assignment_id INT,
    score INT,
    grade VARCHAR(5),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_grades_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_grades_assignment
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
);

-- =====================================================
-- FEES / FINANCE CORE
-- =====================================================

CREATE TABLE IF NOT EXISTS fee_structure (
    id INT AUTO_INCREMENT PRIMARY KEY,
    form_level VARCHAR(20) UNIQUE,
    term_fee DECIMAL(12,2) DEFAULT 0,
    annual_fee DECIMAL(12,2) DEFAULT 0,
    tuition_fee DECIMAL(12,2) DEFAULT 0,
    levy_fee DECIMAL(12,2) DEFAULT 0,
    sports_fee DECIMAL(12,2) DEFAULT 0,
    practical_fee DECIMAL(12,2) DEFAULT 0,
    examination_fee DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT,
    term_id INT NULL,
    amount DECIMAL(12,2) DEFAULT 0,
    paid DECIMAL(12,2) DEFAULT 0,
    method VARCHAR(50),
    reference VARCHAR(100),
    date_paid DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fees_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_fees_term
        FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    term_id INT NULL,
    term VARCHAR(20),
    year INT,
    total_amount DECIMAL(12,2) DEFAULT 0,
    status ENUM('UNPAID','PARTIAL','PAID','CANCELLED') DEFAULT 'UNPAID',
    pay_start DATE NULL,
    pay_end DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_invoice_student_term_year (student_id, term, year),
    CONSTRAINT fk_invoices_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_invoices_term
        FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    amount DECIMAL(12,2) DEFAULT 0,
    payment_method VARCHAR(30),
    reference VARCHAR(100),
    paid_at DATE,
    received_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_payments_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    CONSTRAINT fk_invoice_payments_received_by
        FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS receipts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    receipt_number VARCHAR(30) UNIQUE NOT NULL,
    student_id INT NOT NULL,
    invoice_id INT NULL,
    payment_id INT NULL,
    amount DECIMAL(12,2) DEFAULT 0,
    payment_method VARCHAR(30),
    reference VARCHAR(100),
    received_by INT NULL,
    receipt_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_receipts_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_receipts_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
    CONSTRAINT fk_receipts_payment
        FOREIGN KEY (payment_id) REFERENCES invoice_payments(id) ON DELETE SET NULL,
    CONSTRAINT fk_receipts_received_by
        FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS student_ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    transaction_date DATE NOT NULL,
    description VARCHAR(255),
    debit DECIMAL(12,2) DEFAULT 0,
    credit DECIMAL(12,2) DEFAULT 0,
    balance DECIMAL(12,2) DEFAULT 0,
    reference_type VARCHAR(50),
    reference_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_ledger_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_balances (
    student_id INT PRIMARY KEY,
    balance DECIMAL(12,2) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_balances_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS debtors_summary (
    student_id INT PRIMARY KEY,
    total_invoiced DECIMAL(12,2) DEFAULT 0,
    total_paid DECIMAL(12,2) DEFAULT 0,
    balance DECIMAL(12,2) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_debtors_summary_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sponsorships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    sponsor_type ENUM('BEAM','CAMFED','DONOR','OTHER') DEFAULT 'BEAM',
    approved_amount DECIMAL(12,2) DEFAULT 0,
    paid_amount DECIMAL(12,2) DEFAULT 0,
    balance DECIMAL(12,2) DEFAULT 0,
    status ENUM('PENDING','APPROVED','PARTIAL','PAID','CANCELLED') DEFAULT 'PENDING',
    notes TEXT,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sponsorships_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_sponsorships_created_by
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS fee_statements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT,
    statement_period VARCHAR(100),
    generated_by INT NULL,
    pdf_file VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_fee_statements_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_fee_statements_generated_by
        FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- EXPENSES / CASHBOOK / BUDGETS / LEDGER
-- =====================================================

CREATE TABLE IF NOT EXISTS expense_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category_id INT NULL,
    category VARCHAR(100),
    description TEXT,
    amount DECIMAL(12,2) NOT NULL,
    expense_date DATE NOT NULL,
    recorded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_expenses_category
        FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
    CONSTRAINT fk_expenses_recorded_by
        FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS income (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(100),
    amount DECIMAL(12,2),
    date_received DATE,
    reference VARCHAR(100),
    recorded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_income_recorded_by
        FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cashbook (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_date DATE,
    description VARCHAR(255),
    inflow DECIMAL(12,2) DEFAULT 0,
    outflow DECIMAL(12,2) DEFAULT 0,
    running_balance DECIMAL(12,2) DEFAULT 0,
    reference_type VARCHAR(50),
    reference_id INT,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cashbook_created_by
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_date DATE NOT NULL,
    type ENUM('INCOME','EXPENSE') NOT NULL,
    category VARCHAR(100) NOT NULL,
    reference_table VARCHAR(50),
    reference_id INT,
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ledger_transactions_created_by
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ledger (
    id INT AUTO_INCREMENT PRIMARY KEY,
    transaction_date DATE NOT NULL,
    type ENUM('INCOME','EXPENSE') NOT NULL,
    category VARCHAR(100),
    description TEXT,
    amount DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budgets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(100),
    year INT,
    allocated_amount DECIMAL(12,2) DEFAULT 0,
    spent_amount DECIMAL(12,2) DEFAULT 0,
    remaining_amount DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_budget_category_year (category, year)
);

-- =====================================================
-- SUPPLIERS / PURCHASES / BILLS / ASSETS
-- =====================================================

CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(100),
    address VARCHAR(255),
    status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NULL,
    category_id INT NULL,
    category VARCHAR(100),
    description VARCHAR(255),
    amount DECIMAL(12,2) DEFAULT 0,
    purchase_date DATE,
    status ENUM('PENDING','PAID') DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_purchases_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    CONSTRAINT fk_purchases_category
        FOREIGN KEY (category_id) REFERENCES purchase_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bills (
    id INT AUTO_INCREMENT PRIMARY KEY,
    supplier_id INT NULL,
    purchase_id INT NULL,
    bill_number VARCHAR(50),
    amount DECIMAL(12,2) DEFAULT 0,
    due_date DATE,
    status ENUM('UNPAID','PAID') DEFAULT 'UNPAID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bills_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
    CONSTRAINT fk_bills_purchase
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100),
    purchase_date DATE,
    purchase_value DECIMAL(12,2) DEFAULT 0,
    current_value DECIMAL(12,2) DEFAULT 0,
    status ENUM('ACTIVE','DISPOSED','LOST') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- LIBRARY / RESOURCES / NOTICES / ATTENDANCE
-- =====================================================

CREATE TABLE IF NOT EXISTS notices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    term_id INT NULL,
    title VARCHAR(100),
    message TEXT,
    category VARCHAR(30),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    publish_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    visibility ENUM('ALL','STUDENTS','TEACHERS','ADMIN') DEFAULT 'ALL',
    status ENUM('DRAFT','SCHEDULED','PUBLISHED') DEFAULT 'PUBLISHED',
    CONSTRAINT fk_notices_term
        FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS timetable (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    subject_id INT NOT NULL,
    teacher_id INT NOT NULL,
    day ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_timetable_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_timetable_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    CONSTRAINT fk_timetable_teacher
        FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS library_books (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    author VARCHAR(100),
    subject_id INT NULL,
    file_path VARCHAR(255),
    file_type ENUM('PDF','DOCX','XLSX','PPTX','OTHER') DEFAULT 'PDF',
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('AVAILABLE','ARCHIVED') DEFAULT 'AVAILABLE',
    available BOOLEAN DEFAULT TRUE,
    CONSTRAINT fk_library_books_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS library_borrowings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    book_id INT NOT NULL,
    borrowed_at DATE NOT NULL,
    due_date DATE NOT NULL,
    returned_at DATE DEFAULT NULL,
    status ENUM('BORROWED','RETURNED','OVERDUE') DEFAULT 'BORROWED',
    CONSTRAINT fk_library_borrowings_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_library_borrowings_book
        FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    student_id INT NOT NULL,
    date DATE NOT NULL,
    status ENUM('PRESENT','ABSENT') NOT NULL,
    marked_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_student_date (student_id, date),
    UNIQUE KEY uniq_attendance (class_id, student_id, date),
    CONSTRAINT fk_attendance_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_marked_by
        FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS resources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    subject_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    type ENUM('Worksheet','Notes','Presentation','Exam','Other') DEFAULT 'Worksheet',
    target_form VARCHAR(20),
    file_path VARCHAR(255) NOT NULL,
    uploaded_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_resources_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_resources_subject
        FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    CONSTRAINT fk_resources_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- SCHOOL INFO / SYSTEM / AUDIT
-- =====================================================

CREATE TABLE IF NOT EXISTS school_info (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    address VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS backups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    backup_file VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(100),
    table_name VARCHAR(100),
    record_id INT,
    old_values LONGTEXT,
    new_values LONGTEXT,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_logs_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- EMPLOYEES / PAYROLL
-- =====================================================

CREATE TABLE IF NOT EXISTS employees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    position VARCHAR(100),
    department VARCHAR(100),
    phone VARCHAR(50),
    email VARCHAR(150),
    basic_salary DECIMAL(12,2),
    status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payslips (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    pay_month VARCHAR(20) NOT NULL,
    basic_salary DECIMAL(12,2) DEFAULT 0,
    allowances DECIMAL(12,2) DEFAULT 0,
    deductions DECIMAL(12,2) DEFAULT 0,
    gross_pay DECIMAL(12,2) DEFAULT 0,
    net_pay DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payslips_employee
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- =====================================================
-- STUDENT CLASS HISTORY
-- =====================================================

CREATE TABLE IF NOT EXISTS student_classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    class_id INT NOT NULL,
    term_id INT NOT NULL,
    UNIQUE KEY uniq_student_class_term (student_id, class_id, term_id),
    CONSTRAINT fk_student_classes_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_classes_class
        FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_classes_term
        FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE
);

-- =====================================================
-- CUSTOMERS / PARENTS-LIKE CONTACTS
-- =====================================================

CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT UNIQUE,
    name VARCHAR(150),
    email VARCHAR(100),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_customers_student
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- OPTIONAL DEFAULT CATEGORIES
-- =====================================================

INSERT IGNORE INTO expense_categories (name) VALUES
('Salaries'),
('Electricity'),
('Water'),
('Stationery'),
('Maintenance'),
('Transport'),
('Sports'),
('Food'),
('Internet'),
('Other');

INSERT IGNORE INTO purchase_categories (name) VALUES
('Stationery'),
('Furniture'),
('ICT Equipment'),
('Textbooks'),
('Sports Equipment'),
('Maintenance Materials'),
('Cleaning Supplies'),
('Other');
