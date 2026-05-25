"use strict";

import { authApi } from "../api/auth-api.js";
import { getToken, getRoleFromToken, saveAuthSession } from "../utils/auth.js";

const REDIRECT_DELAY_MS = 500;

// ─── Routing ──────────────────────────────────────────────────────────────────

const getRedirectPathByRole = (role) => {
	const normalizedRole = String(role || "").trim().toUpperCase();

	if (normalizedRole === "ADMIN" || normalizedRole === "MODERATOR") {
		return "reports.html";
	}

	return "feed.html";
};

// ─── Error message helper ─────────────────────────────────────────────────────

/**
 * Bóc tách message từ error object.
 * Ưu tiên error.data.message (trường message của backend JSON response).
 * @param {object} error
 * @param {string} fallback
 * @returns {string}
 */
const toMessage = (error, fallback) => {
	if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
		return error.data.message.trim();
	}

	if (typeof error?.message === "string" && error.message.trim().length > 0) {
		return error.message.trim();
	}

	return fallback;
};

// ─── UI helpers ───────────────────────────────────────────────────────────────

const showError = (el, message) => {
	if (!el) return;
	el.textContent = message;
	el.style.color = "";           // reset về màu CSS mặc định (đỏ từ class)
	el.classList.remove("is-hidden");
};

const hideError = (el) => {
	if (!el) return;
	el.textContent = "";
	el.classList.add("is-hidden");
	el.style.color = "";
};

const showSuccess = (el, message) => {
	if (!el) return;
	el.textContent = message;
	el.style.color = "#15803d";
	el.classList.remove("is-hidden");
};

const setSubmittingState = (button, isSubmitting) => {
	if (!button) return;
	button.disabled = isSubmitting;
	button.textContent = isSubmitting ? "Đang đăng nhập..." : "Đăng nhập";
};

// ─── Validation ───────────────────────────────────────────────────────────────

const validateLoginPayload = ({ username, password }) => {
	if (username.length === 0) {
		return "Vui lòng nhập tên đăng nhập.";
	}

	if (password.length === 0) {
		return "Vui lòng nhập mật khẩu.";
	}

	return "";
};

// ─── Init ─────────────────────────────────────────────────────────────────────

const initLoginPage = () => {
	const form = document.getElementById("login-form");
	if (!form) return;

	const usernameInput = document.getElementById("login-username");
	const passwordInput = document.getElementById("login-password");
	const submitButton  = document.getElementById("login-submit");
	const errorMsgEl    = document.getElementById("login-error-msg");

	if (!usernameInput || !passwordInput) return;

	// Redirect ngay nếu đã đăng nhập
	if (getToken().length > 0) {
		window.location.href = getRedirectPathByRole(getRoleFromToken());
		return;
	}

	// Ẩn thông báo lỗi khi người dùng bắt đầu gõ lại vào bất kỳ ô nào
	const clearErrorOnInput = () => hideError(errorMsgEl);
	usernameInput.addEventListener("input", clearErrorOnInput);
	passwordInput.addEventListener("input", clearErrorOnInput);

	// ── Submit handler ─────────────────────────────────────────────────────────
	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		hideError(errorMsgEl);

		const payload = {
			username: usernameInput.value.trim(),
			password: passwordInput.value.trim(),
		};

		// Validate phía client trước
		const validationMessage = validateLoginPayload(payload);
		if (validationMessage.length > 0) {
			showError(errorMsgEl, validationMessage);
			return;
		}

		setSubmittingState(submitButton, true);

		try {
			const response = await authApi.login(payload);
			const { token, userId, avtUrl, nickname } = response?.data ?? {};

			if (typeof token !== "string" || token.trim().length === 0) {
				throw new Error("Không nhận được token từ hệ thống.");
			}

			saveAuthSession(token, { userId, avtUrl, nickname });

			// Decode JWT ngay sau khi lưu để lấy role chính xác
			const userRole = getRoleFromToken();
			showSuccess(errorMsgEl, "Đăng nhập thành công. Đang chuyển trang...");

			window.setTimeout(() => {
				window.location.href = getRedirectPathByRole(userRole);
			}, REDIRECT_DELAY_MS);
		} catch (error) {
			// Mọi lỗi 4xx (401 sai mật khẩu, 403 bị khóa/ban, 404 không tìm thấy...) đều
			// xử lý như nhau: lấy message từ JSON backend và hiển thị inline màu đỏ.
			showError(errorMsgEl, toMessage(error, "Đăng nhập thất bại. Vui lòng thử lại."));
		} finally {
			setSubmittingState(submitButton, false);
		}
	});
};

document.addEventListener("DOMContentLoaded", initLoginPage);
