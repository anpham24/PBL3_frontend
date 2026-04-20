"use strict";

import { authApi } from "../api/auth-api.js";
import { getToken, getUserRole, saveAuthSession } from "../utils/auth.js";

const REDIRECT_DELAY_MS = 500;

const getRedirectPathByRole = (role) => {
	const normalizedRole = String(role || "").trim().toUpperCase();

	if (normalizedRole === "ADMIN" || normalizedRole === "MODERATOR") {
		return "reports.html";
	}

	return "feed.html";
};

const setFeedback = (feedbackElement, message, variant) => {
	if (!feedbackElement) {
		return;
	}

	feedbackElement.textContent = message;
	feedbackElement.classList.remove("is-hidden");
	feedbackElement.style.color = variant === "error" ? "#dc2626" : "#15803d";
};

const clearFeedback = (feedbackElement) => {
	if (!feedbackElement) {
		return;
	}

	feedbackElement.textContent = "";
	feedbackElement.classList.add("is-hidden");
	feedbackElement.style.color = "";
};

const toMessage = (error, fallbackMessage) => {
	if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
		return error.data.message.trim();
	}

	if (typeof error?.message === "string" && error.message.trim().length > 0) {
		return error.message.trim();
	}

	return fallbackMessage;
};

const setSubmittingState = (button, isSubmitting) => {
	if (!button) {
		return;
	}

	button.disabled = isSubmitting;
	button.textContent = isSubmitting ? "Đang đăng nhập..." : "Đăng nhập";
};

const validateLoginPayload = ({ username, password }) => {
	if (username.length === 0) {
		return "Vui lòng nhập tên đăng nhập.";
	}

	if (password.length === 0) {
		return "Vui lòng nhập mật khẩu.";
	}

	return "";
};

const initLoginPage = () => {
	const form = document.getElementById("login-form");
	if (!form) {
		return;
	}

	const usernameInput = document.getElementById("login-username");
	const passwordInput = document.getElementById("login-password");
	const submitButton = document.getElementById("login-submit");
	const feedbackElement = document.getElementById("login-feedback");

	if (!usernameInput || !passwordInput) {
		return;
	}

	if (getToken().length > 0) {
		window.location.href = getRedirectPathByRole(getUserRole());
		return;
	}

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		clearFeedback(feedbackElement);

		const payload = {
			username: usernameInput.value.trim(),
			password: passwordInput.value.trim()
		};

		const validationMessage = validateLoginPayload(payload);
		if (validationMessage.length > 0) {
			setFeedback(feedbackElement, validationMessage, "error");
			return;
		}

		setSubmittingState(submitButton, true);

		try {
			const response = await authApi.login(payload);
			const token = response?.data?.token;
			const userId = response?.data?.userId;
			const role = response?.data?.role;

			if (typeof token !== "string" || token.trim().length === 0) {
				throw new Error("Không nhận được token từ hệ thống.");
			}

			saveAuthSession({ token, userId, role });
			setFeedback(feedbackElement, "Đăng nhập thành công. Đang chuyển trang...", "success");

			window.setTimeout(() => {
				window.location.href = getRedirectPathByRole(role);
			}, REDIRECT_DELAY_MS);
		} catch (error) {
			setFeedback(feedbackElement, toMessage(error, "Đăng nhập thất bại. Vui lòng thử lại."), "error");
		} finally {
			setSubmittingState(submitButton, false);
		}
	});
};

document.addEventListener("DOMContentLoaded", initLoginPage);
