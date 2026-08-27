/* ===================== AUTH REMOVED =====================
   Login/Register/Reset is now handled by public/login.js only.
   Do NOT load public/script.js on the login page.
========================================================= */

/* ===================== DASHBOARD NAV ===================== */
function showPage(pageId) {
    document.querySelectorAll(".page-content").forEach(p => {
        p.classList.remove("active");
    });

    const page = document.getElementById(pageId);
    if (page) page.classList.add("active");
}



// =====================================================
// UI HELPERS: SEARCHABLE SELECTS + ACADEMIC SORT DISPLAY
// =====================================================
function injectSearchableSelectStyles() {
  if (document.getElementById("searchableSelectStyles")) return;

  const style = document.createElement("style");
  style.id = "searchableSelectStyles";
  style.textContent = `
    .select-search-input {
      width: 100%;
      padding: 9px 11px;
      margin: 0 0 6px 0;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      outline: none;
      font-size: 13px;
      background: #fff;
    }
    .select-search-input:focus {
      border-color: #0f766e;
      box-shadow: 0 0 0 3px rgba(15, 118, 110, .12);
    }
  `;
  document.head.appendChild(style);
}

function getSelectLabel(select) {
  const explicit = select.getAttribute("data-search-label");
  if (explicit) return explicit;

  const label = select.closest("label") || document.querySelector(`label[for="${select.id}"]`);
  if (label) return (label.innerText || "").replace(/[:*]/g, "").trim();

  const name = select.name || select.id || "option";
  return name.replace(/[_\[\]]+/g, " ").trim();
}

function enhanceSearchableSelects(root = document) {
  injectSearchableSelectStyles();

  const selects = root.querySelectorAll("select");

  selects.forEach(select => {
    if (select.dataset.searchEnhanced === "1") return;

    // Add search to big dropdowns and all multi-selects.
    if (!select.multiple && select.options.length < 7) return;

    select.dataset.searchEnhanced = "1";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "select-search-input";
    input.placeholder = `Search ${getSelectLabel(select)}...`;
    input.autocomplete = "off";

    select.parentNode.insertBefore(input, select);

    input.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();

      Array.from(select.options).forEach((opt, index) => {
        const text = (opt.textContent || "").toLowerCase();
        const isPlaceholder = index === 0 && !opt.value;
        opt.hidden = !isPlaceholder && q && !text.includes(q);
      });
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  enhanceSearchableSelects();
  showStudentExistsModalFromRedirect();
});

// Re-run when opening modals, because some selects are inside hidden modal content.
function refreshSearchableSelects() {
  enhanceSearchableSelects();
}

function openAddStudent() {
    setTimeout(refreshSearchableSelects, 50);
    const modal = document.getElementById("addStudentModal");
    if (modal) modal.style.display = "flex";
}

function closeAddStudent() {
    const modal = document.getElementById("addStudentModal");
    if (modal) modal.style.display = "none";
}

function showStudentExistsModalFromRedirect() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("error") !== "student_exists") return;

    const modal = document.getElementById("studentExistsModal");
    if (modal) modal.style.display = "flex";
}

function closeStudentExistsModal() {
    const modal = document.getElementById("studentExistsModal");
    if (modal) modal.style.display = "none";

    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash || "#students"}`);
}

function filterStudents(value) {
    value = value.toLowerCase();
    document.querySelectorAll("#studentsTable tbody tr").forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(value) ? "" : "none";
    });
}

function filterForm(form) {
    document.querySelectorAll("#studentsTable tbody tr").forEach(row => {
        row.style.display = !form || row.innerText.includes(form) ? "" : "none";
    });
}

function openEditStudent(student) {
    document.getElementById("edit_id").value = student.id;
    document.getElementById("edit_first_name").value = student.first_name;
    document.getElementById("edit_last_name").value = student.last_name;
    document.getElementById("edit_email").value = student.email;
    document.getElementById("edit_phone").value = student.phone || "";
    document.getElementById("edit_form_level").value = student.form_level;

    document.getElementById("editStudentModal").style.display = "flex";
}

function closeEditStudent() {
    document.getElementById("editStudentModal").style.display = "none";
}

function filterTeachers(value) {
    value = value.toLowerCase();
    document.querySelectorAll("#teachersTable tbody tr").forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(value) ? "" : "none";
    });
}

function filterDepartment(dept) {
    document.querySelectorAll("#teachersTable tbody tr").forEach(row => {
        row.style.display = !dept || row.innerText.includes(dept) ? "" : "none";
    });
}

function openAddTeacher() {
    setTimeout(refreshSearchableSelects, 50);
    const modal = document.getElementById("addTeacherModal");
    if (modal) modal.style.display = "flex";
}

function closeAddTeacher() {
    const modal = document.getElementById("addTeacherModal");
    if (modal) modal.style.display = "none";
}

function openEditTeacher(teacher) {
    document.getElementById("edit_teacher_id").value = teacher.id;
    document.getElementById("edit_teacher_first_name").value = teacher.first_name;
    document.getElementById("edit_teacher_last_name").value = teacher.last_name;
    document.getElementById("edit_teacher_email").value = teacher.email;
    document.getElementById("edit_teacher_department").value = teacher.department;
    document.getElementById("edit_teacher_status").value = teacher.status;

    document.getElementById("editTeacherModal").style.display = "flex";
}

function closeEditTeacher() {
    document.getElementById("editTeacherModal").style.display = "none";
}

// ---------- OPEN/CLOSE MODALS ----------
function openAddClass() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("addClassModal").style.display = "flex";
}

function closeAddClass() {
    document.getElementById("addClassModal").style.display = "none";
}

function openTeacherModal() {
    setTimeout(refreshSearchableSelects, 50);
  document.getElementById("assignTeacherModal").style.display = "flex";
}

function closeTeacherModal() {
  document.getElementById("assignTeacherModal").style.display = "none";
}

function openEditClass(cls) {
    document.getElementById("edit_class_id").value = cls.id;
    document.getElementById("edit_class_name").value = cls.name;
    document.getElementById("edit_class_form_level").value = cls.form_level;
    document.getElementById("edit_class_room").value = cls.room || "";

    document.getElementById("editClassModal").style.display = "flex";
}

function closeEditClass() {
    document.getElementById("editClassModal").style.display = "none";
}

// ---------- ASSIGN TEACHER MODAL ----------
function openAssignTeacher() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("assignTeacherModal").style.display = "flex";
}

function closeAssignTeacher() {
    document.getElementById("assignTeacherModal").style.display = "none";
}

// ---------- MANAGE SUBJECTS MODAL ----------
function openManageSubjects() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("manageSubjectsModal").style.display = "flex";
}

function closeManageSubjects() {
    document.getElementById("manageSubjectsModal").style.display = "none";
}

// ================= ASSIGN STUDENT MODAL =================
function openAssignStudent() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById('assignStudentModal').style.display = 'flex';
}

function closeAssignStudent() {
    document.getElementById('assignStudentModal').style.display = 'none';
}

// SUBJECT MODALS


function openAssignSubjects() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById('assignSubjectsModal').style.display = 'flex';
}
function closeAssignSubjects() {
    document.getElementById('assignSubjectsModal').style.display = 'none';
}



function openAddSubject() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById('addSubjectModal').style.display = 'flex';
}
function closeAddSubject() {
    document.getElementById('addSubjectModal').style.display = 'none';
}

function openEditSubject(subject) {
    document.getElementById('edit_subject_id').value = subject.id;
    document.getElementById('edit_subject_name').value = subject.name;
    document.getElementById('editSubjectModal').style.display = 'flex';
}
function closeEditSubject() {
    document.getElementById('editSubjectModal').style.display = 'none';
}

function openFeeStructure() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("feeStructureModal").style.display = "flex";
}
function closeFeeStructure() {
    document.getElementById("feeStructureModal").style.display = "none";
}

function openPaymentModal() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("paymentModal").style.display = "flex";
}
function closePaymentModal() {
    document.getElementById("paymentModal").style.display = "none";
}

function openFeeReport() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("feeReportModal").style.display = "flex";
}
function closeFeeReport() {
    document.getElementById("feeReportModal").style.display = "none";
}

function openEditFee(fee) {
    document.getElementById("editFeeModal").style.display = "flex";

    document.getElementById("edit_fee_id").value = fee.id;
    document.getElementById("edit_form_level").value = fee.form_level;
    document.getElementById("edit_term_fee").value = fee.term_fee;
    document.getElementById("edit_annual_fee").value = fee.annual_fee;
}

function closeEditFee() {
    document.getElementById("editFeeModal").style.display = "none";
}

async function loadLibrary() {
    const res = await fetch("/api/library");
    if (!res.ok) return;

    const data = await res.json();

    const tbody = document.querySelector("#libraryTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    data.forEach(item => {
        const isDigital = !!item.file_path;

        tbody.innerHTML += `
            <tr>
                <td>${item.id}</td>
                <td>${item.title}</td>
                <td>${item.author}</td>
                <td>${item.category ?? "—"}</td>
                <td>${isDigital ? item.file_type : "PHYSICAL"}</td>
                <td>
                    <span class="badge ${isDigital || item.available ? 'success' : 'danger'}">
                        ${isDigital ? 'AVAILABLE' : (item.available ? 'AVAILABLE' : 'BORROWED')}
                    </span>
                </td>
                <td>
                    <button class="btn-sm" onclick='editBook(${JSON.stringify(item)})'>Edit</button>
                    <button class="btn-sm danger" onclick="deleteBook(${item.id})">Delete</button>
                </td>
            </tr>
        `;
    });
}

document.addEventListener("DOMContentLoaded", loadLibrary);

function filterLibrary(value) {
    const rows = document.querySelectorAll("#libraryTable tbody tr");
    value = value.toLowerCase();

    rows.forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(value)
            ? ""
            : "none";
    });
}

function sortLibrary(colIndex) {
    const table = document.getElementById("libraryTable");
    const rows = Array.from(table.rows).slice(1);
    const asc = table.dataset.sort !== "asc";

    rows.sort((a, b) => {
        return asc
            ? a.cells[colIndex].innerText.localeCompare(b.cells[colIndex].innerText)
            : b.cells[colIndex].innerText.localeCompare(a.cells[colIndex].innerText);
    });

    table.dataset.sort = asc ? "asc" : "desc";
    rows.forEach(r => table.tBodies[0].appendChild(r));
}

async function deleteBook(id) {
    if (!confirm("Delete this resource?")) return;

    await fetch(`/api/library/${id}`, { method: "DELETE" });
    loadLibrary();
}

function openAddBook() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("addBookModal").style.display = "flex";
}
function closeAddBook() {
    document.getElementById("addBookModal").style.display = "none";
}

function openAddDigital() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("addDigitalModal").style.display = "flex";
}
function closeAddDigital() {
    document.getElementById("addDigitalModal").style.display = "none";
}

function openBorrowManager() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("borrowModal").style.display = "flex";
}
function closeBorrowManager() {
    document.getElementById("borrowModal").style.display = "none";
}

function editBook(book) {
    const modal = document.getElementById("editLibraryModal");
    modal.style.display = "flex";

    modal.querySelector("[name=id]").value = book.id;
    modal.querySelector("[name=title]").value = book.title;
    modal.querySelector("[name=author]").value = book.author;
    modal.querySelector("[name=category]").value = book.category;
    modal.querySelector("[name=available]").value = book.available ? 1 : 0;
}

function closeEditLibrary() {
    document.getElementById("editLibraryModal").style.display = "none";
}

async function saveBook(e) {
    e.preventDefault();
    const form = e.target;

    await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: form.title.value,
            author: form.author.value,
            category: form.category.value,
            type: "Book"
        })
    });

    closeAddBook();
    loadLibrary();
}

async function saveDigital(e) {
    e.preventDefault();
    const form = e.target;

    await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: form.title.value,
            author: form.author.value,
            category: form.category.value,
            type: "Digital"
        })
    });

    closeAddDigital();
    loadLibrary();
}

async function updateBook(e) {
    e.preventDefault();
    const form = e.target;

    await fetch(`/api/library/${form.id.value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: form.title.value,
            author: form.author.value,
            category: form.category.value,
            available: form.available.value
        })
    });

    closeEditLibrary();
    loadLibrary();
}

async function borrowBook(e) {
    e.preventDefault();
    const form = e.target;

    await fetch("/api/library/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            student_id: form.student_id.value,
            book_id: form.book_id.value,
            due_date: form.due_date.value
        })
    });

    closeBorrowManager();
    loadLibrary();
}

async function loadNotices() {
    const res = await fetch("/api/notices");
    const notices = await res.json();

    const container = document.getElementById("noticesList");
    if (!container) return;
    container.innerHTML = "";

    if (notices.length === 0) {
        container.innerHTML = "<p style='color:#777'>No notices published.</p>";
        return;
    }

    notices.forEach(n => {
        container.innerHTML += `
            <div class="notice-card">
                <!-- Category badge top right -->
                <div class="notice-category">${n.category}</div>

                <!-- Status badge top right, next to category -->
                <div style="position:absolute; top:12px; right:90px;">
                    ${noticeStatusBadge(n.status)}
                </div>

                <!-- Title -->
                <div class="notice-title">${n.title}</div>

                <!-- Body -->
                <div class="notice-body">${n.message}</div>

                <!-- Metadata -->
                <div class="notice-meta">
                    <span>
                        Published ${new Date(n.created_at).toDateString()} by <strong>System Administrator</strong>
                    </span>
                </div>

                <!-- Actions -->
                <div class="notice-actions">
                    <button class="btn-sm" onclick='editNotice(${JSON.stringify(n)})'>Edit</button>
                    <button class="btn-sm danger" onclick="deleteNotice(${n.id})">Delete</button>
                </div>
            </div>
        `;
    });

}

document.addEventListener("DOMContentLoaded", loadNotices);

function openAddNotice() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("addNoticeModal").style.display = "flex";
}
function closeAddNotice() {
    document.getElementById("addNoticeModal").style.display = "none";
}

function editNotice(n) {
    const modal = document.getElementById("editNoticeModal");
    modal.style.display = "flex";

    modal.querySelector("[name=id]").value = n.id;
    modal.querySelector("[name=title]").value = n.title;
    modal.querySelector("[name=message]").value = n.message;
    modal.querySelector("[name=category]").value = n.category;
}
function closeEditNotice() {
    document.getElementById("editNoticeModal").style.display = "none";
}

async function saveNotice(e) {
    e.preventDefault();
    const f = e.target;

    await fetch("/api/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: f.title.value,
            message: f.message.value,
            category: f.category.value
        })
    });

    closeAddNotice();
    loadNotices();
}

async function updateNotice(e) {
    e.preventDefault();
    const f = e.target;

    await fetch(`/api/notices/${f.id.value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: f.title.value,
            message: f.message.value,
            category: f.category.value
        })
    });

    closeEditNotice();
    loadNotices();
}

async function deleteNotice(id) {
    if (!confirm("Delete this notice?")) return;

    await fetch(`/api/notices/${id}`, { method: "DELETE" });
    loadNotices();
}

function openScheduleNotice() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("scheduleNoticeModal").style.display = "flex";
}
function closeScheduleNotice() {
    document.getElementById("scheduleNoticeModal").style.display = "none";
}

async function scheduleNotice(e) {
    e.preventDefault();
    const f = e.target;

    await fetch("/api/notices/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: f.title.value,
            message: f.message.value,
            category: f.category.value,
            visibility: f.visibility.value,
            publish_at: f.publish_at.value
        })
    });

    closeScheduleNotice();
    loadNotices();
}


function noticeStatusBadge(status) {
    if (status === "SCHEDULED") 
        return `<span class="badge warning">SCHEDULED</span>`;
    if (status === "DRAFT") 
        return `<span class="badge">DRAFT</span>`;
    return ""; // PUBLISHED notices don't need a badge
}

async function loadReport(type = 'student') {
    // Fetch KPI data
    const res = await fetch("/api/reports/kpi");
    const data = await res.json();

    const kpiContainer = document.getElementById("reportKPI");
    if (!kpiContainer) return;
    kpiContainer.innerHTML = `
        <div class="card total-enrollments">
            <h1>${data.total_students}</h1>
            <p>Total Enrollments</p>
        </div>
        <div class="card active-teachers">
            <h1>${data.active_teachers}</h1>
            <p>Active Teachers</p>
        </div>
        <div class="card monthly-revenue">
            <h1>$${data.monthly_revenue}</h1>
            <p>Monthly Revenue</p>
        </div>
    `;

    // Placeholder for report content
    const reportContent = document.getElementById("reportContent");
    if (reportContent) {
        reportContent.innerHTML = `<p style="color:#666;">${type} report content will appear here.</p>`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const reportsPage = document.getElementById("reports");
    if (reportsPage && reportsPage.classList.contains("active")) {
        loadReport();
    }
});


if (typeof type !== "undefined") {
    if (type === 'student') {
        // student report
    } else if (type === 'teacher') {
        // teacher analytics
    } else if (type === 'financial') {
        // financial report
    } else if (type === 'academic') {
        // academic report
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const infoDiv = document.getElementById("schoolInfo");
    if (infoDiv) {
        loadSchoolInfo();
    }
});



async function loadSchoolInfo() {
    try {
        const container = document.getElementById("schoolInfo");
        if (!container) return;

        const res = await fetch("/api/system/school-info");
        const data = await res.json();

        container.innerHTML = `
            <p><strong>Name:</strong> ${data.name}</p>
            <p><strong>Address:</strong> ${data.address}</p>
            <p><strong>Phone:</strong> ${data.phone}</p>
            <p><strong>Email:</strong> ${data.email}</p>
        `;
    } catch (err) {
        console.error(err);
    }
}



async function openEditSchoolInfo() {
    const modal = document.getElementById("editSchoolModal");
    const form = modal.querySelector("form");

    const res = await fetch("/api/system/school-info");
    const data = await res.json();

    form.name.value = data.name || "";
    form.address.value = data.address || "";
    form.phone.value = data.phone || "";
    form.email.value = data.email || "";

    modal.style.display = "flex";
}

function closeEditSchoolInfo() {
    document.getElementById("editSchoolModal").style.display = "none";
}



async function saveSchoolInfo(e) {
    e.preventDefault();

    const form = e.target;

    const payload = {
        name: form.name.value,
        address: form.address.value,
        phone: form.phone.value,
        email: form.email.value
    };

    const res = await fetch("/api/system/school-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        closeEditSchoolInfo();
        loadSchoolInfo(); // refresh display
        alert("School information updated");
    }
}

async function loadSystemStatus() {
    const res = await fetch("/api/system/status");
    const status = await res.json();

    const container = document.getElementById("systemStatus");
    if (!container) return;
    container.innerHTML = `
        <p><strong>Database Status:</strong> ${status.dbStatus}</p>
        <p><strong>Last Backup:</strong> ${status.lastBackup}</p>
        <p><strong>System Version:</strong> ${status.version}</p>
    `;
}

// Call on page load
document.addEventListener("DOMContentLoaded", loadSystemStatus);

async function runMaintenance() {
    if (!confirm("Run system maintenance?")) return;

    await fetch("/api/system/maintenance", { method: "POST" });

    alert("Maintenance completed.");
    loadSystemStatus();
}

function openUserManagement() {
    document.getElementById("userManagementModal").style.display = "flex";
    loadUsers();
}
function closeUserManagement() {
    document.getElementById("userManagementModal").style.display = "none";
}

async function loadUsers() {
    const res = await fetch("/api/system/users");
    const users = await res.json();
    const tbody = document.querySelector("#usersTable tbody");
    tbody.innerHTML = "";

    users.forEach(u => {
        tbody.innerHTML += `
            <tr>
                <td>${u.id}</td>
                <td>${u.first_name} ${u.last_name}</td>
                <td>${u.email}</td>
                <td>${u.role}</td>
                <td>${u.status}</td>
                <td>
                    <button class="btn-sm" onclick='editUser(${JSON.stringify(u)})'>Edit</button>
                    <button class="btn-sm danger" onclick="deleteUser(${u.id})">Delete</button>
                </td>
            </tr>
        `;
    });
}

function openBackupModal() {
    document.getElementById("backupModal").style.display = "flex";
    loadBackups();
}
function closeBackupModal() {
    document.getElementById("backupModal").style.display = "none";
}

async function loadBackups() {
    const res = await fetch("/api/system/backups");
    const backups = await res.json();
    const ul = document.getElementById("backupList");
    ul.innerHTML = "";
    backups.forEach(b => {
        ul.innerHTML += `<li>${b.backup_file} - ${new Date(b.created_at).toLocaleString()}</li>`;
    });
}

async function runBackup() {
    await fetch("/api/system/backup", { method: "POST" });
    alert("Backup completed!");
    loadBackups();
}


function openAddResource() {
    document.getElementById("addResourceModal").style.display = "flex";
}

function closeAddResource() {
    document.getElementById("addResourceModal").style.display = "none";
}


document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("schoolSettingsBtn")?.addEventListener("click", openEditSchoolInfo);
    document.getElementById("userManagementBtn")?.addEventListener("click", openUserManagement);
    document.getElementById("backupBtn")?.addEventListener("click", openBackupModal);
    document.getElementById("maintenanceBtn")?.addEventListener("click", runMaintenance);
});


// Show / Hide Login Password
document.addEventListener("DOMContentLoaded", () => {

    const loginPassword = document.getElementById("loginPassword");
    const toggleLoginPassword = document.getElementById("toggleLoginPassword");

    if (loginPassword && toggleLoginPassword) {
        toggleLoginPassword.addEventListener("change", () => {
            loginPassword.type =
                toggleLoginPassword.checked ? "text" : "password";
        });
    }

});

function showReset() {

    document.getElementById("loginForm").style.display = "none";

    document.getElementById("registerForm").style.display = "none";

    document.getElementById("resetForm").style.display = "block";

}

document.getElementById("resetForm")?.addEventListener("submit", async (e) => {

    e.preventDefault();

    const authMessage = document.getElementById("authMessage");

    try {

        const payload = {
            role: document.getElementById("resetRole").value.trim(),
            fullName: document.getElementById("resetFullName").value.trim(),
            uniqueId: document.getElementById("resetUniqueId").value.trim(),
            newPassword: document.getElementById("resetNewPassword").value.trim()
        };

        const res = await fetch("/reset-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        authMessage.innerText = data.message;
        authMessage.style.color = data.success ? "lightgreen" : "red";

        if (data.success) {
            document.getElementById("resetForm").reset();
        }

    } catch (error) {

        console.error(error);

        authMessage.innerText = "Something went wrong.";
        authMessage.style.color = "red";
    }
});

function openImportStudents() {
    setTimeout(refreshSearchableSelects, 50);
    document.getElementById("importStudentsModal").style.display = "flex";
}

function closeImportStudents() {
    document.getElementById("importStudentsModal").style.display = "none";
}



function loadAssignedTeachersForDeassign(classId) {
    const container = document.getElementById('deassignTeachersContainer');
    container.innerHTML = ''; // clear previous list

    if (!classId) return;

    fetch(`/admin/classes/${classId}/assigned-teachers`)
        .then(res => res.json())
        .then(teachers => {
            if (teachers.length === 0) {
                container.innerHTML = '<p>No teachers assigned yet.</p>';
                return;
            }

            teachers.forEach(t => {
                const div = document.createElement('div');
                div.classList.add('checkbox-item');
                div.innerHTML = `
                    <label>
                        <input type="checkbox" name="teacher_ids[]" value="${t.id}">
                        ${t.first_name} ${t.last_name}
                    </label>
                `;
                container.appendChild(div);
            });
        })
        .catch(err => {
            console.error(err);
            container.innerHTML = '<p style="color:red;">Error loading teachers.</p>';
        });
}



function showFinanceTab(id) {
  document.querySelectorAll('.finance-tab').forEach(t => t.classList.remove('active'));

  const tab = document.getElementById(id);
  if (!tab) return;

  tab.classList.add('active');

  // Auto-load debtors when the tab opens
  if (id === 'finance-debtors') {
    loadDebtors(true);
  }
}


/* ===================== FINANCE: DEBTORS ===================== */
async function loadDebtors(autostart = false) {
  const body = document.getElementById('debtorsBody');
  const countEl = document.getElementById('debtorsCount');
  const totalEl = document.getElementById('debtorsTotal');

  const fromEl = document.getElementById('debtorsFrom');
  const toEl = document.getElementById('debtorsTo');

  const classEl = document.getElementById('debtorsClass');
  const formEl = document.getElementById('debtorsForm');

  if (!body || !countEl || !totalEl || !fromEl || !toEl) return;

  // Avoid repeated autoloads
  if (autostart && window.__debtorsLoadedOnce) return;

  const from = (fromEl.value || '').trim();
  const to = (toEl.value || '').trim();

  const classId = classEl ? (classEl.value || '').trim() : '';
  const formLevel = formEl ? (formEl.value || '').trim() : '';

  body.innerHTML = `
    <tr>
      <td colspan="6" class="apro-center-muted">
        Loading debtors...
      </td>
    </tr>
  `;

  try {
    const params = new URLSearchParams();

    if (from) params.set('from', from);
    if (to) params.set('to', to);

    if (classId) params.set('class_id', classId);
    if (formLevel) params.set('form_level', formLevel);

    const res = await fetch(
      '/admin/finance/debtors?' + params.toString(),
      {
        headers: {
          'Accept': 'application/json'
        },
        credentials: 'same-origin'
      }
    );

    // Debug unauthorized redirects
    const contentType = res.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
      const text = await res.text();

      console.error(
        'Debtors endpoint returned HTML instead of JSON:',
        text.substring(0, 500)
      );

      throw new Error('Server returned HTML instead of JSON');
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    const rows = Array.isArray(data.rows)
      ? data.rows
      : [];

    const totalOutstanding = Number(
      data.total_outstanding || 0
    );

    countEl.textContent = rows.length;
    totalEl.textContent = totalOutstanding.toFixed(2);

    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td colspan="6" class="apro-center-muted">
            No debtors found.
          </td>
        </tr>
      `;
    } else {
      body.innerHTML = rows.map(r => {

        const name =
          `${(r.first_name || '').trim()} ${(r.last_name || '').trim()}`
            .trim();

        const student =
          `${r.student_reg || ''} - ${name}`;

        return `
          <tr>
            <td class="td-strong">
              ${escapeHtml(student)}
            </td>

            <td>
              ${escapeHtml(r.form_level || '-')}
            </td>

            <td>
              ${escapeHtml(r.class_name || '-')}
            </td>

            <td>
              $${Number(r.total_invoiced || 0).toFixed(2)}
            </td>

            <td>
              $${Number(r.total_paid || 0).toFixed(2)}
            </td>

            <td class="td-strong text-danger">
              $${Number(r.balance || 0).toFixed(2)}
            </td>
          </tr>
        `;
      }).join('');
    }

    window.__debtorsLoadedOnce = true;

  } catch (err) {
    console.error('loadDebtors error:', err);

    body.innerHTML = `
      <tr>
        <td colspan="6" class="apro-center-muted">
          Error loading debtors.
        </td>
      </tr>
    `;

    countEl.textContent = '0';
    totalEl.textContent = '0.00';
  }
}
function clearDebtorsFilter() {
  const fromEl = document.getElementById('debtorsFrom');
  const toEl = document.getElementById('debtorsTo');
  if (fromEl) fromEl.value = '';
  if (toEl) toEl.value = '';
  window.__debtorsLoadedOnce = false;
  loadDebtors(false);
}

// basic HTML escaping for injected strings
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
    // Populate and show the Edit form
function startEdit(emp) {
    const form = document.getElementById('edit-employee-form');
    form.style.display = 'block';
    form.action = '/admin/employees/' + emp.id + '/edit';
    form.id.value = emp.id;
    form.first_name.value = emp.first_name || '';
    form.last_name.value = emp.last_name || '';
    form.position.value = emp.position || '';
    form.department.value = emp.department || '';
    form.phone.value = emp.phone || '';
    form.email.value = emp.email || '';
    form.basic_salary.value = emp.basic_salary || '';
    form.status.value = emp.status || 'ACTIVE';
    // Scroll to the edit form
    form.scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    const form = document.getElementById('edit-employee-form');
    form.style.display = 'none';
}


function toggleNewExpenseCat(sel){
    document.getElementById("newExpenseCat").style.display =
        sel.value === "NEW" ? "inline-block" : "none";
}


function toggleNewPurchaseCat(sel){
    document.getElementById("newPurchaseCat").style.display =
        sel.value === "NEW" ? "inline-block" : "none";
}


async function loadSchoolInfo() {
  const box = document.getElementById("schoolInfo");
  if (!box) return;

  box.innerHTML = "Loading...";

  const res = await fetch("/api/system/school-info");
  const info = await res.json();

  box.innerHTML = `
    <div class="info-grid">
      <div class="info-block">
        <h4>School Name</h4>
        <p>${info.name || "-"}</p>
      </div>
      <div class="info-block">
        <h4>Address</h4>
        <p>${info.address || "-"}</p>
      </div>
      <div class="info-block">
        <h4>Phone</h4>
        <p>${info.phone || "-"}</p>
      </div>
      <div class="info-block">
        <h4>Email</h4>
        <p>${info.email || "-"}</p>
      </div>
    </div>
  `;
}

window.addEventListener("load", () => {
  loadSchoolInfo();
  loadSystemStatus(); // if you have it
});

async function openEditSchoolInfo() {
  const res = await fetch("/api/system/school-info");
  const info = await res.json();

  document.getElementById("schName").value = info.name || "";
  document.getElementById("schAddress").value = info.address || "";
  document.getElementById("schPhone").value = info.phone || "";
  document.getElementById("schEmail").value = info.email || "";

  document.getElementById("schoolModal").style.display = "block";
}

function closeSchoolInfo() {
  document.getElementById("schoolModal").style.display = "none";
}

async function saveSchoolInfo() {
  const payload = {
    name: document.getElementById("schName").value.trim(),
    address: document.getElementById("schAddress").value.trim(),
    phone: document.getElementById("schPhone").value.trim(),
    email: document.getElementById("schEmail").value.trim(),
  };

  const res = await fetch("/api/system/school-info", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const out = await res.json();
  if (!out.success) {
    alert(out.error || "Failed to save");
    return;
  }

  closeSchoolInfo();
  loadSchoolInfo();
}

function setActive(btn){
document.querySelectorAll(".sidebar .nav-item").forEach(b => b.classList.remove("active"));
btn.classList.add("active");
}



// Adds data-label to each <td> based on its column header text
function applyResponsiveTableLabels() {
const tables = document.querySelectorAll(
  ".data-table, .admin-table, .pro-table, .tpro-table, table.table"
);

tables.forEach(table => {
  const headers = Array.from(table.querySelectorAll("thead th")).map(th =>
    (th.innerText || "").trim()
  );

  if (!headers.length) return;

  table.querySelectorAll("tbody tr").forEach(tr => {
    Array.from(tr.children).forEach((td, i) => {
      if (!td.getAttribute("data-label")) {
        td.setAttribute("data-label", headers[i] || `Column ${i + 1}`);
      }
    });
  });
});
}

document.addEventListener("DOMContentLoaded", applyResponsiveTableLabels);
// Optional: set default active on load (match your default page)
window.addEventListener("DOMContentLoaded", () => {
const first = document.querySelector(".sidebar .nav-item");
if (first) first.classList.add("active");
});


function setInvoiceAmountFromSelection(){
  const scope = document.getElementById('invoiceScope')?.value || 'single';
  const amountEl = document.getElementById('invoiceAmount');
  if (!amountEl) return;

  let level = "";

  if (scope === "single") {
    const studentSel = document.getElementById("invoiceStudent");
    const opt = studentSel?.options?.[studentSel.selectedIndex];
    // you can embed form level in option text OR better: add data-form attribute in EJS
    // easiest: use data-form attribute (see below)
    level = opt?.dataset?.form || "";
  } else if (scope === "level") {
    level = document.getElementById("invoiceLevel")?.value || "";
  } else {
    // scope all: leave blank (you might force user to select a level OR set 0)
    amountEl.value = "";
    return;
  }

  const amt = feeMap[String(level).toLowerCase()] ?? 0;
  amountEl.value = amt.toFixed(2);
}

// call when selections change
document.getElementById("invoiceScope")?.addEventListener("change", () => {
  toggleInvoiceScope();
  setInvoiceAmountFromSelection();
});
document.getElementById("invoiceStudent")?.addEventListener("change", setInvoiceAmountFromSelection);
document.getElementById("invoiceLevel")?.addEventListener("change", setInvoiceAmountFromSelection);

// run once
setInvoiceAmountFromSelection();


function toggleInvoiceScope() {
  const scope = document.getElementById("invoiceScope")?.value;

  const studentSel = document.getElementById("invoiceStudent");
  const levelSel = document.getElementById("invoiceLevel");
  const classSel = document.getElementById("invoiceClass");

  if (!studentSel || !levelSel || !classSel) return;

  // reset visibility
  studentSel.style.display = "none";
  levelSel.style.display = "none";
  classSel.style.display = "none";

  // reset required flags
  studentSel.required = false;
  levelSel.required = false;
  classSel.required = false;

  if (scope === "single") {
    studentSel.style.display = "";
    studentSel.required = true;
  } else if (scope === "level") {
    levelSel.style.display = "";
    levelSel.required = true;
  } else if (scope === "class") {
    classSel.style.display = "";
    classSel.required = true;
  }
  // scope === "school" -> nothing required
}
function resetClassForm() {

    // Reset all form fields
    const form = document.getElementById("classForm");

    if (form) {
        form.reset();
    }

    // Clear hidden ID field if editing
    const classId = document.getElementById("classId");

    if (classId) {
        classId.value = "";
    }

    // Reset button text
    const submitBtn = document.getElementById("submitBtn");

    if (submitBtn) {
        submitBtn.innerHTML = "Save Class";
    }

    // Remove validation styles
    document.querySelectorAll(".is-invalid").forEach(el => {
        el.classList.remove("is-invalid");
    });

    document.querySelectorAll(".is-valid").forEach(el => {
        el.classList.remove("is-valid");
    });

}
let studentSearchTimeout;

async function searchStudents(query) {

    clearTimeout(studentSearchTimeout);

    studentSearchTimeout = setTimeout(async () => {

        const tbody = document.querySelector("#studentsTable tbody");

        if (!query.trim()) {
            location.reload();
            return;
        }

        try {

            const response = await fetch(
                `/admin/students/search?q=${encodeURIComponent(query)}`
            );

            const students = await response.json();

            tbody.innerHTML = "";

            if (!students.length) {

                tbody.innerHTML = `
                    <tr>
                        <td colspan="10">
                            No students found
                        </td>
                    </tr>
                `;

                return;
            }

            students.forEach(s => {

                tbody.innerHTML += `
                    <tr>

                        <td>${s.id}</td>

                        <td>${s.unique_id}</td>

                        <td>${s.first_name} ${s.last_name}</td>

                        <td>${s.form_level || "-"}</td>

                        <td>${s.email || "-"}</td>

                        <td>${s.phone || "-"}</td>

                        <td>${s.date_of_birth || "-"}</td>

                        <td>${s.birth_id_number || "-"}</td>

                        <td>${s.status || "-"}</td>

                        <td>

                            <button
                                class="btn btn-primary btn-sm"
                                onclick="editStudent(${s.id})">

                                Edit

                            </button>

                        </td>

                    </tr>
                `;
            });

        } catch (err) {

            console.error("Search failed:", err);

        }

    }, 300);
}
async function viewClassStudents(classId, className) {

  document.getElementById(
    "viewStudentsModal"
  ).style.display = "flex";

  document.getElementById(
    "viewStudentsTitle"
  ).innerHTML =
    `👨‍🎓 ${className} Students`;

  const tbody =
    document.getElementById(
      "classStudentsBody"
    );

  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="apro-center-muted">
        Loading students...
      </td>
    </tr>
  `;

  try {

    const res = await fetch(
      `/admin/classes/${classId}/students`
    );

    const students = await res.json();

    if (!students.length) {

      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="apro-center-muted">
            No students assigned to this class.
          </td>
        </tr>
      `;

      return;
    }

    tbody.innerHTML = "";

    students.forEach((student, index) => {

      tbody.innerHTML += `

        <tr>

          <td>
            <strong>${index + 1}</strong>
          </td>

          <td>
            ${student.unique_id}
          </td>

          <td>
            ${student.first_name}
            ${student.last_name}
          </td>

          <td>
            ${student.form_level || "-"}
          </td>

          <td>
            ${student.email || "-"}
          </td>

          <td>
            ${student.phone || "-"}
          </td>

          <td>

            <button
              class="apro-btn apro-btn-danger apro-btn-sm"
              onclick="removeStudentFromClass(${student.id})">

              ❌ Remove

            </button>

          </td>

          <td>

            <span class="apro-badge apro-badge-ok">

              ${(student.status || "ACTIVE").toUpperCase()}

            </span>

          </td>

        </tr>

      `;

    });

  } catch (err) {

    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="apro-center-muted">
          Failed to load students.
        </td>
      </tr>
    `;

    console.error(err);
  }
}
async function removeStudentFromClass(studentId) {

  const confirmed = confirm(
    "Remove this student from this class?"
  );

  if (!confirmed) return;

  try {

    const res = await fetch(
      `/admin/students/${studentId}/remove-class`,
      {
        method: "POST"
      }
    );

    const data = await res.json();

    if (data.success) {

      alert(
        "Student removed successfully."
      );

      location.reload();

    } else {

      alert(
        data.message || "Failed to remove student."
      );

    }

  } catch (err) {

    console.error(err);

    alert("Something went wrong.");

  }
}
function closeViewStudents() {
  document.getElementById("viewStudentsModal").style.display = "none";
}

async function removeStudentFromClass(studentId) {

  const confirmed = confirm(
    "Remove this student from the class?"
  );

  if (!confirmed) return;

  try {

    const res = await fetch(
      `/admin/students/${studentId}/remove-class`,
      {
        method: "POST"
      }
    );

    const data = await res.json();

    if (data.success) {

      alert("Student removed from class successfully.");

      location.reload();

    } else {

      alert(data.message || "Failed to remove.");

    }

  } catch (err) {

    console.error(err);

    alert("Something went wrong.");

  }
}
function openImportTeachers() {
    setTimeout(refreshSearchableSelects, 50);

  const modal =
    document.getElementById(
      "importTeachersModal"
    );

  if (modal) {
    modal.style.display = "flex";
  }
}

function closeImportTeachers() {

  const modal =
    document.getElementById(
      "importTeachersModal"
    );

  if (modal) {
    modal.style.display = "none";
  }
}
