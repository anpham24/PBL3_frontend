"use strict";

import { feedApi } from "../api/feed-api.js";
import { userApi } from "../api/user-api.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initPostInteractions } from "../components/post-interactions.js";
import { generateDropdownMenuHtml, initPostMenus } from "../components/post-menu.js";

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
	users: [],         // in-memory cache để tra cứu khi cần
};

/** State cho tab Bài viết */
const postSearchState = {
	query: "",
	provinceCode: "ALL",
	topicCode: "ALL",
	lastPostId: "",
	hasMore: false,
	isLoading: false,
	posts: [],         // in-memory cache để mở comment-modal
};

/** Tab đang active */
let activeTab = "users"; // "users" | "posts"

/** Controller của comment-modal */
let commentModalController = null;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const DEFAULT_AVATAR_URL =
	"https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=520&q=70";

const getEl = (id) => document.getElementById(id);
const showEl = (el) => el?.classList.remove("is-hidden");
const hideEl = (el) => el?.classList.add("is-hidden");

// ---------------------------------------------------------------------------
// Utility / formatting (mirror feed.js)
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

const formatCompactNumber = (num) => {
	const n = normalizeNumber(num, 0);
	if (n === 0) return "";
	if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",").replace(",0", "") + "M";
	if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",").replace(",0", "") + "K";
	return n.toString();
};

const isTruthyLike = (value) =>
	value === true || value === "true" || value === 1 || value === "1";

const timeAgo = (dateString) => {
	if (!dateString) return "";
	const date = new Date(dateString);
	if (isNaN(date.getTime())) return "";
	const seconds = Math.floor((new Date() - date) / 1000);
	if (seconds < 0) return "Vừa xong";
	let interval = seconds / 31536000;
	if (interval >= 1) return Math.floor(interval) + " năm trước";
	interval = seconds / 2592000;
	if (interval >= 1) return Math.floor(interval) + " tháng trước";
	interval = seconds / 86400;
	if (interval >= 1) return Math.floor(interval) + " ngày trước";
	interval = seconds / 3600;
	if (interval >= 1) return Math.floor(interval) + " giờ trước";
	interval = seconds / 60;
	if (interval >= 1) return Math.floor(interval) + " phút trước";
	return "Vừa xong";
};

// ---------------------------------------------------------------------------
// Post card rendering (giống feed.js)
// ---------------------------------------------------------------------------

const resolvePostMediaItems = (post) => {
	if (Array.isArray(post?.mediaList)) {
		return post.mediaList.reduce((acc, m) => {
			const url = normalizeString(m?.mediaUrl);
			if (url.length === 0) return acc;
			const isVideo = normalizeString(m?.mediaType).toUpperCase() === "VIDEO";
			const thumbnailUrl = normalizeString(m?.thumbnailUrl);
			acc.push({ url, isVideo, thumbnailUrl });
			return acc;
		}, []);
	}
	return [];
};

const createMediaHtml = (post, authorName) => {
	const mediaItems = resolvePostMediaItems(post);
	if (mediaItems.length === 0) return "";

	const renderItem = (item, altSuffix = "") => {
		if (item.isVideo) {
			const posterAttr = item.thumbnailUrl.length > 0
				? ` poster="${escapeHtml(item.thumbnailUrl)}"`
				: "";
			return `<video src="${escapeHtml(item.url)}" controls preload="metadata"${posterAttr}></video>`;
		}
		return `<img src="${escapeHtml(item.url)}" alt="Bài viết của ${escapeHtml(authorName)}${altSuffix}">`;
	};

	if (mediaItems.length === 1) {
		const item = mediaItems[0];
		if (item.isVideo) {
			return `<div class="post-image">${renderItem(item)}</div>`;
		}
		return `<img class="post-image" src="${escapeHtml(item.url)}" alt="Bài viết của ${escapeHtml(authorName)}">`;
	}

	const carouselItems = mediaItems.map((item, i) => `
		<div class="carousel-item">
			${renderItem(item, ` - phần ${i + 1}`)}
		</div>
	`).join("");

	return `
		<div class="post-media-carousel">
			<div class="carousel-inner">
				${carouselItems}
			</div>
			<button class="carousel-btn prev-btn" type="button" aria-label="Ảnh trước"><i class="bx bx-chevron-left"></i></button>
			<button class="carousel-btn next-btn" type="button" aria-label="Ảnh tiếp theo"><i class="bx bx-chevron-right"></i></button>
		</div>
	`;
};

const createPostCardHtml = (post) => {
	const postId = normalizeString(post?.id);
	const authorId = normalizeString(post?.authorId);
	const authorName = normalizeString(post?.authorName || post?.username) || "Người dùng";
	const avatarUrl =
		normalizeString(post?.avtUrl) ||
		"https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=96&q=60";
	const content = normalizeString(post?.content);
	const isLiked = isTruthyLike(post?.isLiked);
	const likeCount = normalizeNumber(post?.likeCount, 0);
	const commentCount = normalizeNumber(post?.commentCount, 0);
	const address = normalizeString(post?.address);
	const province = normalizeString(post?.province);
	const topic = normalizeString(post?.topic);
	const timeText = timeAgo(normalizeString(post?.createAt));
	const mediaHtml = createMediaHtml(post, authorName);

	return `
		<article class="post-card" data-post-id="${escapeHtml(postId)}"${authorId ? ` data-author-id="${escapeHtml(authorId)}"` : ""}>
			<header class="post-header">
				<div class="post-author">
					<img class="avatar open-profile-link" src="${escapeHtml(avatarUrl)}" alt="Avatar ${escapeHtml(authorName)}"${authorId ? ` data-user-id="${escapeHtml(authorId)}"` : ""} style="cursor:pointer;">
					<div class="post-meta">
						<div class="post-meta-row">
							<h3>
								<span class="open-profile-link"${authorId ? ` data-user-id="${escapeHtml(authorId)}"` : ""} style="cursor:pointer;">${escapeHtml(authorName)}</span>
								${timeText ? `<span class="post-time"> &bull; ${escapeHtml(timeText)}</span>` : ""}
							</h3>
						</div>
						${(province || topic || address) ? `
						<div class="post-tags-inline">
							${province ? `<span class="post-tag-chip"><i class="bx bx-map"></i><span>${escapeHtml(province)}</span></span>` : ""}
							${topic ? `<span class="post-tag-chip"><i class="bx bx-category"></i><span>${escapeHtml(topic)}</span></span>` : ""}
							${address ? `<span class="post-tag-chip"><i class="bx bx-current-location"></i><span>${escapeHtml(address)}</span></span>` : ""}
						</div>` : ""}
					</div>
				</div>
				${generateDropdownMenuHtml({ type: "post", itemId: postId, authorId })}
			</header>

			${mediaHtml}

			<div class="post-actions">
				<div class="left-actions">
					<button
						class="post-action-btn btn-like${isLiked ? " active is-liked" : ""}"
						type="button"
						data-post-id="${escapeHtml(postId)}"
						aria-label="${isLiked ? "Bỏ tim bài viết" : "Thả tim bài viết"}"
					>
						<i class="bx ${isLiked ? "bxs-heart" : "bx-heart"}"></i>
						<span class="action-count" data-role="like-count">${escapeHtml(formatCompactNumber(likeCount))}</span>
					</button>
					<button class="post-action-btn post-comment-btn" type="button" aria-label="Bình luận bài viết">
						<i class="bx bx-message-rounded"></i>
						<span class="action-count">${escapeHtml(formatCompactNumber(commentCount))}</span>
					</button>
				</div>
			</div>

			<footer class="post-footer">
				<p class="caption"><strong>${escapeHtml(authorName)}</strong> ${escapeHtml(content)}</p>
			</footer>
		</article>
	`;
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

/** Show/hide the scroll-loading spinner appended inside container */
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
	if (!isLoadMore && !userSearchState.hasMore && isLoadMore) return;
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

		if (!isLoadMore) {
			container.innerHTML = "";
		}

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
		if (!isLoadMore) {
			renderError(container, msg);
		} else {
			setUsersStatus(msg, "error");
		}
	} finally {
		userSearchState.isLoading = false;
	}
};

// ---------------------------------------------------------------------------
// Search: Bài viết
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

		if (!isLoadMore) {
			container.innerHTML = "";
		}

		if (posts.length === 0 && !isLoadMore) {
			renderEmpty(container, "bx-news", `Không tìm thấy bài viết nào cho "${escapeHtml(postSearchState.query)}"`);
			postSearchState.isLoading = false;
			return;
		}

		if (posts.length > 0) {
			const html = posts.map(createPostCardHtml).join("");
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
		if (!isLoadMore) {
			renderError(container, msg);
		} else {
			setPostsStatus(msg, "error");
		}
	} finally {
		postSearchState.isLoading = false;
	}
};

// ---------------------------------------------------------------------------
// Orchestrator
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
		if (mainInput.value.trim().length > 0) {
			showEl(clearBtn);
		} else {
			hideEl(clearBtn);
		}
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

			// Nếu đã có query, tự động chạy tìm kiếm trong tab mới
			const mainInput = getEl("search-main-input");
			const query = normalizeString(mainInput?.value ?? "");
			if (query.length > 0) {
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
// Comment modal — mở khi click nút bình luận trên bài viết kết quả tìm kiếm
// ---------------------------------------------------------------------------

const initPostListInteractions = () => {
	const container = getEl("search-posts-container");
	if (!container) return;

	container.addEventListener("click", (event) => {
		const commentBtn = event.target.closest(".post-comment-btn");
		if (!commentBtn) return;

		event.preventDefault();
		const postCard = commentBtn.closest(".post-card");
		const postId = normalizeString(postCard?.dataset.postId);
		if (postId.length === 0) return;

		// Đọc lại trạng thái like mới nhất từ DOM (data-attribute)
		const domIsLiked = postCard.dataset.isLiked;
		const domLikeCount = postCard.dataset.newLikeCount;

		const post = postSearchState.posts.find(
			(p) => normalizeString(p?.id) === postId
		);
		if (!post || !commentModalController) return;

		const latestPost = {
			...post,
			...(domIsLiked !== undefined ? { isLiked: domIsLiked === "true" } : {}),
			...(domLikeCount !== undefined ? { newLikeCount: normalizeNumber(domLikeCount, post.likeCount ?? 0) } : {}),
		};
		commentModalController.open(latestPost);
	});

	// Đồng bộ postSearchState.posts khi like được toggle
	document.addEventListener("postLikeUpdated", (event) => {
		const { postId, newLikeCount, isLiked } = event.detail ?? {};
		const safePostId = normalizeString(postId);
		if (safePostId.length === 0) return;

		postSearchState.posts = postSearchState.posts.map((p) => {
			if (normalizeString(p?.id) !== safePostId) return p;
			return {
				...p,
				isLiked: Boolean(isLiked),
				...(newLikeCount !== undefined ? { newLikeCount: normalizeNumber(newLikeCount, 0) } : {}),
			};
		});
	});

	// Chuyển hướng về trang hồ sơ khi click avatar/tên tác giả
	document.addEventListener("click", (event) => {
		const link = event.target.closest(".open-profile-link");
		if (!link) return;
		const userId = normalizeString(link.dataset.userId);
		if (userId.length === 0) return;
		if (event.defaultPrevented) return;
		event.preventDefault();
		window.location.href = `profile.html?id=${encodeURIComponent(userId)}`;
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
// Infinite scroll handler (mirrors feed.js handleScrollToBottom)
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
	initDropdownFilters();

	// Khởi tạo comment modal (không có onEditRequest vì đây là trang tìm kiếm read-only)
	commentModalController = initCommentModal({ onEditRequest: null });

	// Khởi tạo like / report interactions (event delegation toàn cục)
	initPostInteractions();

	// Khởi tạo dropdown menu 3 chấm cho bài viết
	initPostMenus();

	// Gắn click handler cho danh sách bài viết (comment modal)
	initPostListInteractions();

	// Infinite scroll — tải thêm khi cuộn gần chân trang
	window.addEventListener("scroll", handleScrollToBottom, { passive: true });

	prefillFromQuery();
};

document.addEventListener("DOMContentLoaded", initSearchPage);
