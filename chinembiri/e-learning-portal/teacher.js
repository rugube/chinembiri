// ================= TEACHER PORTAL JS =================

// Page navigation
function showPage(pageId) {
    document.querySelectorAll(".page-content").forEach(p => {
        p.classList.remove("active");
    });

    const page = document.getElementById(pageId);
    if (page) page.classList.add("active");
}

// ================= ASSIGNMENT MODAL =================
function openAddAssignment() {
    const modal = document.getElementById("addAssignmentModal");
    if (modal) modal.style.display = "flex";
}

function closeAddAssignment() {
    const modal = document.getElementById("addAssignmentModal");
    if (modal) modal.style.display = "none";
}

// ================= DEFAULT =================
document.addEventListener("DOMContentLoaded", () => {
    // Default page
    showPage("dashboard");
});


async function loadStudents(classId) {
  const tbody = document.querySelector("#studentsTable tbody");
  const btn = document.getElementById("saveAttendanceBtn");

  tbody.innerHTML = "";
  if (btn) btn.disabled = true;

  if (!classId) return;

  const res = await fetch(`/teacher/attendance/${classId}`);
  const students = await res.json();

  const todayRes = await fetch(`/teacher/attendance/${classId}/today`);
  const todayAttendance = await todayRes.json();

  students.forEach(student => {
    const statusToday = todayAttendance[student.id] || "";
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${student.first_name} ${student.last_name}</td>
      <td><input type="radio" name="attendance[${student.id}]" value="PRESENT" ${statusToday === "PRESENT" ? "checked" : ""} required></td>
      <td><input type="radio" name="attendance[${student.id}]" value="ABSENT" ${statusToday === "ABSENT" ? "checked" : ""} required></td>
    `;

    tbody.appendChild(tr);
  });

  if (btn) btn.disabled = students.length === 0;
}



function openUploadResource() {
    document.getElementById("uploadResourceModal").style.display = "flex";
}

function closeUploadResource() {
    document.getElementById("uploadResourceModal").style.display = "none";
}



async function loadGradebook() {
    const classId = gradeClassSelect.value;
    const subjectId = gradeSubjectSelect.value;
    const assignmentId = gradeAssignmentSelect.value;

    if (!classId || !subjectId || !assignmentId) {
        return alert("Select class, subject, and assignment");
    }


    const res = await fetch(`/teacher/gradebook/${classId}/${assignmentId}`);
    const students = await res.json();

    document.getElementById("assignment_id").value = assignmentId;
    document.getElementById("gradebookArea").style.display = "block";

    const tbody = document.getElementById("gradebookTable");
    tbody.innerHTML = "";

    students.forEach(s => {
        tbody.innerHTML += `
            <tr>
                <td>${s.student_name}</td>
                <td>
                    <input type="number" min="0" max="100"
                        data-student="${s.student_id}"
                        value="${s.score ?? ""}">
                </td>
                <td>
                    <input value="${s.grade ?? ""}">
                </td>
            </tr>
        `;
    });
}

const gradeClassSelect = document.getElementById("gradeClassSelect");
const gradeSubjectSelect = document.getElementById("gradeSubjectSelect");
const gradeAssignmentSelect = document.getElementById("gradeAssignmentSelect");


document.getElementById("gradebookForm")?.addEventListener("submit", async e => {
    e.preventDefault();

    const assignmentId = document.getElementById("assignment_id").value;
    const rows = document.querySelectorAll("#gradebookTable tr");

    const grades = [...rows].map(r => ({
        student_id: r.querySelector("input").dataset.student,
        score: r.querySelector("input").value,
        grade: r.querySelectorAll("input")[1].value
    }));

    const res = await fetch("/teacher/gradebook/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_id: assignmentId, grades })
    });

    if ((await res.json()).success) {
        alert("Grades saved successfully");
    }
});

async function loadResults() {
    const dateFrom = document.getElementById("filterDateFrom").value;
    const dateTo = document.getElementById("filterDateTo").value;
    const classId = document.getElementById("filterClass").value;
    const subjectId = document.getElementById("filterSubject").value;
    const form = document.getElementById("filterForm").value;

    const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        class_id: classId,
        subject_id: subjectId,
        form_level: form
    });

    const res = await fetch(`/teacher/results?${params.toString()}`);
    const data = await res.json();

    const table = document.getElementById("resultsTable");
    table.innerHTML = "";

    if (!data.length) {
        table.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;color:#777;">
                    No results found
                </td>
            </tr>
        `;
        return;
    }

    data.forEach(r => {
        table.innerHTML += `
            <tr>
                <td>${r.student_name}</td>
                <td>${r.assignment_title}</td>
                <td>${r.subject_name}</td>
                <td>${r.class_name}</td>
                <td>${r.score}</td>
                <td>${r.grade || "-"}</td>
                <td>${r.date}</td>
            </tr>
        `;
    });
}

async function loadTeacherNotices() {
    const container = document.getElementById("teacherNotices");
    if (!container) return; // ✅ PREVENT CRASH

    try {
        const res = await fetch("/teacher/notices");
        const notices = await res.json();

        if (!notices.length) {
            container.innerHTML = `
                <p style="color:#777;text-align:center;">
                    No notices available
                </p>
            `;
            return;
        }

        container.innerHTML = "";

        notices.forEach(n => {
            container.innerHTML += `
                <div class="notice-card">
                    <div class="notice-title">
                        ${n.title}
                        <span class="notice-category">${n.category}</span>
                    </div>
                    <div class="notice-message">
                        ${n.message}
                    </div>
                    <div class="notice-date">
                        ${new Date(n.created_at).toLocaleDateString()}
                    </div>
                </div>
            `;
        });

    } catch (err) {
        container.innerHTML = `
            <p style="color:red;text-align:center;">
                Failed to load notices
            </p>
        `;
    }
}


document.addEventListener("DOMContentLoaded", () => {
    loadTeacherNotices();
});

// Grab the dropdown elements
const classSelect = document.querySelector("select[name='class_id']");
const subjectSelect = document.getElementById("assignment_subject");

async function loadSubjects(classId) {
    // Reset subject dropdown
    subjectSelect.innerHTML = `<option value="">Select Subject</option>`;
    if (!classId) return;

    // Fetch subjects for this class
    const res = await fetch(`/teacher/classes/${classId}/subjects`);
    const subjects = await res.json();

    subjects.forEach(s => {
        const option = document.createElement("option");
        option.value = s.id;
        option.textContent = s.name;
        subjectSelect.appendChild(option);
    });
}

// Listen for class selection change
classSelect.addEventListener("change", () => {
    const classId = classSelect.value;
    loadSubjects(classId);
});

async function loadAssignmentSubjects(classId) {
    const res = await fetch(`/teacher/classes/${classId}/subjects`);
    const subjects = await res.json();

    const select = document.getElementById("assignment_subject");
    select.innerHTML = `<option value="">Select Subject</option>`;

    subjects.forEach(s => {
        select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
}

document.addEventListener("DOMContentLoaded", () => {

    const gradeClassSelect = document.getElementById("gradeClassSelect");
    const gradeSubjectSelect = document.getElementById("gradeSubjectSelect");
    const gradeAssignmentSelect = document.getElementById("gradeAssignmentSelect");

    if (!gradeClassSelect || !gradeSubjectSelect || !gradeAssignmentSelect) return;

    // CLASS → SUBJECT
    gradeClassSelect.addEventListener("change", async () => {
        const classId = gradeClassSelect.value;

        gradeSubjectSelect.innerHTML = `<option value="">Select Subject</option>`;
        gradeAssignmentSelect.innerHTML = `<option value="">Select Assignment</option>`;

        gradeSubjectSelect.disabled = true;
        gradeAssignmentSelect.disabled = true;

        if (!classId) return;

        const res = await fetch(`/teacher/classes/${classId}/subjects`);
        const subjects = await res.json();

        subjects.forEach(s => {
            gradeSubjectSelect.innerHTML +=
                `<option value="${s.id}">${s.name}</option>`;
        });

        gradeSubjectSelect.disabled = false;
    });

    // SUBJECT → ASSIGNMENT
    gradeSubjectSelect.addEventListener("change", async () => {
        const classId = gradeClassSelect.value;
        const subjectId = gradeSubjectSelect.value;

        gradeAssignmentSelect.innerHTML = `<option value="">Select Assignment</option>`;
        gradeAssignmentSelect.disabled = true;

        if (!classId || !subjectId) return;

        const res = await fetch(
            `/teacher/assignments/by-class/${classId}?subject_id=${subjectId}`
        );
        const assignments = await res.json();

        assignments.forEach(a => {
            gradeAssignmentSelect.innerHTML +=
                `<option value="${a.id}">${a.title}</option>`;
        });

        gradeAssignmentSelect.disabled = false;
    });
});

function openAddTimetable() {
    document.getElementById("addTimetableModal").style.display = "flex";
}

function closeAddTimetable() {
    document.getElementById("addTimetableModal").style.display = "none";
}
