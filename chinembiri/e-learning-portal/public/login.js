/* =========================================================
   LOGIN PAGE ONLY
   Save as: public/login.js

   IMPORTANT:
   views/views.ejs must load this file:
   <script src="/login.js?v=1"></script>

   views/views.ejs must NOT load:
   <script src="/script.js?v=2"></script>
========================================================= */

(function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  function value(id) {
    const node = el(id);
    return node ? String(node.value || "").trim() : "";
  }

  function showMessage(type, text) {
    const box = el("authMessage");

    if (!box) {
      alert(text);
      return;
    }

    box.className = "auth-message show " + (type || "info");
    box.style.color = "";
    box.innerText = text || "";
  }

  function clearMessage() {
    const box = el("authMessage");
    if (!box) return;

    box.className = "auth-message";
    box.style.color = "";
    box.innerText = "";
  }

  function setLoading(form, loading, loadingText) {
    if (!form) return;

    const btn = form.querySelector("button[type='submit']");
    if (!btn) return;

    if (!btn.dataset.originalText) {
      btn.dataset.originalText = btn.innerText;
    }

    btn.disabled = Boolean(loading);
    btn.innerText = loading ? (loadingText || "Please wait...") : btn.dataset.originalText;
  }

  async function parseResponse(res) {
    const raw = await res.text();

    try {
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {
        success: false,
        message: raw
          ? raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
          : "Server returned an invalid response."
      };
    }
  }

  function setActiveTab(mode) {
    const tabs = document.querySelectorAll(".auth-tab-btn");

    tabs.forEach((btn) => btn.classList.remove("active"));

    if (mode === "login" && tabs[0]) tabs[0].classList.add("active");
    if (mode === "register" && tabs[1]) tabs[1].classList.add("active");
  }

  window.showLogin = function () {
    clearMessage();

    if (el("loginForm")) el("loginForm").style.display = "flex";
    if (el("registerForm")) el("registerForm").style.display = "none";
    if (el("resetForm")) el("resetForm").style.display = "none";

    setActiveTab("login");
  };

  window.showRegister = function () {
    clearMessage();

    if (el("loginForm")) el("loginForm").style.display = "none";
    if (el("registerForm")) el("registerForm").style.display = "flex";
    if (el("resetForm")) el("resetForm").style.display = "none";

    setActiveTab("register");
  };

  window.showReset = function () {
    clearMessage();

    if (el("loginForm")) el("loginForm").style.display = "none";
    if (el("registerForm")) el("registerForm").style.display = "none";
    if (el("resetForm")) el("resetForm").style.display = "flex";

    setActiveTab("");
  };

  function redirectAfterLogin(role, data) {
    if (data && data.redirect) {
      window.location.href = data.redirect;
      return;
    }

    if (role === "admin") {
      window.location.href = "/admin";
    } else if (role === "teacher") {
      window.location.href = "/teacher";
    } else {
      window.location.href = "/student";
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    const loginForm = el("loginForm");
    const registerForm = el("registerForm");
    const resetForm = el("resetForm");

    const toggleLoginPassword = el("toggleLoginPassword");
    const loginPassword = el("loginPassword");

    if (toggleLoginPassword && loginPassword) {
      toggleLoginPassword.addEventListener("change", function () {
        loginPassword.type = toggleLoginPassword.checked ? "text" : "password";
      });
    }

    const registerRole = el("registerRole");
    if (registerRole) {
      registerRole.addEventListener("change", function () {
        const uniqueId = el("regUniqueId");
        if (!uniqueId) return;

        uniqueId.placeholder =
          registerRole.value === "teacher"
            ? "Teacher ID / EC Number"
            : "Student Registration Number";
      });
    }

    if (loginForm) {
      loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearMessage();

        const role = value("loginRole");
        const username = value("loginUsername");
        const password = value("loginPassword");

        if (!role || !username || !password) {
          showMessage("error", "Please enter role, username and password.");
          return;
        }

        setLoading(loginForm, true, "Checking login...");

        try {
          const loginEndpoint = loginForm.dataset.loginEndpoint || "/login";
          const res = await fetch(loginEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, username, password })
          });

          const data = await parseResponse(res);

          if (!res.ok || data.success === false || data.error) {
            showMessage("error", data.message || data.error || "Invalid username, password or role.");
            return;
          }

          showMessage("success", data.message || "Login successful. Redirecting...");

          setTimeout(function () {
            redirectAfterLogin(role, data);
          }, 700);

        } catch (err) {
          console.error("Login error:", err);
          showMessage("error", "Could not connect to the server. Please try again.");
        } finally {
          setLoading(loginForm, false);
        }
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearMessage();

        const role = value("registerRole");
        const firstName = value("regFirstName");
        const lastName = value("regLastName");
        const uniqueId = value("regUniqueId").toUpperCase();
        const password = value("regPassword");

        if (!role || !firstName || !lastName || !uniqueId || !password) {
          showMessage("error", "Please complete all activation fields.");
          return;
        }

        if (password.length < 4) {
          showMessage("error", "Password is too short. Use at least 4 characters.");
          return;
        }

        setLoading(registerForm, true, "Activating account...");

        try {
          const res = await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role,

              // camelCase for newer backend
              firstName,
              lastName,
              uniqueId,

              // snake_case for older backend
              first_name: firstName,
              last_name: lastName,
              unique_id: uniqueId,

              password
            })
          });

          const data = await parseResponse(res);

          if (!res.ok || data.success === false || data.error) {
            showMessage("error", data.message || data.error || "Account activation failed. Please check your details.");
            return;
          }

          showMessage("success", data.message || "Account activated successfully. You may now login.");
          registerForm.reset();

          setTimeout(function () {
            window.showLogin();
            showMessage("success", "Account activated successfully. Please login now.");
          }, 800);

        } catch (err) {
          console.error("Registration error:", err);
          showMessage("error", "Could not activate account. Please try again.");
        } finally {
          setLoading(registerForm, false);
        }
      });
    }

    if (resetForm) {
      resetForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearMessage();

        const role = value("resetRole");
        const fullName = value("resetFullName");
        const uniqueId = value("resetUniqueId").toUpperCase();
        const newPassword = value("resetNewPassword");

        if (!role || !fullName || !uniqueId || !newPassword) {
          showMessage("error", "Please complete all reset password fields.");
          return;
        }

        setLoading(resetForm, true, "Resetting password...");

        try {
          const res = await fetch("/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role, fullName, uniqueId, newPassword })
          });

          const data = await parseResponse(res);

          if (!res.ok || data.success === false || data.error) {
            showMessage("error", data.message || data.error || "Password reset failed. Please check your details.");
            return;
          }

          showMessage("success", data.message || "Password reset successfully. Please login.");
          resetForm.reset();

          setTimeout(function () {
            window.showLogin();
            showMessage("success", "Password reset successfully. Please login now.");
          }, 800);

        } catch (err) {
          console.error("Reset password error:", err);
          showMessage("error", "Could not reset password. Please try again.");
        } finally {
          setLoading(resetForm, false);
        }
      });
    }

    window.showLogin();
  });
})();
