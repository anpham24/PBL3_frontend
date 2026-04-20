"use strict";

import { authApi } from "../api/auth-api.js";

const REDIRECT_DELAY_MS = 1200;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
	button.textContent = isSubmitting ? "Đang đăng ký..." : "Đăng ký";
};

const validateRegisterPayload = ({ username, password, nickname, email }) => {
	if (username.length < 3) {
		return "Tên đăng nhập phải có ít nhất 3 ký tự.";
	}

	if (password.length < 6) {
		return "Mật khẩu phải có ít nhất 6 ký tự.";
	}

	if (nickname.length === 0) {
		return "Vui lòng nhập nickname.";
	}

	if (!EMAIL_PATTERN.test(email)) {
		return "Email không hợp lệ.";
	}

	return "";
};

const initRegisterPage = () => {
	const form = document.getElementById("register-form");
	if (!form) {
		return;
	}

	const usernameInput = document.getElementById("register-username");
	const passwordInput = document.getElementById("register-password");
	const nicknameInput = document.getElementById("register-nickname");
	const emailInput = document.getElementById("register-email");
	const submitButton = document.getElementById("register-submit");
	const feedbackElement = document.getElementById("register-feedback");

	if (!usernameInput || !passwordInput || !nicknameInput || !emailInput) {
		return;
	}

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		clearFeedback(feedbackElement);

		const payload = {
			username: usernameInput.value.trim(),
			password: passwordInput.value.trim(),
			nickname: nicknameInput.value.trim(),
			email: emailInput.value.trim()
		};

		const validationMessage = validateRegisterPayload(payload);
		if (validationMessage.length > 0) {
			setFeedback(feedbackElement, validationMessage, "error");
			return;
		}

		setSubmittingState(submitButton, true);

		try {
			const response = await authApi.register(payload);
			const isSuccess = Number(response?.code) === 201;

			if (!isSuccess) {
				throw new Error("Đăng ký thất bại. Vui lòng thử lại.");
			}

			setFeedback(feedbackElement, "Đăng ký thành công. Đang chuyển sang trang đăng nhập...", "success");

			window.setTimeout(() => {
				window.location.href = "login.html";
			}, REDIRECT_DELAY_MS);
		} catch (error) {
			setFeedback(feedbackElement, toMessage(error, "Đăng ký thất bại. Vui lòng thử lại."), "error");
		} finally {
			setSubmittingState(submitButton, false);
		}
	});
};

document.addEventListener("DOMContentLoaded", initRegisterPage);
