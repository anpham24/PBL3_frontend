"use strict";

import { userApi } from "../api/user-api.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initCreatePostModal } from "../components/create-post-modal.js";
import { initPostInteractions } from "../components/post-interactions.js";

const DEFAULT_AVATAR_URL =
	"https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=520&q=70";

const toMessage = (error, fallbackMessage) => {
	if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
		return error.data.message.trim();
	}

	if (typeof error?.message === "string" && error.message.trim().length > 0) {
		return error.message.trim();
	}

	return fallbackMessage;
};

const safeText = (value, fallback = "") => {
	if (typeof value !== "string") {
		return fallback;
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : fallback;
};

const safeCount = (value) => {
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}

	if (typeof value === "string") {
		const trimmedValue = value.trim();
		if (trimmedValue.length > 0) {
			return trimmedValue;
		}
	}

	return "0";
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
	feedbackElement.classList.add("is-hidden");
	feedbackElement.classList.remove("is-error", "is-success");
};

const getTargetUserIdFromQuery = () => {
	const query = new URLSearchParams(window.location.search);
	return safeText(query.get("id"));
};

// ---------------------------------------------------------------------------
// Loading skeleton helpers
// ---------------------------------------------------------------------------

/**
 * Danh sách các phần tử hồ sơ cần hiển thị trạng thái skeleton
 * trong khi chờ API phản hồi.
 */
const SKELETON_SELECTORS = [
	"#profile-avatar",
	"#profile-nickname",
	"#profile-bio",
	"#profile-posts-count",
	"#profile-followers-count",
	"#profile-following-count",
];

const showSkeleton = () => {
	SKELETON_SELECTORS.forEach((selector) => {
		const el = document.querySelector(selector);
		if (el) {
			el.classList.add("is-skeleton");
		}
	});
};

const hideSkeleton = () => {
	SKELETON_SELECTORS.forEach((selector) => {
		const el = document.querySelector(selector);
		if (el) {
			el.classList.remove("is-skeleton");
		}
	});
};

// ---------------------------------------------------------------------------
// Redirect helpers
// ---------------------------------------------------------------------------

const resolveLoginPath = () => {
	const currentPath = window.location.pathname.toLowerCase();
	return currentPath.includes("/pages/") ? "login.html" : "./pages/login.html";
};

const redirectToLogin = () => {
	window.location.href = resolveLoginPath();
};

// ---------------------------------------------------------------------------
// Error state helpers
// ---------------------------------------------------------------------------

/**
 * Ẩn toàn bộ nội dung hồ sơ và render khối lỗi ở giữa màn hình.
 * @param {string} message - Thông điệp lỗi hiển thị cho người dùng.
 */
const showErrorState = (message) => {
	// Ẩn toàn bộ container chứa thông tin hồ sơ + danh sách bài viết
	const profilePage = document.querySelector(".profile-page");
	if (profilePage) {
		profilePage.style.display = "none";
	}

	// Tạo khối error-state và chèn vào .main-inner
	const container = document.querySelector(".main-inner");
	const errorDiv = document.createElement("div");
	errorDiv.className = "error-state";
	errorDiv.innerHTML = `
		<span class="error-state__icon" aria-hidden="true">
			<i class="bx bx-user-x"></i>
		</span>
		<p class="error-state__title">Không tìm thấy người dùng</p>
	`;

	if (container) {
		container.appendChild(errorDiv);
	} else {
		document.body.appendChild(errorDiv);
	}
};

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

const renderProfile = (response) => {
	const user = response?.data?.user;

	if (!user) {
		throw new Error("Không tìm thấy thông tin người dùng.");
	}

	const avatarElement = document.getElementById("profile-avatar");
	const nicknameElement = document.getElementById("profile-nickname");
	const bioElement = document.getElementById("profile-bio");
	const postsCountElement = document.getElementById("profile-posts-count");
	const followersCountElement = document.getElementById("profile-followers-count");
	const followingCountElement = document.getElementById("profile-following-count");
	const followButton = document.getElementById("profile-follow-button");
	const linkElement = document.getElementById("profile-link");

	const nickname = safeText(user.nickname, "Người dùng");
	const avatar = safeText(user.avatar, DEFAULT_AVATAR_URL);
	const bio = safeText(user.bio, "Chưa cập nhật bio.");
	const website = safeText(user.website || user.link);

	if (avatarElement) {
		avatarElement.src = avatar;
		avatarElement.alt = `Avatar ${nickname}`;
	}

	if (nicknameElement) {
		nicknameElement.textContent = nickname;
	}

	if (bioElement) {
		bioElement.textContent = bio;
	}

	if (postsCountElement) {
		postsCountElement.textContent = safeCount(user.postsCount);
	}

	if (followersCountElement) {
		followersCountElement.textContent = safeCount(user.followersCount);
	}

	if (followingCountElement) {
		followingCountElement.textContent = safeCount(user.followingCount);
	}

	if (linkElement) {
		if (website.length > 0) {
			linkElement.textContent = website;
			linkElement.href = website;
			linkElement.classList.remove("is-hidden");
		} else {
			linkElement.textContent = "";
			linkElement.href = "#";
			linkElement.classList.add("is-hidden");
		}
	}

	if (followButton) {
		const viewingOtherProfile = getTargetUserIdFromQuery().length > 0;

		if (!viewingOtherProfile) {
			followButton.classList.add("is-hidden");
		} else {
			const isFollowing = Boolean(response?.data?.isFollowing);
			followButton.classList.remove("is-hidden");
			followButton.classList.toggle("is-following", isFollowing);
			followButton.textContent = isFollowing ? "Following" : "Follow";
			followButton.disabled = true;
		}
	}
};

// ---------------------------------------------------------------------------
// Core data-loading function
// ---------------------------------------------------------------------------

/**
 * Gọi API GET /api/users/me/profile và cập nhật DOM.
 *
 * Flow:
 * 1. Hiển thị skeleton loading trên các phần tử hồ sơ.
 * 2. Gọi userApi.getMyProfile() (hoặc getProfileById nếu có ?id=...).
 * 3. Nếu thành công → renderProfile() cập nhật toàn bộ DOM.
 * 4. Nếu HTTP 401 → token hết hạn, redirect về trang đăng nhập (xử lý bởi apiClient).
 * 5. Nếu HTTP 404 → hiển thị inline "Lỗi: Không tìm thấy người dùng.".
 * 6. Lỗi mạng / server → hiển thị thông báo lỗi inline qua #profile-feedback.
 * 7. Luôn ẩn skeleton trong khối finally.
 */
const loadProfileData = async () => {
	const feedbackElement = document.getElementById("profile-feedback");
	clearFeedback(feedbackElement);
	showSkeleton();

	try {
		const targetUserId = getTargetUserIdFromQuery();

		// Không có ?id → xem hồ sơ của chính mình (GET /api/users/me/profile)
		// Có ?id=xxx   → xem hồ sơ người khác
		const response =
			targetUserId.length > 0
				? await userApi.getProfileById(targetUserId)
				: await userApi.getMyProfile();

		renderProfile(response);
	} catch (error) {
		const httpStatus = Number(error?.status);

		if (httpStatus === 401) {
			// Token hết hạn hoặc không hợp lệ → chuyển về trang đăng nhập
			redirectToLogin();
			return;
		}

		if (httpStatus === 404) {
			// Không tìm thấy người dùng → ẩn khung profile, hiển thị error-state ở giữa màn hình
			showErrorState("Lỗi: Không tìm thấy người dùng.");
			return;
		}

		// Lỗi mạng hoặc lỗi server → hiển thị inline
		setFeedback(
			feedbackElement,
			toMessage(error, "Không thể tải thông tin hồ sơ."),
			"error"
		);
	} finally {
		// Luôn ẩn skeleton dù thành công hay thất bại
		hideSkeleton();
	}
};

// ---------------------------------------------------------------------------
// Page initializer — chạy sau khi DOM sẵn sàng
// ---------------------------------------------------------------------------

const initProfilePage = () => {
	initCreatePostModal();
	initCommentModal(".profile-grid .grid-item");
	initPostInteractions();
	loadProfileData();
};

document.addEventListener("DOMContentLoaded", initProfilePage);
