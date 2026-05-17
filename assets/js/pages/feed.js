/**
 * @file feed.js
 * @module pages/feed
 *
 * Trang bảng tin (Feed) — tích hợp hoàn chỉnh với kiến trúc component mới:
 *  - HTML bài đăng: chỉ dùng renderPostCard() từ post-card.js (một nguồn duy nhất)
 *  - Tương tác:      initPostInteractions() xử lý toàn bộ (Like, Comment, Edit, Delete, Report, Navigate)
 *  - Dropdown menu:  initPostMenus() từ post-menu.js
 */

"use strict";

import { feedApi } from "../api/feed-api.js";
import { postApi } from "../api/post-api.js";
import { renderPostCard } from "../components/post-card.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initCreatePostModal } from "../components/create-post-modal.js";
import { initPostInteractions } from "../components/post-interactions.js";
import { initPostMenus } from "../components/post-menu.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCROLL_BOTTOM_THRESHOLD = 220;
const FEED_MODE_EXPLORE = "EXPLORE";
const FEED_MODE_FOLLOWING = "FOLLOWING";

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

const feedState = {
	posts: [],
	lastId: "",
	provinceCode: "ALL",
	topicCode: "ALL",
	feedMode: FEED_MODE_EXPLORE,
	hasMore: true,
	isLoading: false,
	requestSequence: 0
};

// ---------------------------------------------------------------------------
// DOM element references (resolved in initFeedPage)
// ---------------------------------------------------------------------------

let provinceSelectElement;
let topicSelectElement;
let feedPostListElement;
let feedEmptyStateElement;
let feedStatusElement;
let feedTabExploreElement;
let feedTabFollowingElement;
let createPostModalController;
let commentModalController;

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

const toCssSelectorValue = (value) => {
	const safe = normalizeString(value);
	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(safe);
	}
	return safe.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

// ---------------------------------------------------------------------------
// Status bar helpers
// ---------------------------------------------------------------------------

const setStatus = (message, variant = "info") => {
	if (!feedStatusElement) return;
	feedStatusElement.textContent = message;
	feedStatusElement.classList.toggle("is-hidden", normalizeString(message).length === 0);

	if (variant === "error") {
		feedStatusElement.style.color = "#dc2626";
	} else if (variant === "success") {
		feedStatusElement.style.color = "#15803d";
	} else {
		feedStatusElement.style.color = "#4b5563";
	}
};

const clearStatus = () => {
	setStatus("");
	if (feedStatusElement) feedStatusElement.style.color = "";
};

// ---------------------------------------------------------------------------
// Toast notification
// ---------------------------------------------------------------------------

const showToast = (message, variant = "info", duration = 3500) => {
	let container = document.getElementById("feed-toast-container");
	if (!container) {
		container = document.createElement("div");
		container.id = "feed-toast-container";
		container.className = "toast-container";
		document.body.appendChild(container);
	}

	const toast = document.createElement("div");
	toast.id = `toast-${Date.now()}`;
	toast.className = `toast toast--${variant}`;
	toast.setAttribute("role", "status");
	toast.setAttribute("aria-live", "polite");
	toast.textContent = message;
	container.appendChild(toast);

	void toast.offsetWidth; // trigger reflow
	toast.classList.add("toast--visible");

	window.setTimeout(() => {
		toast.classList.remove("toast--visible");
		toast.addEventListener("transitionend", () => toast.remove(), { once: true });
	}, duration);
};

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

const syncEmptyState = () => {
	if (!feedEmptyStateElement) return;
	feedEmptyStateElement.classList.toggle("is-hidden", feedState.posts.length > 0);
};

// ---------------------------------------------------------------------------
// Render — dùng renderPostCard() từ post-card.js làm nguồn HTML duy nhất
// ---------------------------------------------------------------------------

/**
 * Render danh sách bài đăng vào #feed-post-list.
 * @param {object[]} posts - Mảng bài đăng cần render.
 * @param {boolean}  shouldReplace - true = xóa sạch rồi render lại toàn bộ.
 */
const renderPosts = (posts, shouldReplace = false) => {
	if (!feedPostListElement) return;

	// renderPostCard() là hàm pure nhập từ post-card.js — nguồn sinh HTML DUY NHẤT
	const html = posts.map(renderPostCard).join("");

	if (shouldReplace) {
		feedPostListElement.innerHTML = html;
		syncEmptyState();
		return;
	}

	feedPostListElement.insertAdjacentHTML("beforeend", html);
	syncEmptyState();
};

// ---------------------------------------------------------------------------
// Option: render select-box
// ---------------------------------------------------------------------------

const renderSelectOptions = (selectElement, options) => {
	if (!selectElement) return;
	const safeOptions = Array.isArray(options) ? options : [];
	const html = safeOptions
		.map((opt) => {
			const code = normalizeString(opt?.code);
			const name = normalizeString(opt?.name);
			if (!code || !name) return "";
			return `<option value="${code}">${name}</option>`;
		})
		.join("");
	if (html) selectElement.innerHTML = html;
};

// ---------------------------------------------------------------------------
// Post list management helpers
// ---------------------------------------------------------------------------

const appendUniquePosts = (incomingPosts, shouldReset) => {
	const safe = Array.isArray(incomingPosts) ? incomingPosts : [];

	if (shouldReset) {
		feedState.posts = safe;
		renderPosts(feedState.posts, true);
		return safe;
	}

	const existingIds = new Set(
		feedState.posts.map((p) => normalizeString(p?.id)).filter(Boolean)
	);
	const unique = safe.filter((p) => {
		const id = normalizeString(p?.id);
		if (!id) return true;
		if (existingIds.has(id)) return false;
		existingIds.add(id);
		return true;
	});

	feedState.posts = feedState.posts.concat(unique);
	renderPosts(unique, false);
	return unique;
};

/**
 * Chèn bài đăng mới lên đầu danh sách (sau khi tạo bài).
 * Dùng renderPostCard() — nguồn HTML duy nhất.
 * @param {object} post
 */
const prependPost = (post) => {
	if (!feedPostListElement || !post || typeof post !== "object") return;

	const incomingId = normalizeString(post.id);
	if (incomingId) {
		feedPostListElement
			.querySelector(`[data-post-id="${toCssSelectorValue(incomingId)}"]`)
			?.remove();
	}

	feedState.posts = [post].concat(
		feedState.posts.filter((p) => normalizeString(p?.id) !== incomingId)
	);

	// Dùng renderPostCard() thay vì createPostCardHtml() cũ
	feedPostListElement.insertAdjacentHTML("afterbegin", renderPostCard(post));
	syncEmptyState();
};

// ---------------------------------------------------------------------------
// Data lookup helpers
// ---------------------------------------------------------------------------

const findPostById = (postId) => {
	const safe = normalizeString(postId);
	if (!safe) return undefined;
	return feedState.posts.find((p) => normalizeString(p?.id) === safe);
};

/**
 * Đọc trạng thái like/comment mới nhất từ DOM (data-attribute ghi bởi post-interactions).
 * Đảm bảo comment-modal luôn nhận dữ liệu cập nhật nhất.
 */
const readLatestPostDataFromDom = (post) => {
	const postId = normalizeString(post?.id);
	if (!postId) return post;

	const card = feedPostListElement?.querySelector(
		`[data-post-id="${toCssSelectorValue(postId)}"]`
	);
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
// Feed API calls
// ---------------------------------------------------------------------------

const resolveFeedRequest = (lastId, provinceCode, topicCode) => {
	if (feedState.feedMode === FEED_MODE_FOLLOWING) {
		return feedApi.getFollowingFeed(lastId, provinceCode, topicCode);
	}
	return feedApi.getExploreFeed(lastId, provinceCode, topicCode);
};

const loadFeed = async (shouldReset = false) => {
	if (feedState.isLoading) return;
	if (!shouldReset && !feedState.hasMore) return;

	feedState.isLoading = true;
	setStatus(shouldReset ? "Đang tải bảng tin..." : "Đang tải thêm bài viết...");

	const requestId = ++feedState.requestSequence;
	const requestLastId = shouldReset ? "" : feedState.lastId;

	try {
		const response = await resolveFeedRequest(requestLastId, feedState.provinceCode, feedState.topicCode);

		if (requestId !== feedState.requestSequence) return;

		const receivedPosts = Array.isArray(response?.data?.postList)
			? response.data.postList
			: (Array.isArray(response?.postList) ? response.postList : []);
		const receivedLastId = normalizeString(response?.data?.respLastPostId || response?.respLastPostId);
		const hasMore = response?.data?.hasMore !== undefined ? response.data.hasMore : response?.hasMore;

		appendUniquePosts(receivedPosts, shouldReset);

		feedState.lastId = receivedLastId;
		feedState.hasMore = hasMore === true;

		if (feedState.posts.length === 0) {
			setStatus("Không có bài viết phù hợp với bộ lọc hiện tại.");
			return;
		}

		if (!feedState.hasMore) {
			setStatus("Đã tải hết bài đăng.");
			return;
		}

		clearStatus();
	} catch (error) {
		if (requestId !== feedState.requestSequence) return;
		if (shouldReset) {
			feedState.posts = [];
			renderPosts([], true);
		}
		setStatus(toMessage(error, "Không thể tải bảng tin. Vui lòng thử lại."), "error");
	} finally {
		if (requestId === feedState.requestSequence) {
			feedState.isLoading = false;
		}
	}
};

const reloadFeedWithFilters = async () => {
	feedState.provinceCode = normalizeString(provinceSelectElement?.value);
	feedState.topicCode = normalizeString(topicSelectElement?.value);
	feedState.posts = [];
	feedState.lastId = "";
	feedState.hasMore = true;
	feedState.requestSequence += 1;
	feedState.isLoading = false;

	renderPosts([], true);
	clearStatus();
	await loadFeed(true);
};

// ---------------------------------------------------------------------------
// Scroll handler — infinite scroll
// ---------------------------------------------------------------------------

const handleScrollToBottom = () => {
	if (feedState.isLoading || !feedState.hasMore) return;
	const currentScroll = window.innerHeight + window.scrollY;
	const scrollBottom = document.documentElement.scrollHeight - SCROLL_BOTTOM_THRESHOLD;
	if (currentScroll >= scrollBottom) {
		void loadFeed(false);
	}
};

// ---------------------------------------------------------------------------
// Dropdown data (province / topic)
// ---------------------------------------------------------------------------

const loadDropdowns = async () => {
	try {
		const response = await feedApi.getDropdownData();
		const provinces = Array.isArray(response?.data?.provinces) ? response.data.provinces : [];
		const topics = Array.isArray(response?.data?.topics) ? response.data.topics : [];
		renderSelectOptions(provinceSelectElement, provinces);
		renderSelectOptions(topicSelectElement, topics);
	} catch (error) {
		setStatus(toMessage(error, "Không tải được dữ liệu bộ lọc."), "error");
	}
};

// ---------------------------------------------------------------------------
// Feed tab switching
// ---------------------------------------------------------------------------

const updateFeedTabs = () => {
	if (!feedTabExploreElement || !feedTabFollowingElement) return;
	const isExplore = feedState.feedMode === FEED_MODE_EXPLORE;
	feedTabExploreElement.classList.toggle("is-active", isExplore);
	feedTabExploreElement.setAttribute("aria-selected", isExplore ? "true" : "false");
	feedTabFollowingElement.classList.toggle("is-active", !isExplore);
	feedTabFollowingElement.setAttribute("aria-selected", !isExplore ? "true" : "false");
};

const changeFeedMode = async (mode) => {
	if (mode !== FEED_MODE_EXPLORE && mode !== FEED_MODE_FOLLOWING) return;
	if (feedState.feedMode === mode) return;
	feedState.feedMode = mode;
	updateFeedTabs();
	await reloadFeedWithFilters();
};

// ---------------------------------------------------------------------------
// Page initializer
// ---------------------------------------------------------------------------

const initFeedPage = () => {
	// ── Resolve DOM refs ─────────────────────────────────────────────────────
	provinceSelectElement  = document.getElementById("province-filter");
	topicSelectElement     = document.getElementById("topic-filter");
	feedPostListElement    = document.getElementById("feed-post-list");
	feedEmptyStateElement  = document.getElementById("feed-empty-state");
	feedStatusElement      = document.getElementById("feed-status");
	feedTabExploreElement  = document.getElementById("feed-tab-explore");
	feedTabFollowingElement = document.getElementById("feed-tab-following");

	if (
		!provinceSelectElement ||
		!topicSelectElement ||
		!feedPostListElement ||
		!feedEmptyStateElement ||
		!feedStatusElement
	) {
		return;
	}

	// ── Create-post modal ────────────────────────────────────────────────────
	createPostModalController = initCreatePostModal({
		closeOnPublish: true,
		onPublish: (createdPost) => {
			prependPost(createdPost);
			setStatus("Đăng bài thành công.", "success");
		},
		onUpdate: () => {
			setStatus("Cập nhật bài viết thành công.", "success");
			void reloadFeedWithFilters();
		},
	});

	// ── Comment modal ─────────────────────────────────────────────────────────
	commentModalController = initCommentModal({
		onEditRequest: (post) => {
			const postData = typeof post === "object" && post !== null
				? post
				: findPostById(post);
			if (postData && createPostModalController) {
				createPostModalController.openEdit(postData);
			}
		},
		onDeleteSuccess: (postId) => {
			const safeId = normalizeString(postId);
			feedPostListElement
				?.querySelector(`[data-post-id="${toCssSelectorValue(safeId)}"]`)
				?.remove();
			feedState.posts = feedState.posts.filter(
				(p) => normalizeString(p?.id) !== safeId
			);
			syncEmptyState();
		},
	});

	// ── Post interactions (Like, Comment→modal, Edit, Delete, Report, Navigate) ─
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

	// ── Bộ lọc province / topic ───────────────────────────────────────────────
	provinceSelectElement.addEventListener("change", () => void reloadFeedWithFilters());
	topicSelectElement.addEventListener("change", () => void reloadFeedWithFilters());

	// ── Tabs Khám phá / Đang theo dõi ────────────────────────────────────────
	feedTabExploreElement?.addEventListener("click", () => void changeFeedMode(FEED_MODE_EXPLORE));
	feedTabFollowingElement?.addEventListener("click", () => void changeFeedMode(FEED_MODE_FOLLOWING));

	// ── Infinite scroll ───────────────────────────────────────────────────────
	window.addEventListener("scroll", handleScrollToBottom, { passive: true });

	// ── Đồng bộ in-memory state sau khi like được toggle ─────────────────────
	document.addEventListener("postLikeUpdated", (event) => {
		const { postId, newLikeCount, isLiked } = event.detail ?? {};
		const safeId = normalizeString(postId);
		if (!safeId) return;
		feedState.posts = feedState.posts.map((p) => {
			if (normalizeString(p?.id) !== safeId) return p;
			return {
				...p,
				isLiked: Boolean(isLiked),
				...(newLikeCount !== undefined ? { newLikeCount: normalizeNumber(newLikeCount, 0) } : {}),
			};
		});
	});

	// ── Dọn state khi bài bị xóa (bơi post-interactions.js) ─────────────────
	document.addEventListener("postDeleted", (event) => {
		const postId = normalizeString(event.detail?.postId ?? "");
		if (!postId) return;
		feedState.posts = feedState.posts.filter(
			(p) => normalizeString(p?.id) !== postId
		);
		syncEmptyState();
	});

	// ── Cập nhật tab UI và bắt đầu tải dữ liệu ──────────────────────────────
	updateFeedTabs();
	void Promise.all([loadDropdowns(), loadFeed(true)]);
};

document.addEventListener("DOMContentLoaded", initFeedPage);
