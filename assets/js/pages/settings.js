"use strict";

import { initCreatePostModal } from "./create-post-modal.js";
import { initSettingsSubviews } from "./settings-subviews.js";
import { clearAuthStorage, getToken, saveAuthSession, getAvtUrl, updateAvatarSession } from "../utils/auth.js";

const DEFAULT_AVATAR_URL = "../assets/images/225-default-avatar.png";

const toMessage = (error, fallbackMessage) => {
	if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
		return error.data.message.trim();
	}

	if (typeof error?.message === "string" && error.message.trim().length > 0) {
		return error.message.trim();
	}

	return fallbackMessage;
};

const setFeedback = (feedbackElement, message, variant) => {
	if (!feedbackElement) {
		return;
	}

	feedbackElement.textContent = message;
	feedbackElement.classList.remove("is-hidden", "is-error", "is-success");
	feedbackElement.classList.add(variant === "error" ? "is-error" : "is-success");
};

const clearFeedback = (feedbackElement) => {
	if (!feedbackElement) {
		return;
	}

	feedbackElement.textContent = "";
	feedbackElement.classList.remove("is-error", "is-success");
	feedbackElement.classList.add("is-hidden");
};

const setSubmittingState = (button, isSubmitting, idleText, submittingText) => {
	if (!button) {
		return;
	}

	button.disabled = isSubmitting;
	button.textContent = isSubmitting ? submittingText : idleText;
};

const safeText = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	return value.trim();
};

const applyAvatarPreview = (avatarPreviewElement, avatarUrl) => {
	if (!avatarPreviewElement) {
		return;
	}

	const resolvedAvatarUrl = safeText(avatarUrl);
	avatarPreviewElement.src = resolvedAvatarUrl.length > 0 ? resolvedAvatarUrl : DEFAULT_AVATAR_URL;
};

const populateEditProfileForm = ({ nicknameInput, bioInput, avatarPreviewElement }, user) => {
	const avatar = safeText(user?.avtUrl);
	const nickname = safeText(user?.nickname);
	const bio = safeText(user?.bio);

	nicknameInput.value = nickname;
	bioInput.value = bio;
	applyAvatarPreview(avatarPreviewElement, avatar);

	return avatar;
};

const createProfileUpdateFormData = ({ nickname, bio, avatarFile }) => {
	const formData = new FormData();
	formData.append("nickname", nickname);
	formData.append("bio", bio);

	if (avatarFile instanceof File) {
		formData.append("file", avatarFile);
	}

	return formData;
};

const attachEditProfileHandler = () => {
	const form = document.getElementById("settings-edit-profile-form");
	if (!form) {
		return;
	}

	const avatarFileInput = document.getElementById("settings-avatar-file");
	const nicknameInput = document.getElementById("settings-nickname");
	const bioInput = document.getElementById("settings-bio");
	const avatarPreviewElement = document.getElementById("settings-avatar-preview");
	const avatarChangeButton = document.getElementById("settings-avatar-change");
	const submitButton = document.getElementById("settings-edit-submit");
	const feedbackElement = document.getElementById("settings-edit-feedback");

	if (!avatarFileInput || !nicknameInput || !bioInput || !avatarPreviewElement) {
		return;
	}

	let selectedAvatarFile = null;
	let previewObjectUrl = "";
	let currentAvatarUrl = DEFAULT_AVATAR_URL;

	const revokePreviewUrl = () => {
		if (previewObjectUrl.length > 0) {
			URL.revokeObjectURL(previewObjectUrl);
			previewObjectUrl = "";
		}
	};

	const openFilePicker = () => {
		avatarFileInput.click();
	};

	avatarChangeButton?.addEventListener("click", openFilePicker);
	avatarPreviewElement.addEventListener("click", openFilePicker);

	avatarFileInput.addEventListener("change", (event) => {
		const selectedFile = event.target.files?.[0] ?? null;
		if (!selectedFile) {
			selectedAvatarFile = null;
			revokePreviewUrl();
			applyAvatarPreview(avatarPreviewElement, currentAvatarUrl);
			return;
		}

		if (!selectedFile.type.startsWith("image/")) {
			setFeedback(feedbackElement, "Vui lòng chọn tệp hình ảnh hợp lệ.", "error");
			avatarFileInput.value = "";
			selectedAvatarFile = null;
			return;
		}

		clearFeedback(feedbackElement);
		selectedAvatarFile = selectedFile;

		revokePreviewUrl();
		previewObjectUrl = URL.createObjectURL(selectedFile);
		applyAvatarPreview(avatarPreviewElement, previewObjectUrl);
	});

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		clearFeedback(feedbackElement);

		const nickname = safeText(nicknameInput.value);
		const bio = safeText(bioInput.value);

		if (nickname.length === 0) {
			setFeedback(feedbackElement, "Vui lòng nhập nickname.", "error");
			return;
		}

		setSubmittingState(submitButton, true, "Lưu thay đổi", "Đang lưu...");

		try {
			const payload = {
				nickname,
				bio,
				avatarFile: selectedAvatarFile
			};

			const response = await userApi.updateMyProfile(createProfileUpdateFormData(payload));

			// ── 1. Lưu link ảnh mới vào session ngay nếu Backend có trả về ──
			if (response?.data?.avtUrl) {
				updateAvatarSession(response.data.avtUrl);
			}

			// ── 2. Cập nhật giao diện ngay lập tức ──────────────────────────	
			const responseAvatar =
				safeText(response?.data?.avtUrl) ||
				safeText(response?.data?.user?.avtUrl) ||
				(safeText(previewObjectUrl).length > 0 ? previewObjectUrl : currentAvatarUrl);

			// Dùng hàm có sẵn của bạn để đổi ảnh thay vì document.getElementById
			currentAvatarUrl = responseAvatar;
			applyAvatarPreview(avatarPreviewElement, currentAvatarUrl);

			selectedAvatarFile = null;
			avatarFileInput.value = "";
			setFeedback(feedbackElement, safeText(response?.message) || "Cập nhật thành công.", "success");

			// ── 3. Đồng bộ localStorage — gọi sau khi UI đã được cập nhật ──
			void syncLocalStorageProfile(nickname);

		} catch (error) {
			setFeedback(feedbackElement, toMessage(error, "Cập nhật hồ sơ thất bại."), "error");
		} finally {
			setSubmittingState(submitButton, false, "Lưu thay đổi", "Đang lưu...");
		}
	});

	const loadCurrentProfile = async () => {
		try {
			const response = await userApi.getMyProfile();
			const user = response?.data?.user;

			if (!user) {
				throw new Error("Không tìm thấy thông tin người dùng.");
			}

			currentAvatarUrl = populateEditProfileForm(
				{
					nicknameInput,
					bioInput,
					avatarPreviewElement
				},
				user
			);
		} catch (error) {
			setFeedback(feedbackElement, toMessage(error, "Không thể tải thông tin hồ sơ."), "error");
		}
	};

	/**
	 * Sau khi cập nhật profile thành công, gọi lại GET /api/users/me/profile
	 * để lấy dữ liệu chính xác từ server (bao gồm avtUrl mới sau upload),
	 * rồi đồng bộ vào localStorage.
	 * @param {string} nickname - Nickname mới (từ form, dùng fallback nếu server không trả)
	 */
	const syncLocalStorageProfile = async (nickname) => {
		try {
			const refreshed = await userApi.getMyProfile();
			const serverUser = refreshed?.data?.user;

			const resolvedNickname =
				safeText(serverUser?.nickname) || safeText(nickname) || "Người dùng";
			const resolvedAvtUrl = safeText(serverUser?.avtUrl) || "";

			// saveAuthSession giữ nguyên token hiện tại, chỉ cập nhật nickname và avtUrl
			const currentToken = getToken();
			saveAuthSession(currentToken, {
				nickname: resolvedNickname,
				avtUrl: resolvedAvtUrl,
			});
		} catch {
			// Không thể làm mới localStorage — không block luồng chính
			console.warn("[settings] Không thể đồng bộ localStorage sau khi cập nhật hồ sơ.");
		}
	};

	window.addEventListener("beforeunload", revokePreviewUrl);
	void loadCurrentProfile();
};

const attachChangePasswordHandler = () => {
	const form = document.getElementById("settings-change-password-form");
	if (!form) {
		return;
	}

	const oldPasswordInput = document.getElementById("settings-old-password");
	const newPasswordInput = document.getElementById("settings-new-password");
	const confirmPasswordInput = document.getElementById("settings-confirm-password");
	const submitButton = document.getElementById("settings-password-submit");
	const feedbackElement = document.getElementById("settings-password-feedback");

	if (!oldPasswordInput || !newPasswordInput || !confirmPasswordInput) {
		return;
	}

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		clearFeedback(feedbackElement);

		const oldPassword = oldPasswordInput.value;
		const newPassword = newPasswordInput.value;
		const confirmPassword = confirmPasswordInput.value;

		if (oldPassword.length === 0 || newPassword.length === 0 || confirmPassword.length === 0) {
			setFeedback(feedbackElement, "Vui lòng điền đầy đủ thông tin mật khẩu.", "error");
			return;
		}

		if (newPassword !== confirmPassword) {
			setFeedback(feedbackElement, "Xác nhận mật khẩu mới không khớp.", "error");
			return;
		}

		setSubmittingState(submitButton, true, "Cập nhật mật khẩu", "Đang cập nhật...");

		try {
			const response = await userApi.changePassword(oldPassword, newPassword);

			form.reset();
			setFeedback(feedbackElement, safeText(response?.message) || "Đổi mật khẩu thành công.", "success");
		} catch (error) {
			setFeedback(feedbackElement, toMessage(error, "Đổi mật khẩu thất bại."), "error");
		} finally {
			setSubmittingState(submitButton, false, "Cập nhật mật khẩu", "Đang cập nhật...");
		}
	});
};

const attachLogoutHandler = () => {
	const logoutButton = document.querySelector(".settings-item[data-action='logout']");
	if (!logoutButton) {
		return;
	}

	logoutButton.addEventListener("click", async () => {
		if (logoutButton.dataset.loading === "true") return;
		logoutButton.dataset.loading = "true";

		try {
			await authApi.logout();
		} catch (error) {
			console.warn("Lỗi khi gọi API đăng xuất, vẫn tiến hành xóa session ở frontend:", error);
		} finally {
			clearAuthStorage();
			window.location.href = "login.html";
		}
	});
};

const initSettingsPage = () => {
	initCreatePostModal();
	initSettingsSubviews();
	attachEditProfileHandler();
	attachChangePasswordHandler();
	attachLogoutHandler();
	const currentAvt = getAvtUrl();
	const previewImg = document.getElementById("settings-avatar-preview");
	if (previewImg && currentAvt) {
		previewImg.src = currentAvt;
	}
};

document.addEventListener("DOMContentLoaded", initSettingsPage);
