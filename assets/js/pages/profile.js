"use strict";

import { userApi } from "../api/user-api.js";
import { postApi } from "../api/post-api.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initCreatePostModal } from "../components/create-post-modal.js";
import { initPostInteractions } from "../components/post-interactions.js";
import { getUserId } from "../utils/auth.js";

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

/**
 * @param {object} response - Response từ API getMyProfile() hoặc getProfileById().
 * @param {boolean} isOwnProfile - true nếu đang xem hồ sơ của chính mình.
 */
const renderProfile = (response, isOwnProfile = true) => {
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
	const avatar = safeText(user.avtUrl, DEFAULT_AVATAR_URL);
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
		// Dùng cờ từ backend để chốt chính xác đây có phải profile của mình không
		const isOwnProfile = getTargetUserIdFromQuery().length === 0 || response?.data?.isOwnProfile === true;
		
		const myProfileNavItem = document.querySelector('.side-nav .nav-item[href="profile.html"]');

		if (isOwnProfile) {
			// TRANG CỦA MÌNH: Ẩn nút follow, Bật sáng tab menu
			followButton.classList.add("is-hidden");
			
			if (myProfileNavItem) {
				myProfileNavItem.classList.add('active');
			}
		} else {
			// TRANG NGƯỜI KHÁC: Hiện nút follow, Tắt sáng tab menu
			const isFollowing = Boolean(response?.data?.isFollowing);
			followButton.classList.remove("is-hidden");
			followButton.classList.toggle("is-following", isFollowing);
			followButton.textContent = isFollowing ? "Following" : "Follow";
			followButton.disabled = false;
			document.title = `${nickname} | DUTraveler`;

			if (myProfileNavItem) {
				myProfileNavItem.classList.remove('active');
			}
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
/**
 * @param {boolean} isOwnProfile - true nếu đang xem hồ sơ của chính mình.
 * @param {string} resolvedTargetId - userId cần xem. Rỗng nếu là chính mình.
 */
const loadProfileData = async (isOwnProfile = true, resolvedTargetId = "") => {
	const feedbackElement = document.getElementById("profile-feedback");
	clearFeedback(feedbackElement);
	showSkeleton();

	try {
		// Không có targetId → xem hồ sơ của chính mình (GET /api/users/me/profile)
		// Có targetId       → xem hồ sơ người khác  (GET /api/users/{id}/profile)
		const response = isOwnProfile
			? await userApi.getMyProfile()
			: await userApi.getProfileById(resolvedTargetId);

		renderProfile(response, isOwnProfile);
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
// Post grid — state & rendering
// ---------------------------------------------------------------------------

/** Cursor-based pagination state cho danh sách bài viết */
let currentLastId = null;
let isLoadingPosts = false;
let hasMorePosts = true;

/** Controller trả về từ initCommentModal() — dùng để mở modal */
let commentModalController = null;

/**
 * Mảng các bài viết đã tải — duy trì in-memory để tra cứu khi click vào grid item.
 * Tương tự feedState.posts trong feed.js.
 */
const cachedPosts = [];

/** IntersectionObserver theo dõi sentinel element ở cuối lưới ảnh */
let postsObserver = null;

/**
 * Tạo phần tử <a class="grid-item"> từ dữ liệu một bài viết.
 * - Nếu media đầu tiên là IMAGE → dùng mediaUrl.
 * - Nếu media đầu tiên là VIDEO → dùng thumbnailUrl + icon Play.
 * @param {object} post - Dữ liệu bài viết từ API.
 * @returns {HTMLElement}
 */
const createGridItem = (post) => {
	const firstMedia = Array.isArray(post.mediaList) ? post.mediaList[0] : null;

	const item = document.createElement("a");
	item.className = "grid-item";
	item.href = "#";
	item.setAttribute("aria-label", `Bài đăng của ${post.authorName || ""}`);
	item.dataset.postId = post.id ?? "";
	if (post.authorId) {
		item.dataset.authorId = post.authorId;
	}

	if (firstMedia) {
		const isVideo = firstMedia.mediaType === "VIDEO";
		const imgSrc = isVideo
			? (firstMedia.thumbnailUrl || "")
			: (firstMedia.mediaUrl || "");

		const img = document.createElement("img");
		img.src = imgSrc;
		img.alt = "";
		img.loading = "lazy";
		item.appendChild(img);

		if (isVideo) {
			item.classList.add("grid-item--video");
			const playIcon = document.createElement("span");
			playIcon.className = "grid-item__play-icon";
			playIcon.setAttribute("aria-hidden", "true");
			playIcon.innerHTML = `<i class="bx bx-play-circle"></i>`;
			item.appendChild(playIcon);
		}
	} else {
		// Bài viết không có media → hiển thị placeholder
		const placeholder = document.createElement("div");
		placeholder.className = "grid-item__placeholder";
		placeholder.innerHTML = `<i class="bx bx-image-alt"></i>`;
		item.appendChild(placeholder);
	}

	return item;
};

/**
 * Render thêm các bài viết mới vào lưới ảnh.
 * Đồng thời lưu bài vào cachedPosts[] để dùng khi mở modal.
 * @param {object[]} posts - Mảng bài viết từ API.
 */
const renderPostGrid = (posts) => {
	const grid = document.querySelector(".profile-grid");
	if (!grid) {
		return;
	}

	const sentinel = document.getElementById("posts-sentinel");

	posts.forEach((post) => {
		cachedPosts.push(post);

		const item = createGridItem(post);
		// Chèn trước sentinel (nếu đã có), để sentinel luôn ở cuối
		if (sentinel) {
			grid.insertBefore(item, sentinel);
		} else {
			grid.appendChild(item);
		}
	});
};

/**
 * Render dòng "Đã tải hết bài đăng" và gỡ observer.
 */
const showEndOfFeedMessage = () => {
	const grid = document.querySelector(".profile-grid");
	if (!grid) {
		return;
	}

	// Xóa sentinel khỏi DOM
	const sentinel = document.getElementById("posts-sentinel");
	if (sentinel) {
		sentinel.remove();
	}

	// Dừng observer
	if (postsObserver) {
		postsObserver.disconnect();
		postsObserver = null;
	}

	// Chỉ render thông báo nếu chưa có
	if (!document.getElementById("posts-end-message")) {
		const msg = document.createElement("p");
		msg.id = "posts-end-message";
		msg.className = "posts-end-message";
		msg.textContent = "Bạn đã xem hết bài đăng.";
		grid.after(msg);
	}
};

/**
 * GỌi API getMyPosts() và render kết quả vào lưới.
 * An toàn khi gọi nhiều lần — guard bằng isLoadingPosts / hasMorePosts.
 */
/**
 * Gọi API lấy bài viết phù hợp với ngữ cảnh hiện tại:
 * - Chính mình  → postApi.getMyPosts()
 * - Người khác  → userApi.getPostsByUserId(targetUserId)
 * @param {string} targetUserId - ID người dùng cần xem. Rỗng = chính mình.
 */
const loadPosts = async (targetUserId = "") => {
	if (isLoadingPosts || !hasMorePosts) {
		return;
	}

	isLoadingPosts = true;

	try {
		const targetUserId = getTargetUserIdFromQuery();
		let response;

		if (targetUserId.length > 0) {
			response = await postApi.getUserPosts(targetUserId, currentLastId);
		} else {
			response = await postApi.getMyPosts(currentLastId);
		}

		const data = response?.data;
		const posts = Array.isArray(data?.postList) ? data.postList : [];

		if (posts.length > 0) {
			renderPostGrid(posts);
		}

		currentLastId = data?.respLastPostId ?? currentLastId;
		hasMorePosts = data?.hasMore === true;

		if (!hasMorePosts) {
			showEndOfFeedMessage();
		}
	} catch (error) {
		console.error("[profile] Lỗi khi tải danh sách bài viết:", error);
	} finally {
		isLoadingPosts = false;
	}
};

/**
 * Khởi tạo IntersectionObserver theo dõi sentinel element.
 * Khi sentinel xuất hiện trong viewport, gọi loadPosts() với targetUserId phù hợp.
 * @param {string} targetUserId - ID người dùng cần xem. Rỗng = chính mình.
 */
const initPostsInfiniteScroll = (targetUserId = "") => {
	const grid = document.querySelector(".profile-grid");
	if (!grid) {
		return;
	}

	// Xóa các grid-item cứ (mock HTML) trước khi API render
	grid.innerHTML = "";

	// Tạo sentinel element ở cuối lưới
	const sentinel = document.createElement("div");
	sentinel.id = "posts-sentinel";
	sentinel.style.cssText = "height:1px;width:100%;grid-column:1/-1;";
	grid.appendChild(sentinel);

	postsObserver = new IntersectionObserver(
		(entries) => {
			if (entries[0].isIntersecting) {
				loadPosts(targetUserId);
			}
		},
		{ rootMargin: "200px" }  // Bắt đầu tải trước khi còn cách 200px
	);

	postsObserver.observe(sentinel);
};

// ---------------------------------------------------------------------------
// Grid click handler — mở Comment Modal khi click vào bài viết
// ---------------------------------------------------------------------------

/**
 * Gắn Event Delegation lên .profile-grid.
 * Khi người dùng click vào một grid-item, tìm bài viết tương ứng
 * trong cachedPosts[] theo data-post-id, rồi mở comment modal.
 */
const initGridClickHandler = () => {
	const grid = document.querySelector(".profile-grid");
	if (!grid) {
		return;
	}

	grid.addEventListener("click", (event) => {
		event.preventDefault();

		const gridItem = event.target.closest(".grid-item");
		if (!gridItem) {
			return;
		}

		const postId = safeText(gridItem.dataset.postId);
		if (postId.length === 0) {
			return;
		}

		const post = cachedPosts.find((p) => safeText(p?.id) === postId);
		if (!post || !commentModalController) {
			return;
		}

		commentModalController.open(post);
	});
};

const initFollowHandler = () => {
	const followBtn = document.getElementById("profile-follow-button");
	if (!followBtn) return;

	followBtn.addEventListener("click", async () => {
		const targetUserId = getTargetUserIdFromQuery();
		if (!targetUserId) return;

		const isFollowing = followBtn.classList.contains("is-following");
		followBtn.disabled = true; // Khóa tạm nút để tránh click liên tục

		try {
			if (isFollowing) {
				await userApi.unfollowUser(targetUserId);
				followBtn.classList.remove("is-following");
				followBtn.textContent = "Follow";
			} else {
				await userApi.followUser(targetUserId);
				followBtn.classList.add("is-following");
				followBtn.textContent = "Following";
			}

			// Optional: Có thể tăng/giảm followersCount trên UI ngay lập tức ở đây nếu muốn hoàn hảo hơn
			const followersCountEl = document.getElementById("profile-followers-count");
			if (followersCountEl) {
				let currentCount = parseInt(followersCountEl.textContent, 10);
				if (!isNaN(currentCount)) {
					followersCountEl.textContent = isFollowing ? currentCount - 1 : currentCount + 1;
				}
			}

		} catch (error) {
			alert("Có lỗi xảy ra: " + toMessage(error, "Vui lòng thử lại"));
		} finally {
			followBtn.disabled = false;
		}
	});
};

// ---------------------------------------------------------------------------
// Page initializer — chạy sau khi DOM sẵn sàng
// ---------------------------------------------------------------------------

/**
 * Quyết định nav item nào trong sidebar được active.
 * - Xem profile của chính mình (?id không có) → "Trang cá nhân" sáng.
 * - Xem profile người khác (?id=xxx)          → không có nav nào sáng.
 */
const initSidebarActiveState = () => {
	const profileNavItem = document.getElementById("nav-profile");
	if (!profileNavItem) return;

	const viewingOtherProfile = getTargetUserIdFromQuery().length > 0;
	if (viewingOtherProfile) {
		profileNavItem.classList.remove("active");
	} else {
		profileNavItem.classList.add("active");
	}
};

const initProfilePage = () => {
	// ── Xác định ngữ cảnh: xem hồ sơ của ai? ──────────────────────────────
	const targetUserId = getTargetUserIdFromQuery(); // ?id=xxx hoặc ""
	const currentUserId = getUserId();               // từ localStorage

	// Nếu ?id trỏ về chính mình → xử lý như "chính mình" để tránh gọi API thừa
	const isOwnProfile = targetUserId.length === 0 || targetUserId === currentUserId;
	const resolvedTargetId = isOwnProfile ? "" : targetUserId;

	// ── Hiển thị / ẩn nút hành động ────────────────────────────────────────
	const followButton = document.getElementById("profile-follow-button");

	if (followButton) {
		// Nút Follow chỉ hiện khi xem hồ sơ người khác; trạng thái thực sẽ
		// được cập nhật trong renderProfile() sau khi API trả về isFollowing.
		followButton.classList.toggle("is-hidden", isOwnProfile);
	}

	// ── Khởi tạo các component ──────────────────────────────────────────────
	const createPostModalController = isOwnProfile ? initCreatePostModal() : null;
	commentModalController = initCommentModal({
		onEditRequest: isOwnProfile
			? (post) => {
				if (createPostModalController) {
					createPostModalController.openEdit(post);
				}
			}
			: null
	});
	initPostInteractions();
	loadProfileData(isOwnProfile, resolvedTargetId);
	initPostsInfiniteScroll(resolvedTargetId);
	initGridClickHandler();

	// Chuyển hướng đến trang hồ sơ khi click vào avatar/nickname có class .open-profile-link
	// (dành cho các element được inject động bởi comment-modal, v.v.)
	document.addEventListener("click", (event) => {
		const link = event.target.closest(".open-profile-link");
		if (!link) return;

		const userId = safeText(link.dataset.userId);
		if (userId.length === 0) return;

		if (event.defaultPrevented) return;

		event.preventDefault();
		window.location.href = `profile.html?id=${encodeURIComponent(userId)}`;
	});
};

document.addEventListener("DOMContentLoaded", initProfilePage);