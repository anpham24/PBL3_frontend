/**
 * @file search.js
 * @module pages/search
 *
 * Trang tìm kiếm — kiến trúc đồng nhất với feed.js:
 *  - HTML bài đăng: dùng renderPostCard() từ post-card.js (một nguồn duy nhất)
 *  - Tương tác:     initPostInteractions() xử lý toàn bộ (Like, Comment→modal,
 *                   Edit, Delete, Report, Navigate to profile)
 *  - Xử lý state:   lắng nghe postDeleted / postLikeUpdated để đồng bộ in-memory cache
 */

"use strict";

import { feedApi } from "../api/feed-api.js";
import { userApi } from "../api/user-api.js";
import { renderPostCard } from "../components/post-card.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initCreatePostModal } from "../components/create-post-modal.js";
import { initPostInteractions } from "../components/post-interactions.js";
import { initPostMenus } from "../components/post-menu.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCROLL_BOTTOM_THRESHOLD = 220;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** State cho tab Người dùng */
const userSearchState = {
	query: "",
	lastUserId: "",
	hasMore: false,
	isLoading: false,
	users: [],
};

/** State cho tab Bài viết */
const postSearchState = {
	query: "",
	provinceCode: "ALL",
	topicCode: "ALL",
	lastPostId: "",
	hasMore: false,
	isLoading: false,
	posts: [],   // in-memory cache — dùng cho getPostData callback
};

/** Tab đang active */
let activeTab = "users"; // "users" | "posts"

/** Controller của comment-modal */
let commentModalController = null;

/** Controller của create-post-modal (dùng cho Edit) */
let createPostModalController = null;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const DEFAULT_AVATAR_URL = "../assets/images/default-avatar.png";

const getEl = (id) => document.getElementById(id);
const showEl = (el) => el?.classList.remove("is-hidden");
const hideEl = (el) => el?.classList.add("is-hidden");

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

const normalizeString = (value) => {
	if (typeof value !== "string") return "";
	const t = value.trim();
	return t.length > 0 ? t : "";
};

const normalizeNumber = (value, fallback = 0) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const escapeHtml = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

// ---------------------------------------------------------------------------
// Post data lookup (dùng bởi getPostData callback)
// ---------------------------------------------------------------------------

const findPostById = (postId) => {
	const safe = normalizeString(postId);
	if (!safe) return null;
	return postSearchState.posts.find((p) => normalizeString(p?.id) === safe) ?? null;
};

/**
 * Đọc trạng thái like mới nhất từ DOM data-attribute (ghi bởi post-interactions.js).
 * @param {object} post
 * @returns {object}
 */
const readLatestPostDataFromDom = (post) => {
	const postId = normalizeString(post?.id);
	if (!postId) return post;

	const cssId =
		typeof CSS !== "undefined" && typeof CSS.escape === "function"
			? CSS.escape(postId)
			: postId;
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
};

// ---------------------------------------------------------------------------
// UI state helpers
// ---------------------------------------------------------------------------

const renderLoading = (container) => {
	if (!container) return;
	container.innerHTML = `
		<div class="search-loading">
			<span class="search-spinner" aria-label="Đang tải..."></span>
			<span>Đang tìm kiếm...</span>
		</div>
	`;
};

const renderEmpty = (container, icon, message) => {
	if (!container) return;
	container.innerHTML = `
		<div class="search-empty-state">
			<i class="bx ${icon}"></i>
			<p>${message}</p>
		</div>
	`;
};

const renderError = (container, message) => {
	if (!container) return;
	container.innerHTML = `<p class="search-status is-error">${escapeHtml(message)}</p>`;
};

const setUsersStatus = (message, variant = "info") => {
	const el = getEl("search-users-status");
	if (!el) return;
	el.textContent = message;
	el.classList.toggle("is-hidden", message.length === 0);
	el.classList.toggle("is-error", variant === "error");
};

const clearUsersStatus = () => setUsersStatus("");

const setPostsStatus = (message, variant = "info") => {
	const el = getEl("search-posts-status");
	if (!el) return;
	el.textContent = message;
	el.classList.toggle("is-hidden", message.length === 0);
	el.classList.toggle("is-error", variant === "error");
};

const clearPostsStatus = () => setPostsStatus("");

const showScrollSpinner = (container, id) => {
	if (!container || container.querySelector(`#${id}`)) return;
	const div = document.createElement("div");
	div.id = id;
	div.className = "search-loading search-scroll-loading";
	div.innerHTML = `<span class="search-spinner" aria-label="Đang tải..."></span><span>Đang tải thêm...</span>`;
	container.appendChild(div);
};

const hideScrollSpinner = (container, id) => {
	container?.querySelector(`#${id}`)?.remove();
};

// ---------------------------------------------------------------------------
// User card rendering
// ---------------------------------------------------------------------------

const createUserCard = (user) => {
	const card = document.createElement("div");
	card.className = "search-user-card";
	card.setAttribute("role", "article");

	const avatar = user.avtUrl || DEFAULT_AVATAR_URL;
	const nickname = user.nickname || "Người dùng";
	const bio = user.bio || "";
	const userId = user.id || "";

	card.innerHTML = `
		<img class="search-user-avatar" src="${escapeHtml(avatar)}" alt="Avatar ${escapeHtml(nickname)}" loading="lazy">
		<div class="search-user-info">
			<p class="search-user-name">${escapeHtml(nickname)}</p>
			${bio.length > 0 ? `<p class="search-user-bio">${escapeHtml(bio)}</p>` : ""}
		</div>
		<div class="search-user-action">
			<button
				class="search-view-profile-btn"
				type="button"
				aria-label="Xem hồ sơ ${escapeHtml(nickname)}"
			>
				Xem hồ sơ
			</button>
		</div>
	`;

	const goToProfile = () => {
		if (userId.length > 0) {
			window.location.href = `profile.html?id=${encodeURIComponent(userId)}`;
		}
	};

	card.querySelector(".search-view-profile-btn")?.addEventListener("click", goToProfile);
	card.addEventListener("click", (e) => {
		if (e.target.closest(".search-view-profile-btn")) return;
		goToProfile();
	});

	return card;
};

// ---------------------------------------------------------------------------
// Search: Người dùng
// ---------------------------------------------------------------------------

const searchUsers = async (isLoadMore = false) => {
	const container = getEl("search-results-container");
	if (!container) return;

	if (userSearchState.isLoading) return;
	if (!isLoadMore && userSearchState.query.length === 0) return;

	userSearchState.isLoading = true;
	clearUsersStatus();

	if (!isLoadMore) {
		renderLoading(container);
		userSearchState.users = [];
		userSearchState.lastUserId = "";
		userSearchState.hasMore = false;
	} else {
		showScrollSpinner(container, "search-users-scroll-spinner");
	}

	try {
		const response = await userApi.searchUsers(
			userSearchState.query,
			isLoadMore ? userSearchState.lastUserId : ""
		);

		const data = response?.data ?? {};
		const users = Array.isArray(data.userList) ? data.userList : [];
		const respLastUserId = normalizeString(data.respLastUserId);
		const hasMore = data.hasMore === true;

		hideScrollSpinner(container, "search-users-scroll-spinner");

		if (!isLoadMore) container.innerHTML = "";

		if (users.length === 0 && !isLoadMore) {
			renderEmpty(container, "bx-search-alt", `Không tìm thấy người dùng nào cho "${escapeHtml(userSearchState.query)}"`);
			userSearchState.isLoading = false;
			return;
		}

		users.forEach((user) => {
			userSearchState.users.push(user);
			container.appendChild(createUserCard(user));
		});

		userSearchState.lastUserId = respLastUserId;
		userSearchState.hasMore = hasMore;

		if (!hasMore && userSearchState.users.length > 0) {
			setUsersStatus("Đã tải hết người dùng.");
		}
	} catch (err) {
		hideScrollSpinner(container, "search-users-scroll-spinner");
		console.error("[search] searchUsers error:", err);
		const msg = normalizeString(err?.data?.message || err?.message) || "Không thể tìm kiếm. Vui lòng thử lại.";
		if (!isLoadMore) renderError(container, msg);
		else setUsersStatus(msg, "error");
	} finally {
		userSearchState.isLoading = false;
	}
};

// ---------------------------------------------------------------------------
// Search: Bài viết — dùng renderPostCard() để render
// ---------------------------------------------------------------------------

const searchPosts = async (isLoadMore = false) => {
	const container = getEl("search-posts-container");
	if (!container) return;

	if (postSearchState.isLoading) return;
	if (!isLoadMore && postSearchState.query.length === 0) return;

	postSearchState.isLoading = true;
	clearPostsStatus();

	if (!isLoadMore) {
		renderLoading(container);
		postSearchState.posts = [];
		postSearchState.lastPostId = "";
		postSearchState.hasMore = false;
	} else {
		showScrollSpinner(container, "search-posts-scroll-spinner");
	}

	try {
		const response = await feedApi.searchPosts(
			postSearchState.query,
			isLoadMore ? postSearchState.lastPostId : "",
			postSearchState.provinceCode,
			postSearchState.topicCode
		);

		const data = response?.data ?? {};
		const posts = Array.isArray(data.postList) ? data.postList : [];
		const respLastPostId = normalizeString(data.respLastPostId);
		const hasMore = data.hasMore === true;

		hideScrollSpinner(container, "search-posts-scroll-spinner");

		if (!isLoadMore) container.innerHTML = "";

		if (posts.length === 0 && !isLoadMore) {
			renderEmpty(container, "bx-news", `Không tìm thấy bài viết nào cho "${escapeHtml(postSearchState.query)}"`);
			postSearchState.isLoading = false;
			return;
		}

		if (posts.length > 0) {
			// Dùng renderPostCard() — nguồn HTML duy nhất, giống feed.js
			const html = posts.map(renderPostCard).join("");
			container.insertAdjacentHTML("beforeend", html);
			posts.forEach((p) => postSearchState.posts.push(p));
		}

		postSearchState.lastPostId = respLastPostId;
		postSearchState.hasMore = hasMore;

		if (!hasMore && postSearchState.posts.length > 0) {
			setPostsStatus("Đã tải hết bài đăng.");
		}
	} catch (err) {
		hideScrollSpinner(container, "search-posts-scroll-spinner");
		console.error("[search] searchPosts error:", err);
		const msg = normalizeString(err?.data?.message || err?.message) || "Không thể tìm kiếm. Vui lòng thử lại.";
		if (!isLoadMore) renderError(container, msg);
		else setPostsStatus(msg, "error");
	} finally {
		postSearchState.isLoading = false;
	}
};

// ---------------------------------------------------------------------------
// Orchestrator — điều phối tìm kiếm theo tab hiện tại
// ---------------------------------------------------------------------------

const runSearch = () => {
	const mainInput = getEl("search-main-input");
	const query = normalizeString(mainInput?.value ?? "");

	if (query.length === 0) {
		clearResults();
		return;
	}

	if (activeTab === "users") {
		userSearchState.query = query;
		void searchUsers(false);
	} else {
		postSearchState.query = query;
		void searchPosts(false);
	}
};

const clearResults = () => {
	userSearchState.query = "";
	userSearchState.users = [];
	userSearchState.lastUserId = "";
	userSearchState.hasMore = false;

	postSearchState.query = "";
	postSearchState.posts = [];
	postSearchState.lastPostId = "";
	postSearchState.hasMore = false;

	clearUsersStatus();
	clearPostsStatus();

	renderEmpty(getEl("search-results-container"), "bx-search-alt", "Nhập từ khóa để tìm kiếm người dùng");
	renderEmpty(getEl("search-posts-container"), "bx-news", "Nhập từ khóa để tìm kiếm bài viết");
};

// ---------------------------------------------------------------------------
// Hero search bar
// ---------------------------------------------------------------------------

const initSearchBar = () => {
	const mainInput = getEl("search-main-input");
	const clearBtn = getEl("search-clear-btn");
	if (!mainInput) return;

	const syncClearBtn = () => {
		if (mainInput.value.trim().length > 0) showEl(clearBtn);
		else hideEl(clearBtn);
	};

	mainInput.addEventListener("input", syncClearBtn);
	clearBtn?.addEventListener("click", () => {
		mainInput.value = "";
		syncClearBtn();
		mainInput.focus();
		clearResults();
	});
	mainInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			runSearch();
		}
	});
};

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

const initTabs = () => {
	const tabs = document.querySelectorAll(".search-tab");

	tabs.forEach((tab) => {
		tab.addEventListener("click", () => {
			const targetTab = tab.dataset.tab;
			if (targetTab === activeTab) return;

			tabs.forEach((t) => {
				t.classList.remove("is-active");
				t.setAttribute("aria-selected", "false");
			});
			tab.classList.add("is-active");
			tab.setAttribute("aria-selected", "true");

			const usersPanel = getEl("search-panel-users");
			const postsPanel = getEl("search-panel-posts");

			if (targetTab === "users") {
				showEl(usersPanel);
				hideEl(postsPanel);
			} else {
				hideEl(usersPanel);
				showEl(postsPanel);
			}

			activeTab = targetTab;

			const mainInput = getEl("search-main-input");
			if (normalizeString(mainInput?.value).length > 0) {
				runSearch();
			}
		});
	});
};

// ---------------------------------------------------------------------------
// Dropdown filters (province & topic)
// ---------------------------------------------------------------------------

const populateSelect = (selectEl, items, labelKey, valueKey, defaultLabel) => {
	if (!selectEl) return;
	selectEl.innerHTML = `<option value="ALL">${escapeHtml(defaultLabel)}</option>`;
	if (!Array.isArray(items)) return;
	items.forEach((item) => {
		const opt = document.createElement("option");
		opt.value = item[valueKey] ?? "";
		opt.textContent = item[labelKey] ?? "";
		selectEl.appendChild(opt);
	});
};

const initDropdownFilters = async () => {
	const provinceSelect = getEl("search-province-filter");
	const topicSelect = getEl("search-topic-filter");

	try {
		const response = await feedApi.getDropdownData();
		const data = response?.data ?? {};
		populateSelect(provinceSelect, data.provinces ?? [], "provinceName", "provinceCode", "Tất cả tỉnh");
		populateSelect(topicSelect, data.topics ?? [], "topicName", "topicCode", "Tất cả chủ đề");
	} catch (err) {
		console.warn("[search] Không thể tải danh sách tỉnh/chủ đề:", err);
	}

	provinceSelect?.addEventListener("change", () => {
		postSearchState.provinceCode = provinceSelect.value;
		const mainInput = getEl("search-main-input");
		if (normalizeString(mainInput?.value).length > 0 && activeTab === "posts") {
			postSearchState.query = normalizeString(mainInput.value);
			void searchPosts(false);
		}
	});

	topicSelect?.addEventListener("change", () => {
		postSearchState.topicCode = topicSelect.value;
		const mainInput = getEl("search-main-input");
		if (normalizeString(mainInput?.value).length > 0 && activeTab === "posts") {
			postSearchState.query = normalizeString(mainInput.value);
			void searchPosts(false);
		}
	});
};

// ---------------------------------------------------------------------------
// URL query pre-fill (?q=...)
// ---------------------------------------------------------------------------

const prefillFromQuery = () => {
	const params = new URLSearchParams(window.location.search);
	const q = params.get("q");
	if (typeof q === "string" && q.trim().length > 0) {
		const mainInput = getEl("search-main-input");
		if (mainInput) {
			mainInput.value = q.trim();
			showEl(getEl("search-clear-btn"));
		}
		runSearch();
	}
};

// ---------------------------------------------------------------------------
// Infinite scroll handler
// ---------------------------------------------------------------------------

const handleScrollToBottom = () => {
	const currentScroll = window.innerHeight + window.scrollY;
	const scrollBottom = document.documentElement.scrollHeight - SCROLL_BOTTOM_THRESHOLD;
	if (currentScroll < scrollBottom) return;

	if (activeTab === "users") {
		if (!userSearchState.isLoading && userSearchState.hasMore && userSearchState.query.length > 0) {
			void searchUsers(true);
		}
	} else {
		if (!postSearchState.isLoading && postSearchState.hasMore && postSearchState.query.length > 0) {
			void searchPosts(true);
		}
	}
};

// ---------------------------------------------------------------------------
// Page initializer
// ---------------------------------------------------------------------------

const initSearchPage = () => {
	initSearchBar();
	initTabs();
	void initDropdownFilters();

	// ── Create-post modal (dùng khi Edit bài viết) ────────────────────────────
	// Trang search chỉ xem không tạo bài, nhưng người dùng có thể edit bài của mình.
	createPostModalController = initCreatePostModal({
		closeOnPublish: true,
		onUpdate: () => {
			// Sau khi chỉnh sửa thành công, reload kết quả tìm kiếm
			if (postSearchState.query.length > 0) {
				void searchPosts(false);
			}
		},
	});

	// ── Comment modal ─────────────────────────────────────────────────────────
	commentModalController = initCommentModal({
		onEditRequest: (post) => {
			if (createPostModalController) {
				createPostModalController.openEdit(post);
			}
		},
		onDeleteSuccess: (postId) => {
			// DOM card đã bị post-interactions.js xóa; dọn in-memory state
			const safeId = normalizeString(postId);
			postSearchState.posts = postSearchState.posts.filter(
				(p) => normalizeString(p?.id) !== safeId
			);
		},
	});

	// ── post-interactions.js — xử lý toàn bộ sự kiện giống hệt feed.js ────────
	//   Like, Comment→modal, Edit, Delete, Report, Navigate to profile
	initPostInteractions({
		commentModalController,
		createModalController: createPostModalController,
		getPostData: (postId) => {
			const post = findPostById(postId);
			return post ? readLatestPostDataFromDom(post) : null;
		},
	});

	// ── Dropdown 3-chấm ──────────────────────────────────────────────────────
	initPostMenus();

	// ── Đồng bộ in-memory posts khi like được toggle ──────────────────────────
	document.addEventListener("postLikeUpdated", (event) => {
		const { postId, newLikeCount, isLiked } = event.detail ?? {};
		const safeId = normalizeString(postId);
		if (!safeId) return;
		postSearchState.posts = postSearchState.posts.map((p) => {
			if (normalizeString(p?.id) !== safeId) return p;
			return {
				...p,
				isLiked: Boolean(isLiked),
				...(newLikeCount !== undefined
					? { newLikeCount: normalizeNumber(newLikeCount, 0) }
					: {}),
			};
		});
	});

	// ── Dọn state khi bài viết bị xóa (bởi post-interactions.js) ────────────
	document.addEventListener("postDeleted", (event) => {
		const postId = normalizeString(event.detail?.postId ?? "");
		if (!postId) return;
		postSearchState.posts = postSearchState.posts.filter(
			(p) => normalizeString(p?.id) !== postId
		);
	});

	// ── Infinite scroll ───────────────────────────────────────────────────────
	window.addEventListener("scroll", handleScrollToBottom, { passive: true });

	prefillFromQuery();
};

document.addEventListener("DOMContentLoaded", initSearchPage);
