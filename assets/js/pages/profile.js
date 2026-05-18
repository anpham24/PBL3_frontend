/**
 * @file profile.js
 * @module pages/profile
 *
 * Trang hồ sơ cá nhân — kiến trúc đồng nhất với feed.js / search.js:
 *
 *  ── Lưới ảnh (Post Grid) ────────────────────────────────────────────────────
 *  - Mỗi ô lưới chỉ hiển thị thumbnail/ảnh đại diện bài viết.
 *  - Click vào một ô → mở comment-modal với đầy đủ dữ liệu bài đó.
 *
 *  ── Modal & tương tác ───────────────────────────────────────────────────────
 *  - comment-modal.js inject + quản lý UI bình luận.
 *  - initPostInteractions() xử lý toàn bộ sự kiện trong modal (Like, Edit, Delete, Report)
 *    qua Event Delegation toàn cục. Các nút này hoạt động ngay cả khi được
 *    render động bởi comment-modal.
 *  - getPostData callback được truyền vào initPostInteractions() để nó luôn
 *    tìm được post object chính xác từ cachedPosts[].
 *
 *  ── Dữ liệu ─────────────────────────────────────────────────────────────────
 *  - cachedPosts[]: mảng in-memory tất cả bài đăng đã tải — nguồn sự thật duy nhất.
 *  - Được cập nhật khi like toggle (postLikeUpdated) để comment-modal
 *    luôn nhận state mới nhất.
 *  - Được dọn khi bài bị xóa (postDeleted).
 */

"use strict";

import { userApi } from "../api/user-api.js";
import { postApi } from "../api/post-api.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initCreatePostModal } from "../components/create-post-modal.js";
import { initPostInteractions } from "../components/post-interactions.js";
import { initPostMenus } from "../components/post-menu.js";
import { getUserId } from "../utils/auth.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_AVATAR_URL = "../assets/images/default-avatar.png";

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const normalizeString = (value, fallback = "") => {
	if (typeof value !== "string") return fallback;
	const t = value.trim();
	return t.length > 0 ? t : fallback;
};

const normalizeNumber = (value, fallback = 0) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const safeCount = (value) => {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	if (typeof value === "string" && value.trim().length > 0) return value.trim();
	return "0";
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

const setFeedback = (el, message, variant) => {
	if (!el) return;
	el.textContent = message;
	el.classList.remove("is-hidden", "is-error", "is-success");
	el.classList.add(variant === "error" ? "is-error" : "is-success");
};

const clearFeedback = (el) => {
	if (!el) return;
	el.textContent = "";
	el.classList.add("is-hidden");
	el.classList.remove("is-error", "is-success");
};

const getTargetUserIdFromQuery = () => {
	const query = new URLSearchParams(window.location.search);
	return normalizeString(query.get("id"));
};

// ---------------------------------------------------------------------------
// Loading skeleton helpers
// ---------------------------------------------------------------------------

const SKELETON_SELECTORS = [
	"#profile-avatar",
	"#profile-nickname",
	"#profile-bio",
	"#profile-posts-count",
	"#profile-followers-count",
	"#profile-following-count",
];

const showSkeleton = () => {
	SKELETON_SELECTORS.forEach((sel) => {
		document.querySelector(sel)?.classList.add("is-skeleton");
	});
};

const hideSkeleton = () => {
	SKELETON_SELECTORS.forEach((sel) => {
		document.querySelector(sel)?.classList.remove("is-skeleton");
	});
};

// ---------------------------------------------------------------------------
// Redirect helpers
// ---------------------------------------------------------------------------

const resolveLoginPath = () => {
	const p = window.location.pathname.toLowerCase();
	return p.includes("/pages/") ? "login.html" : "./pages/login.html";
};

const redirectToLogin = () => {
	window.location.href = resolveLoginPath();
};

// ---------------------------------------------------------------------------
// Error state helpers
// ---------------------------------------------------------------------------

const showErrorState = (message) => {
	const profilePage = document.querySelector(".profile-page");
	if (profilePage) profilePage.style.display = "none";

	const container = document.querySelector(".main-inner");
	const errorDiv = document.createElement("div");
	errorDiv.className = "error-state";
	errorDiv.innerHTML = `
		<span class="error-state__icon" aria-hidden="true">
			<i class="bx bx-user-x"></i>
		</span>
		<p class="error-state__title">Không tìm thấy người dùng</p>
	`;

	if (container) container.appendChild(errorDiv);
	else document.body.appendChild(errorDiv);
};

// ---------------------------------------------------------------------------
// Profile data rendering
// ---------------------------------------------------------------------------

const renderProfile = (response, isOwnProfile = true) => {
	const user = response?.data?.user;
	if (!user) throw new Error("Không tìm thấy thông tin người dùng.");

	const avatarEl       = document.getElementById("profile-avatar");
	const nicknameEl     = document.getElementById("profile-nickname");
	const bioEl          = document.getElementById("profile-bio");
	const postsCountEl   = document.getElementById("profile-posts-count");
	const followersCountEl = document.getElementById("profile-followers-count");
	const followingCountEl = document.getElementById("profile-following-count");
	const followButton   = document.getElementById("profile-follow-button");
	const linkEl         = document.getElementById("profile-link");

	const nickname = normalizeString(user.nickname, "Người dùng");
	const avatar   = normalizeString(user.avtUrl, DEFAULT_AVATAR_URL);
	const bio      = normalizeString(user.bio, "Chưa cập nhật bio.");
	const website  = normalizeString(user.website || user.link);

	if (avatarEl)   { avatarEl.src = avatar; avatarEl.alt = `Avatar ${nickname}`; }
	if (nicknameEl) nicknameEl.textContent = nickname;
	if (bioEl)      bioEl.textContent = bio;
	if (postsCountEl)    postsCountEl.textContent    = safeCount(user.postsCount);
	if (followersCountEl) followersCountEl.textContent = safeCount(user.followersCount);
	if (followingCountEl) followingCountEl.textContent = safeCount(user.followingCount);

	if (linkEl) {
		if (website.length > 0) {
			linkEl.textContent = website;
			linkEl.href = website;
			linkEl.classList.remove("is-hidden");
		} else {
			linkEl.textContent = "";
			linkEl.href = "#";
			linkEl.classList.add("is-hidden");
		}
	}

	if (followButton) {
		if (isOwnProfile) {
			followButton.classList.add("is-hidden");
		} else {
			const isFollowing = Boolean(response?.data?.isFollowing);
			followButton.classList.remove("is-hidden");
			followButton.classList.toggle("is-following", isFollowing);
			followButton.textContent = isFollowing ? "Đang theo dõi" : "Theo dõi";
		}
	}
};

// ---------------------------------------------------------------------------
// Load profile data
// ---------------------------------------------------------------------------

const loadProfileData = async (isOwnProfile = true, resolvedTargetId = "") => {
	const feedbackEl = document.getElementById("profile-feedback");
	clearFeedback(feedbackEl);
	showSkeleton();

	try {
		const response = isOwnProfile
			? await userApi.getMyProfile()
			: await userApi.getProfileById(resolvedTargetId);
		renderProfile(response, isOwnProfile);
	} catch (error) {
		const httpStatus = Number(error?.status);
		if (httpStatus === 401) { redirectToLogin(); return; }
		if (httpStatus === 404) { showErrorState("Lỗi: Không tìm thấy người dùng."); return; }
		setFeedback(feedbackEl, toMessage(error, "Không thể tải thông tin hồ sơ."), "error");
	} finally {
		hideSkeleton();
	}
};

// ---------------------------------------------------------------------------
// Follow / Unfollow button
// ---------------------------------------------------------------------------

/**
 * Gắn event listener vào nút Follow/Unfollow trên trang hồ sơ người khác.
 * Đọc trạng thái hiện tại từ class "is-following" trên button,
 * gọi API tương ứng, rồi cập nhật UI khi thành công.
 *
 * @param {string} targetUserId - ID người đang được xem trang cá nhân.
 */
const initFollowButton = (targetUserId) => {
	if (!targetUserId) return;

	const btn = document.getElementById("profile-follow-button");
	if (!btn) return;

	btn.addEventListener("click", async () => {
		const isCurrentlyFollowing = btn.classList.contains("is-following");

		// Disable nút trong lúc chờ API để tránh double-click
		btn.disabled = true;
		btn.textContent = "Đang xử lý…";

		try {
			if (isCurrentlyFollowing) {
				await userApi.unfollowUser(targetUserId);
				btn.classList.remove("is-following");
				btn.textContent = "Theo dõi";

				// Cập nhật số lượng followers trên UI
				const followersEl = document.getElementById("profile-followers-count");
				if (followersEl) {
					const current = parseInt(followersEl.textContent, 10);
					if (Number.isFinite(current) && current > 0) {
						followersEl.textContent = String(current - 1);
					}
				}
			} else {
				await userApi.followUser(targetUserId);
				btn.classList.add("is-following");
				btn.textContent = "Đang theo dõi";

				// Cập nhật số lượng followers trên UI
				const followersEl = document.getElementById("profile-followers-count");
				if (followersEl) {
					const current = parseInt(followersEl.textContent, 10);
					if (Number.isFinite(current)) {
						followersEl.textContent = String(current + 1);
					}
				}
			}
		} catch (error) {
			// Rollback text về trạng thái trước khi click
			btn.textContent = isCurrentlyFollowing ? "Đang theo dõi" : "Theo dõi";
			console.error("[profile] Lỗi follow/unfollow:", error);
		} finally {
			// Luôn mở lại nút sau khi xử lý xong
			btn.disabled = false;
		}
	});
};

// ---------------------------------------------------------------------------
// Post grid — state & rendering
// ---------------------------------------------------------------------------

/** Cursor-based pagination state */
let currentLastId    = null;
let isLoadingPosts   = false;
let hasMorePosts     = true;

/** Controller của comment-modal */
let commentModalController = null;

/**
 * Mảng in-memory tất cả bài viết đã tải.
 * Đây là nguồn dữ liệu duy nhất cho:
 *  - getPostData callback → initPostInteractions() tìm post để mở Edit/Report/v.v.
 *  - initGridClickHandler() mở comment-modal khi click vào lưới ảnh.
 */
const cachedPosts = [];

/** IntersectionObserver theo dõi sentinel element cuối lưới */
let postsObserver = null;

/**
 * Tạo phần tử <a class="grid-item"> từ dữ liệu một bài viết.
 * Chỉ hiển thị thumbnail/ảnh — click sẽ mở comment-modal.
 * @param {object} post
 * @returns {HTMLElement}
 */
const createGridItem = (post) => {
	const firstMedia = Array.isArray(post.mediaList) ? post.mediaList[0] : null;

	const item = document.createElement("a");
	item.className = "grid-item";
	item.href = "#";
	item.setAttribute("aria-label", `Bài đăng của ${post.authorName || ""}`);
	item.dataset.postId = post.id ?? "";
	if (post.authorId) item.dataset.authorId = post.authorId;

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
		// Bài không có media → placeholder
		const placeholder = document.createElement("div");
		placeholder.className = "grid-item__placeholder";
		placeholder.innerHTML = `<i class="bx bx-image-alt"></i>`;
		item.appendChild(placeholder);
	}

	return item;
};

/**
 * Render thêm bài viết vào lưới.
 * Đồng thời lưu vào cachedPosts[] để mở modal sau này.
 * @param {object[]} posts
 */
const renderPostGrid = (posts) => {
	const grid = document.querySelector(".profile-grid");
	if (!grid) return;

	const sentinel = document.getElementById("posts-sentinel");

	posts.forEach((post) => {
		cachedPosts.push(post);
		const item = createGridItem(post);
		if (sentinel) grid.insertBefore(item, sentinel);
		else grid.appendChild(item);
	});
};

/** Render dòng "Đã tải hết bài đăng" và dừng observer */
const showEndOfFeedMessage = () => {
	const grid = document.querySelector(".profile-grid");
	if (!grid) return;

	document.getElementById("posts-sentinel")?.remove();

	if (postsObserver) {
		postsObserver.disconnect();
		postsObserver = null;
	}

	if (!document.getElementById("posts-end-message")) {
		const msg = document.createElement("p");
		msg.id = "posts-end-message";
		msg.className = "posts-end-message";
		msg.textContent = "Bạn đã xem hết bài đăng.";
		grid.after(msg);
	}
};

/**
 * Gọi API và render kết quả vào lưới.
 * Guard bằng isLoadingPosts / hasMorePosts.
 * @param {string} targetUserId - ID người dùng. Rỗng = chính mình.
 */
const loadPosts = async (targetUserId = "") => {
	if (isLoadingPosts || !hasMorePosts) return;

	isLoadingPosts = true;
	try {
		const response = targetUserId.length > 0
			? await userApi.getPostsByUserId(targetUserId, currentLastId)
			: await postApi.getMyPosts(currentLastId);

		const data = response?.data;
		const posts = Array.isArray(data?.postList) ? data.postList : [];

		if (posts.length > 0) renderPostGrid(posts);

		currentLastId = data?.respLastPostId ?? currentLastId;
		hasMorePosts  = data?.hasMore === true;

		if (!hasMorePosts) showEndOfFeedMessage();
	} catch (error) {
		console.error("[profile] Lỗi khi tải danh sách bài viết:", error);
	} finally {
		isLoadingPosts = false;
	}
};

/**
 * Khởi tạo IntersectionObserver theo dõi sentinel element.
 * @param {string} targetUserId
 */
const initPostsInfiniteScroll = (targetUserId = "") => {
	const grid = document.querySelector(".profile-grid");
	if (!grid) return;

	grid.innerHTML = "";

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
		{ rootMargin: "200px" }
	);

	postsObserver.observe(sentinel);
};

// ---------------------------------------------------------------------------
// Grid click handler — click vào ô lưới → mở comment-modal
// ---------------------------------------------------------------------------

/**
 * Event Delegation trên .profile-grid.
 * Khi click vào grid-item → tìm bài viết từ cachedPosts[] và mở comment-modal.
 * State like mới nhất được đọc từ DOM data-attribute nếu bài có post-card đang hiện.
 */
const initGridClickHandler = () => {
	const grid = document.querySelector(".profile-grid");
	if (!grid) return;

	grid.addEventListener("click", (event) => {
		event.preventDefault();

		const gridItem = event.target.closest(".grid-item");
		if (!gridItem) return;

		const postId = normalizeString(gridItem.dataset.postId);
		if (!postId) return;

		const post = cachedPosts.find((p) => normalizeString(p?.id) === postId);
		if (!post || !commentModalController) return;

		// Đọc like state mới nhất từ DOM (nếu có post-card tương ứng trên trang)
		const cssId =
			typeof CSS !== "undefined" && typeof CSS.escape === "function"
				? CSS.escape(postId)
				: postId;
		const postCard = document.querySelector(`.post-card[data-post-id="${cssId}"]`);
		const latestPost = postCard
			? {
				...post,
				...(postCard.dataset.isLiked !== undefined
					? { isLiked: postCard.dataset.isLiked === "true" }
					: {}),
				...(postCard.dataset.newLikeCount !== undefined
					? { newLikeCount: normalizeNumber(postCard.dataset.newLikeCount, post.newLikeCount ?? 0) }
					: {}),
			}
			: post;

		commentModalController.open(latestPost);
	});
};

// ---------------------------------------------------------------------------
// Page initializer
// ---------------------------------------------------------------------------

const initProfilePage = () => {
	// ── Xác định ngữ cảnh: xem hồ sơ của ai? ──────────────────────────────
	const targetUserId  = getTargetUserIdFromQuery(); // ?id=xxx hoặc ""
	const currentUserId = getUserId();               // từ localStorage

	const isOwnProfile    = targetUserId.length === 0 || targetUserId === currentUserId;
	const resolvedTargetId = isOwnProfile ? "" : targetUserId;

	// ── Hiển thị / ẩn nút Follow ────────────────────────────────────────────
	const followButton = document.getElementById("profile-follow-button");
	if (followButton) {
		followButton.classList.toggle("is-hidden", isOwnProfile);
	}

	// ── Create-post modal (chỉ khởi tạo khi xem hồ sơ của chính mình) ───────
	const createPostModalController = isOwnProfile ? initCreatePostModal() : null;

	// ── Comment modal ─────────────────────────────────────────────────────────
	commentModalController = initCommentModal({
		onEditRequest: isOwnProfile
			? (post) => {
				if (createPostModalController) {
					createPostModalController.openEdit(post);
				}
			}
			: null,
		onDeleteSuccess: (postId) => {
			// post-interactions.js đã xóa DOM card; dọn in-memory cachedPosts
			const safeId = normalizeString(postId);
			const idx = cachedPosts.findIndex((p) => normalizeString(p?.id) === safeId);
			if (idx !== -1) cachedPosts.splice(idx, 1);
		},
	});

	// ── initPostInteractions — bắt buộc truyền getPostData ───────────────────
	//
	// Đây là lý do các nút Edit / Delete / Report bên trong comment-modal
	// trên trang profile không hoạt động trước đây: getPostData không được
	// cung cấp, khiến post-interactions.js không tìm được dữ liệu bài viết
	// khi xử lý các hành động đó.
	//
	// Bây giờ ta cung cấp callback trỏ vào cachedPosts[] để:
	//   1. Like     — post-interactions.js cần dữ liệu để đồng bộ
	//   2. Comment  — mở modal với đúng post object
	//   3. Edit     — openEdit(post) cần post đầy đủ
	//   4. Delete   — xóa đúng bài
	//   5. Report   — báo cáo đúng postId
	initPostInteractions({
		commentModalController,
		createModalController: createPostModalController,
		getPostData: (postId) => {
			const safe = normalizeString(postId);
			if (!safe) return null;
			const post = cachedPosts.find((p) => normalizeString(p?.id) === safe);
			if (!post) return null;

			// Merge like state mới nhất từ DOM nếu có
			const cssId =
				typeof CSS !== "undefined" && typeof CSS.escape === "function"
					? CSS.escape(safe)
					: safe;
			const card = document.querySelector(`.post-card[data-post-id="${cssId}"]`);
			if (!card) return post;
			return {
				...post,
				...(card.dataset.isLiked !== undefined
					? { isLiked: card.dataset.isLiked === "true" }
					: {}),
				...(card.dataset.newLikeCount !== undefined
					? { newLikeCount: normalizeNumber(card.dataset.newLikeCount, post.newLikeCount ?? 0) }
					: {}),
			};
		},
	});

	// ── Dropdown 3-chấm ──────────────────────────────────────────────────────
	// (dùng khi comment-modal inject nút với generateDropdownMenuHtml)
	initPostMenus();

	// ── Đồng bộ cachedPosts sau khi like được toggle ──────────────────────────
	document.addEventListener("postLikeUpdated", (event) => {
		const { postId, newLikeCount, isLiked } = event.detail ?? {};
		const safeId = normalizeString(postId);
		if (!safeId) return;

		const idx = cachedPosts.findIndex((p) => normalizeString(p?.id) === safeId);
		if (idx === -1) return;
		cachedPosts[idx] = {
			...cachedPosts[idx],
			isLiked: Boolean(isLiked),
			...(newLikeCount !== undefined
				? { newLikeCount: normalizeNumber(newLikeCount, 0) }
				: {}),
		};
	});

	// ── Dọn cachedPosts khi bài viết bị xóa (bởi post-interactions.js) ───────
	document.addEventListener("postDeleted", (event) => {
		const postId = normalizeString(event.detail?.postId ?? "");
		if (!postId) return;

		const idx = cachedPosts.findIndex((p) => normalizeString(p?.id) === postId);
		if (idx !== -1) cachedPosts.splice(idx, 1);

		// Xóa ô lưới tương ứng khỏi DOM
		const cssId =
			typeof CSS !== "undefined" && typeof CSS.escape === "function"
				? CSS.escape(postId)
				: postId;
		document
			.querySelector(`.grid-item[data-post-id="${cssId}"]`)
			?.remove();
	});

	// ── Follow / Unfollow button (chỉ khi xem hồ sơ người khác) ─────────────
	if (!isOwnProfile) {
		initFollowButton(resolvedTargetId);
	}

	// ── Load dữ liệu ─────────────────────────────────────────────────────────
	loadProfileData(isOwnProfile, resolvedTargetId);
	initPostsInfiniteScroll(resolvedTargetId);
	initGridClickHandler();
};

document.addEventListener("DOMContentLoaded", initProfilePage);
