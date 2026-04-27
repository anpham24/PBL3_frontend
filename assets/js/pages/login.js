"use strict";

import { authApi } from "../api/auth-api.js";
import { getToken, getUserRole, saveAuthSession } from "../utils/auth.js";

const REDIRECT_DELAY_MS = 500;
const ACCOUNT_LOCKED_STATUSES = new Set([403, 423, 429]);

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

const normalizeSearchText = (value) =>
	String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();

const containsLockKeyword = (value) => {
	const normalizedValue = normalizeSearchText(value);
	return (
		normalizedValue.includes("khoa") ||
		normalizedValue.includes("lock") ||
		normalizedValue.includes("blocked")
	);
};

const resolveFirstText = (...values) => {
	for (const value of values) {
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}

	return "";
};

const isAccountLockedError = (error) => {
	if (ACCOUNT_LOCKED_STATUSES.has(Number(error?.status))) {
		return true;
	}

	if (containsLockKeyword(error?.data?.code) || containsLockKeyword(error?.data?.message)) {
		return true;
	}

	return containsLockKeyword(error?.message);
};

const extractAccountLockDetails = (error) => {
	const payload = error?.data || {};

	const message =
		resolveFirstText(payload.message, error?.message) ||
		"Tài khoản của bạn đang bị khóa. Vui lòng thử lại sau.";

	const unlockTime =
		resolveFirstText(payload.unlock_time, payload.unlockAt, payload.unblock_at, payload.blocked_until) ||
		"Chưa có thông tin";

	const reason =
		resolveFirstText(payload.reason, payload.lock_reason, payload.block_reason, payload.description) ||
		"Chưa có thông tin";

	const remainingViolationsRaw = payload.remaining_violations ?? payload.remainingAttempts ?? payload.violation_left;
	const remainingViolations =
		typeof remainingViolationsRaw === "number" || typeof remainingViolationsRaw === "string"
			? String(remainingViolationsRaw)
			: "Chưa có thông tin";

	return {
		message,
		unlockTime,
		reason,
		remainingViolations
	};
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
	const accountLockModal = document.getElementById("account-locked-modal");
	const accountLockMessage = document.getElementById("account-lock-message");
	const accountLockUntil = document.getElementById("account-lock-until");
	const accountLockReason = document.getElementById("account-lock-reason");
	const accountLockRemaining = document.getElementById("account-lock-remaining");
	const accountLockCloseButton = document.getElementById("account-lock-close");

	if (!usernameInput || !passwordInput) {
		return;
	}

	const closeAccountLockModal = () => {
		if (!accountLockModal) {
			return;
		}

		accountLockModal.classList.add("is-hidden");
		accountLockModal.setAttribute("aria-hidden", "true");
		document.body.style.overflow = "";
	};

	const openAccountLockModal = ({ message, unlockTime, reason, remainingViolations }) => {
		if (!accountLockModal) {
			return;
		}

		if (accountLockMessage) {
			accountLockMessage.textContent = message;
		}

		if (accountLockUntil) {
			accountLockUntil.textContent = unlockTime;
		}

		if (accountLockReason) {
			accountLockReason.textContent = reason;
		}

		if (accountLockRemaining) {
			accountLockRemaining.textContent = remainingViolations;
		}

		accountLockModal.classList.remove("is-hidden");
		accountLockModal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";
	};

	accountLockCloseButton?.addEventListener("click", closeAccountLockModal);
	accountLockModal?.addEventListener("click", (event) => {
		if (event.target === accountLockModal) {
			closeAccountLockModal();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeAccountLockModal();
		}
	});

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
			if (isAccountLockedError(error)) {
				const lockDetails = extractAccountLockDetails(error);
				setFeedback(feedbackElement, lockDetails.message, "error");
				openAccountLockModal(lockDetails);
				return;
			}

			setFeedback(feedbackElement, toMessage(error, "Đăng nhập thất bại. Vui lòng thử lại."), "error");
		} finally {
			setSubmittingState(submitButton, false);
		}
	});
};

document.addEventListener("DOMContentLoaded", initLoginPage);
