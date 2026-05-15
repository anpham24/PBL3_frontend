"use strict";

import { feedApi } from "../api/feed-api.js";
import { postApi } from "../api/post-api.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initCreatePostModal } from "../components/create-post-modal.js";
import { initPostInteractions } from "../components/post-interactions.js";
import { isPostOwner } from "../utils/helpers.js";

const SCROLL_BOTTOM_THRESHOLD = 220;
const FEED_MODE_EXPLORE = "EXPLORE";
const FEED_MODE_FOLLOWING = "FOLLOWING";

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

const reportState = {
	activePostId: "",
	isSubmitting: false
};

let provinceSelectElement;
let topicSelectElement;
let feedPostListElement;
let feedEmptyStateElement;
let feedStatusElement;
let feedTabExploreElement;
let feedTabFollowingElement;
let reportPostModalElement;
let reportPostFormElement;
let reportPostCloseButton;
let reportPostCancelButton;
let reportPostSubmitButton;
let reportPostFeedbackElement;
let reportReasonsContainerElement;
let createPostModalController;
let commentModalController;

/** Cache danh sách lý do báo cáo — tránh gọi lại API 2 lần */
let reportReasonsCache = null;

const normalizeString = (value) => {
	if (typeof value !== "string") {
		return "";
	}

	const trimmedValue = value.trim();
	return trimmedValue.length > 0 ? trimmedValue : "";
};

const normalizeNumber = (value, fallback = 0) => {
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : fallback;
};

const escapeHtml = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#039;");

const toCssSelectorValue = (value) => {
	const safeValue = normalizeString(value);

	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(safeValue);
	}

	return safeValue.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
};

const formatLikeCount = (likeCount) => new Intl.NumberFormat("vi-VN").format(normalizeNumber(likeCount, 0));

const formatCompactNumber = (num) => {
	const n = normalizeNumber(num, 0);
	if (n === 0) return "";
	if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",").replace(",0", "") + "M";
	if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",").replace(",0", "") + "K";
	return n.toString();
};

const isVideoUrl = (url) => /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);

const isTruthyLike = (value) => value === true || value === "true" || value === 1 || value === "1";

const toArray = (value) => (Array.isArray(value) ? value : []);

const toMessage = (error, fallbackMessage) => {
	if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
		return error.data.message.trim();
	}

	if (typeof error?.message === "string" && error.message.trim().length > 0) {
		return error.message.trim();
	}

	return fallbackMessage;
};

const setStatus = (message, variant = "info") => {
	if (!feedStatusElement) {
		return;
	}

	feedStatusElement.textContent = message;
	feedStatusElement.classList.toggle("is-hidden", normalizeString(message).length === 0);

	if (variant === "error") {
		feedStatusElement.style.color = "#dc2626";
		return;
	}

	if (variant === "success") {
		feedStatusElement.style.color = "#15803d";
		return;
	}

	feedStatusElement.style.color = "#4b5563";
};

const clearStatus = () => {
	setStatus("");
	if (feedStatusElement) {
		feedStatusElement.style.color = "";
	}
};

const setReportFeedback = (message, variant = "error") => {
	if (!reportPostFeedbackElement) {
		return;
	}

	reportPostFeedbackElement.textContent = message;
	reportPostFeedbackElement.classList.remove("is-hidden");
	reportPostFeedbackElement.style.color = variant === "error" ? "#dc2626" : "#15803d";
};

const clearReportFeedback = () => {
	if (!reportPostFeedbackElement) {
		return;
	}

	reportPostFeedbackElement.textContent = "";
	reportPostFeedbackElement.classList.add("is-hidden");
	reportPostFeedbackElement.style.color = "";
};

// ---------------------------------------------------------------------------
// Toast notification — hiển thị thông báo nổi tạm thời
// ---------------------------------------------------------------------------

/**
 * Hiển thị một toast thông báo nhỏ góc dưới màn hình.
 * @param {string} message - Nội dung thông báo.
 * @param {'success'|'error'|'info'} variant - Loại thông báo.
 * @param {number} [duration=3000] - Thời gian hiển thị (ms).
 */
const showToast = (message, variant = "info", duration = 3500) => {
	const existing = document.getElementById("feed-toast-container");
	if (!existing) {
		const container = document.createElement("div");
		container.id = "feed-toast-container";
		container.className = "toast-container";
		document.body.appendChild(container);
	}

	const toast = document.createElement("div");
	const toastId = `toast-${Date.now()}`;
	toast.id = toastId;
	toast.className = `toast toast--${variant}`;
	toast.setAttribute("role", "status");
	toast.setAttribute("aria-live", "polite");
	toast.textContent = message;

	const container = document.getElementById("feed-toast-container");
	container.appendChild(toast);

	// Trigger reflow để animation hoạt động
	void toast.offsetWidth;
	toast.classList.add("toast--visible");

	window.setTimeout(() => {
		toast.classList.remove("toast--visible");
		toast.addEventListener("transitionend", () => toast.remove(), { once: true });
	}, duration);
};

const syncEmptyState = () => {
	if (!feedEmptyStateElement) {
		return;
	}

	feedEmptyStateElement.classList.toggle("is-hidden", feedState.posts.length > 0);
};

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

/**
 * Giải quyết danh sách media từ dữ liệu bài viết.
 * Trả về mảng các object {url, isVideo, thumbnailUrl} để giữ đủ thông tin render.
 * @param {object} post
 * @returns {{url: string, isVideo: boolean, thumbnailUrl: string}[]}
 */
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

	// Fallback: plain URL list (legacy)
	let media = post?.media_url || post?.mediaUrl || post?.image_url || post?.imageUrl || post?.media_urls || post?.mediaUrls;
	if (!media) return [];
	const urls = Array.isArray(media)
		? media.map(normalizeString).filter(u => u.length > 0)
		: typeof media === "string"
			? (media.includes(",") ? media.split(",").map(normalizeString).filter(u => u.length > 0) : [normalizeString(media)].filter(u => u.length > 0))
			: [];

	return urls.map(url => ({ url, isVideo: isVideoUrl(url), thumbnailUrl: "" }));
};

// Giữ alias để không phá vỡ code ngoài file này nếu có import
const resolvePostMediaUrls = (post) => resolvePostMediaItems(post).map(item => item.url);

const createMediaHtml = (post, authorName) => {
	const mediaItems = resolvePostMediaItems(post);
	if (mediaItems.length === 0) {
		return "";
	}

	const renderMediaItem = (item, altSuffix = "") => {
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
			return `
				<div class="post-image">
					${renderMediaItem(item)}
				</div>
			`;
		}
		return `<img class="post-image" src="${escapeHtml(item.url)}" alt="Bài viết của ${escapeHtml(authorName)}">`;
	}

	const carouselItems = mediaItems.map((item, index) => `
		<div class="carousel-item">
			${renderMediaItem(item, ` - phần ${index + 1}`)}
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
	const authorName = normalizeString(post?.authorName || post?.author_name || post?.username) || "Người dùng";
	const avatarUrl =
		normalizeString(post?.avtUrl) ||
		"https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=96&q=60";
	const content = normalizeString(post?.content || post?.caption);
	const isLiked = isTruthyLike(post?.isLiked);
	const likeCount = normalizeNumber(post?.likeCount || post?.like_count, 0);
	const commentCount = normalizeNumber(post?.commentCount || post?.comment_count, 0);
	const address = normalizeString(post?.address || post?.location);
	const province = normalizeString(post?.province);
	const topic = normalizeString(post?.topic);
	const createdAt = normalizeString(post?.createAt || post?.create_at || post?.created_at);
	const timeText = timeAgo(createdAt);

	const mediaHtml = createMediaHtml(post, authorName);

	return `
		<article class="post-card" data-post-id="${escapeHtml(postId)}"${authorId.length > 0 ? ` data-author-id="${escapeHtml(authorId)}"` : ""}>
			<header class="post-header">
				<div class="post-author">
					<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="Avatar ${escapeHtml(authorName)}">
					<div class="post-meta">
						<div class="post-meta-row">
							<h3>${escapeHtml(authorName)}${timeText ? `<span class="post-time"> &bull; ${escapeHtml(timeText)}</span>` : ""}</h3>
						</div>
						${(province || topic || address) ? `
						<div class="post-tags-inline">
							${province ? `<span class="post-tag-chip"><i class="bx bx-map"></i><span>${escapeHtml(province)}</span></span>` : ""}
							${topic ? `<span class="post-tag-chip"><i class="bx bx-category"></i><span>${escapeHtml(topic)}</span></span>` : ""}
							${address ? `<span class="post-tag-chip"><i class="bx bx-current-location"></i><span>${escapeHtml(address)}</span></span>` : ""}
						</div>
						` : ""}
					</div>
				</div>

				<div class="post-menu-wrap">
					<button class="post-menu-btn" type="button" aria-label="Tùy chọn bài đăng">
						<i class="bx bx-dots-horizontal-rounded"></i>
					</button>
					<div class="post-dropdown-menu">
						${isPostOwner(authorId) ? `
						<button class="post-dropdown-item post-dropdown-item--edit" type="button" data-action="edit-post" data-post-id="${escapeHtml(postId)}">
							<i class="bx bx-edit"></i>
							<span>Chỉnh sửa</span>
						</button>
						<button class="post-dropdown-item post-dropdown-item--delete" type="button" data-action="delete-post" data-post-id="${escapeHtml(postId)}">
							<i class="bx bx-trash"></i>
							<span>Xóa</span>
						</button>
						` : `
						<button class="post-dropdown-item" type="button" data-action="report-post" data-post-id="${escapeHtml(postId)}">
							<i class="bx bx-flag"></i>
							<span>Báo cáo</span>
						</button>
						`}
					</div>
				</div>
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
				<p class="caption"><strong>${escapeHtml(authorName)}</strong>${escapeHtml(content)}</p>
			</footer>
		</article>
	`;
};

const renderPosts = (posts, shouldReplace = false) => {
	if (!feedPostListElement) {
		return;
	}

	const html = posts.map(createPostCardHtml).join("");

	if (shouldReplace) {
		feedPostListElement.innerHTML = html;
		syncEmptyState();
		return;
	}

	feedPostListElement.insertAdjacentHTML("beforeend", html);
	syncEmptyState();
};

const renderSelectOptions = (selectElement, options) => {
	if (!selectElement) {
		return;
	}

	const safeOptions = Array.isArray(options) ? options : [];

	const optionHtml = safeOptions
		.map((option) => {
			const code = normalizeString(option?.code);
			const name = normalizeString(option?.name);

			if (code.length === 0 || name.length === 0) {
				return "";
			}

			return `<option value="${escapeHtml(code)}">${escapeHtml(name)}</option>`;
		})
		.join("");

	if (optionHtml) {
		selectElement.innerHTML = optionHtml;
	}
};

const appendUniquePosts = (incomingPosts, shouldReset) => {
	const safeIncomingPosts = Array.isArray(incomingPosts) ? incomingPosts : [];

	if (shouldReset) {
		feedState.posts = safeIncomingPosts;
		renderPosts(feedState.posts, true);
		return safeIncomingPosts;
	}

	const existingPostIds = new Set(
		feedState.posts.map((post) => normalizeString(post?.id)).filter((id) => id.length > 0)
	);

	const uniquePosts = safeIncomingPosts.filter((post) => {
		const postId = normalizeString(post?.id);

		if (postId.length === 0) {
			return true;
		}

		if (existingPostIds.has(postId)) {
			return false;
		}

		existingPostIds.add(postId);
		return true;
	});

	feedState.posts = feedState.posts.concat(uniquePosts);
	renderPosts(uniquePosts, false);
	return uniquePosts;
};

const prependPost = (post) => {
	if (!feedPostListElement || !post || typeof post !== "object") {
		return;
	}

	const incomingPostId = normalizeString(post.id);

	if (incomingPostId.length > 0) {
		const existingCard = feedPostListElement.querySelector(
			`[data-post-id="${toCssSelectorValue(incomingPostId)}"]`
		);

		if (existingCard) {
			existingCard.remove();
		}
	}

	feedState.posts = [post].concat(
		feedState.posts.filter((existingPost) => normalizeString(existingPost?.id) !== incomingPostId)
	);

	feedPostListElement.insertAdjacentHTML("afterbegin", createPostCardHtml(post));
	syncEmptyState();
};

/**
 * Tìm post trong feedState.posts theo postId.
 * @param {string} postId
 * @returns {object|undefined}
 */
const findPostById = (postId) => {
	const safeId = normalizeString(postId);
	if (safeId.length === 0) return undefined;
	return feedState.posts.find((p) => normalizeString(p?.id) === safeId);
};

/**
 * Mở modal chỉnh sửa bài đăng. Tìm post data từ feedState, nếu không có thì dùng fallback.
 * @param {string|object} postOrId - postId hoặc object post đầy đủ
 */
const openEditModal = (postOrId) => {
	if (!createPostModalController) return;

	const postData = typeof postOrId === "object" && postOrId !== null
		? postOrId
		: findPostById(postOrId);

	if (!postData) {
		console.warn("[feed] openEditModal: không tìm thấy post", postOrId);
		return;
	}

	createPostModalController.openEdit(postData);
};

/**
 * Đọc trạng thái like mới nhất của một bài viết từ DOM.
 * Được cập nhật bởi post-interactions.js qua data-attribute sau mọi lần toggle like.
 * Trả về object merge với post gốc, đảm bảo comment-modal luôn nhận dữ liệu mới nhất.
 */
const readLatestPostDataFromDom = (post) => {
	const postId = normalizeString(post?.id);
	if (postId.length === 0) return post;

	const postCard = feedPostListElement?.querySelector(
		`[data-post-id="${toCssSelectorValue(postId)}"]`
	);
	if (!postCard) return post;

	// Đọc data-attribute mà post-interactions.js đã ghi sau mọi toggle
	const domIsLiked = postCard.dataset.isLiked;
	const domNewLikeCount = postCard.dataset.newLikeCount;

	return {
		...post,
		...(domIsLiked !== undefined ? { isLiked: domIsLiked === "true" } : {}),
		...(domNewLikeCount !== undefined
			? { newLikeCount: normalizeNumber(domNewLikeCount, post.newLikeCount ?? 0) }
			: {}),
	};
};


const resolveFeedRequest = (lastId, provinceCode, topicCode) => {
	if (feedState.feedMode === FEED_MODE_FOLLOWING) {
		return feedApi.getFollowingFeed(lastId, provinceCode, topicCode);
	}

	return feedApi.getExploreFeed(lastId, provinceCode, topicCode);
};

const loadFeed = async (shouldReset = false) => {
	if (feedState.isLoading) {
		return;
	}

	if (!shouldReset && !feedState.hasMore) {
		return;
	}

	feedState.isLoading = true;
	setStatus(shouldReset ? "Đang tải bảng tin..." : "Đang tải thêm bài viết...");

	const requestId = ++feedState.requestSequence;
	const requestLastId = shouldReset ? "" : feedState.lastId;

	try {
		const response = await resolveFeedRequest(requestLastId, feedState.provinceCode, feedState.topicCode);

		if (requestId !== feedState.requestSequence) {
			return;
		}

		const receivedPosts = Array.isArray(response?.data?.postList)
			? response.data.postList
			: (Array.isArray(response?.postList) ? response.postList : []);
		const receivedLastId = normalizeString(response?.data?.respLastPostId || response?.respLastPostId);
		const hasMore = response?.data?.hasMore !== undefined ? response.data.hasMore : response?.hasMore;
		const appendedPosts = appendUniquePosts(receivedPosts, shouldReset);

		feedState.lastId = receivedLastId;
		feedState.hasMore = hasMore === true;

		if (feedState.posts.length === 0) {
			setStatus("Không có bài viết phù hợp với bộ lọc hiện tại.");
			return;
		}

		if (appendedPosts.length === 0 || !feedState.hasMore) {
			setStatus("Đã tải hết bài đăng.");
			return;
		}

		clearStatus();
	} catch (error) {
		if (requestId !== feedState.requestSequence) {
			return;
		}

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

const handleScrollToBottom = () => {
	if (feedState.isLoading || !feedState.hasMore) {
		return;
	}

	const currentScroll = window.innerHeight + window.scrollY;
	const scrollBottom = document.documentElement.scrollHeight - SCROLL_BOTTOM_THRESHOLD;

	if (currentScroll >= scrollBottom) {
		void loadFeed(false);
	}
};

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

// Chức năng Lưu bài viết (Save) đã được loại bỏ theo quyết định sản phẩm.

// handleCreatePostSubmit đã được chuyển vào create-post-modal.js.
// feed.js chỉ cần truyền onPublish callback để prepend bài mới vào danh sách.

const updateFeedTabs = () => {
	if (!feedTabExploreElement || !feedTabFollowingElement) {
		return;
	}

	const isExploreMode = feedState.feedMode === FEED_MODE_EXPLORE;

	feedTabExploreElement.classList.toggle("is-active", isExploreMode);
	feedTabExploreElement.setAttribute("aria-selected", isExploreMode ? "true" : "false");

	feedTabFollowingElement.classList.toggle("is-active", !isExploreMode);
	feedTabFollowingElement.setAttribute("aria-selected", !isExploreMode ? "true" : "false");
};

const changeFeedMode = async (mode) => {
	if (mode !== FEED_MODE_EXPLORE && mode !== FEED_MODE_FOLLOWING) {
		return;
	}

	if (feedState.feedMode === mode) {
		return;
	}

	feedState.feedMode = mode;
	updateFeedTabs();
	await reloadFeedWithFilters();
};

const closeAllPostMenus = (exceptWrap = null) => {
	if (!feedPostListElement) {
		return;
	}

	feedPostListElement.querySelectorAll(".post-menu-wrap.open").forEach((menuWrap) => {
		if (menuWrap !== exceptWrap) {
			menuWrap.classList.remove("open");
		}
	});
};

// ---------------------------------------------------------------------------
// Report Reasons — render động và cache
// ---------------------------------------------------------------------------

/**
 * Render danh sách lý do báo cáo vào #report-reasons-container.
 * @param {Array<{code: string, reason: string}>} reasons
 */
const renderReportReasons = (reasons) => {
	if (!reportReasonsContainerElement) return;

	const html = reasons.map((item) => {
		const code = escapeHtml(normalizeString(item?.code));
		const reason = escapeHtml(normalizeString(item?.reason));
		if (code.length === 0 || reason.length === 0) return "";

		return `<label class="report-reason-option">
			<input type="radio" name="report-reason" value="${code}">
			<span>${reason}</span>
		</label>`;
	}).join("");

	reportReasonsContainerElement.innerHTML = html || `<p class="report-reasons-error">Không có lý do nào được tải.</p>`;
};

/**
 * Lấy danh sách lý do báo cáo từ API, sử dụng cache để tránh gọi lại khi đã có data.
 * Hiển thị spinner trong quá trình tải.
 */
const loadReportReasons = async () => {
	if (!reportReasonsContainerElement) return;

	// Nếu đã có cache — render ngay, không gọi API
	if (Array.isArray(reportReasonsCache) && reportReasonsCache.length > 0) {
		renderReportReasons(reportReasonsCache);
		return;
	}

	// Hiển thị spinner loading
	reportReasonsContainerElement.innerHTML = `
		<div id="report-reasons-loading" class="report-reasons-loading">
			<span class="report-reasons-spinner" aria-label="Đang tải..."></span>
			<span>Đang tải lý do...</span>
		</div>`;

	try {
		const response = await postApi.getReportReasons();
		const reasons = Array.isArray(response?.data?.reportReasons)
			? response.data.reportReasons
			: [];

		reportReasonsCache = reasons; // Lưu cache
		renderReportReasons(reasons);
	} catch (error) {
		console.error("[feed] loadReportReasons error:", error);
		reportReasonsContainerElement.innerHTML = `<p class="report-reasons-error">Đã có lỗi khi tải danh sách lý do. Vui lòng thử lại.</p>`;
	}
};

const openReportModal = (postId) => {
	if (!reportPostModalElement || !reportPostFormElement) {
		return;
	}

	reportState.activePostId = normalizeString(postId);
	reportState.isSubmitting = false;

	reportPostFormElement.reset();
	clearReportFeedback();
	reportPostSubmitButton && (reportPostSubmitButton.disabled = false);

	// Load lý do báo cáo động (có cache — gọi API tối đa 1 lần trong suốt phiên)
	void loadReportReasons();

	reportPostModalElement.classList.remove("is-hidden");
	reportPostModalElement.setAttribute("aria-hidden", "false");
	document.body.style.overflow = "hidden";
};

const closeReportModal = () => {
	if (!reportPostModalElement) {
		return;
	}

	reportPostModalElement.classList.add("is-hidden");
	reportPostModalElement.setAttribute("aria-hidden", "true");
	reportState.activePostId = "";
	reportState.isSubmitting = false;
	clearReportFeedback();
	document.body.style.overflow = "";
};

const submitReportPost = async () => {
	if (!reportPostFormElement || reportState.isSubmitting) {
		return;
	}

	const reasonInput = reportPostFormElement.querySelector('input[name="report-reason"]:checked');
	const reasonCode = normalizeString(reasonInput?.value);

	if (reasonCode.length === 0) {
		setReportFeedback("Vui lòng chọn lý do báo cáo.");
		return;
	}

	if (reportState.activePostId.length === 0) {
		setReportFeedback("Không xác định được bài đăng cần báo cáo.");
		return;
	}

	reportState.isSubmitting = true;
	if (reportPostSubmitButton) {
		reportPostSubmitButton.disabled = true;
		reportPostSubmitButton.textContent = "Đang gửi...";
	}

	clearReportFeedback();

	try {
		const response = await postApi.reportPost(reportState.activePostId, reasonCode);
		// HTTP 201 — thành công
		const successMsg = normalizeString(response?.message) || "Báo cáo thành công.";
		showToast(successMsg, "success");

		window.setTimeout(() => {
			closeReportModal();
		}, 550);
	} catch (error) {
		// HTTP 404 hoặc 409 — dùng chính xác message từ API
		const errMsg = toMessage(error, "Không thể gửi báo cáo. Vui lòng thử lại.");
		showToast(errMsg, "error");
	} finally {
		reportState.isSubmitting = false;
		if (reportPostSubmitButton) {
			reportPostSubmitButton.disabled = false;
			reportPostSubmitButton.textContent = "G\u1eedi";
		}
	}
};

/**
 * Xử lý xóa bài đăng từ Feed.
 * @param {string} postId - ID bài đăng cần xóa.
 * @param {HTMLElement} triggerBtn - Nút đã kích hoạt hành động (để disable/enable lại).
 */
const handleDeletePost = async (postId, triggerBtn = null) => {
	if (!postId) return;

	// 1. Xác nhận với người dùng
	const confirmed = window.confirm(
		"Bạn có chắc chắn muốn xóa bài viết này? Hành động này không thể hoàn tác."
	);
	if (!confirmed) return;

	// 2. Loading state — disable nút để tránh spam
	if (triggerBtn) {
		triggerBtn.disabled = true;
	}

	try {
		// 3. Gọi API
		await postApi.deletePost(postId);

		// 4. Thành công — hiển thị thông báo và điều hướng về trang cá nhân
		alert("Xóa bài thành công.");
		window.setTimeout(() => {
			window.location.href = "profile.html";
		}, 1000);
	} catch (error) {
		// 5. Thất bại — hiển thị lỗi, giữ nguyên trang, khôi phục nút
		const message = toMessage(error, "Xóa bài thất bại. Vui lòng thử lại.");
		alert(message);

		if (triggerBtn) {
			triggerBtn.disabled = false;
		}
	}
};

const initFeedPage = () => {
	provinceSelectElement = document.getElementById("province-filter");
	topicSelectElement = document.getElementById("topic-filter");
	feedPostListElement = document.getElementById("feed-post-list");
	feedEmptyStateElement = document.getElementById("feed-empty-state");
	feedStatusElement = document.getElementById("feed-status");
	feedTabExploreElement = document.getElementById("feed-tab-explore");
	feedTabFollowingElement = document.getElementById("feed-tab-following");
	reportPostModalElement = document.getElementById("report-post-modal");
	reportPostFormElement = document.getElementById("report-post-form");
	reportPostCloseButton = document.getElementById("report-post-close");
	reportPostCancelButton = document.getElementById("report-post-cancel");
	reportPostSubmitButton = document.getElementById("report-post-submit");
	reportPostFeedbackElement = document.getElementById("report-post-feedback");
	reportReasonsContainerElement = document.getElementById("report-reasons-container");

	if (!provinceSelectElement || !topicSelectElement || !feedPostListElement || !feedEmptyStateElement || !feedStatusElement) {
		return;
	}

	createPostModalController = initCreatePostModal({
		closeOnPublish: true,
		onPublish: (createdPost) => {
			prependPost(createdPost);
			setStatus("Đăng bài thành công.", "success");
		},
		/**
		 * Callback sau khi sửa bài thành công.
		 * API chỉ trả về message, không có post object mới.
		 * → Lấy post hiện tại trong state, cập nhật các field text, rồi re-render card.
		 */
		onUpdate: (editedPostId) => {
			setStatus("Cập nhật bài viết thành công.", "success");
			// Reload feed để lấy dữ liệu mới nhất từ server
			void reloadFeedWithFilters();
		}
	});
	commentModalController = initCommentModal({
		onEditRequest: (post) => openEditModal(post)
	});
	initPostInteractions();

	feedPostListElement.addEventListener("click", (event) => {
		const menuButton = event.target.closest(".post-menu-btn");
		if (menuButton) {
			event.preventDefault();
			event.stopPropagation();

			const menuWrap = menuButton.closest(".post-menu-wrap");
			if (!menuWrap) {
				return;
			}

			const shouldOpen = !menuWrap.classList.contains("open");
			closeAllPostMenus();
			if (shouldOpen) {
				menuWrap.classList.add("open");
			}

			return;
		}

		const reportActionButton = event.target.closest('[data-action="report-post"]');
		if (reportActionButton) {
			event.preventDefault();
			event.stopPropagation();

			const postId = normalizeString(reportActionButton.dataset.postId);
			closeAllPostMenus();
			openReportModal(postId);
			return;
		}

		const editActionButton = event.target.closest('[data-action="edit-post"]');
		if (editActionButton) {
			event.preventDefault();
			event.stopPropagation();

			const postId = normalizeString(editActionButton.dataset.postId);
			closeAllPostMenus();
			openEditModal(postId);
			return;
		}

		const deleteActionButton = event.target.closest('[data-action="delete-post"]');
		if (deleteActionButton) {
			event.preventDefault();
			event.stopPropagation();

			const postId = normalizeString(deleteActionButton.dataset.postId);
			closeAllPostMenus();
			void handleDeletePost(postId, deleteActionButton);
			return;
		}


		const commentButton = event.target.closest(".post-comment-btn");
		if (commentButton && feedPostListElement.contains(commentButton)) {
			event.preventDefault();
			const postCard = commentButton.closest(".post-card");
			const postId = postCard?.dataset.postId;
			if (postId) {
				const post = feedState.posts.find(p => normalizeString(p?.id) === normalizeString(postId));
				if (post && commentModalController) {
					// Đọc lại trạng thái mới nhất từ DOM trước khi mở modal
					// Đảm bảo modal không dùng dữ liệu cũ (stale) từ thời điểm load feed
					commentModalController.open(readLatestPostDataFromDom(post));
				}
			}
			return;
		}
	});

	provinceSelectElement.addEventListener("change", () => {
		void reloadFeedWithFilters();
	});

	topicSelectElement.addEventListener("change", () => {
		void reloadFeedWithFilters();
	});

	feedTabExploreElement?.addEventListener("click", () => {
		void changeFeedMode(FEED_MODE_EXPLORE);
	});

	feedTabFollowingElement?.addEventListener("click", () => {
		void changeFeedMode(FEED_MODE_FOLLOWING);
	});

	reportPostFormElement?.addEventListener("submit", (event) => {
		event.preventDefault();
		void submitReportPost();
	});

	reportPostCloseButton?.addEventListener("click", closeReportModal);
	reportPostCancelButton?.addEventListener("click", closeReportModal);
	reportPostModalElement?.addEventListener("click", (event) => {
		if (event.target === reportPostModalElement) {
			closeReportModal();
		}
	});



	document.addEventListener("click", (event) => {
		if (!event.target.closest(".post-menu-wrap")) {
			closeAllPostMenus();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeAllPostMenus();
			closeReportModal();
		}
	});

	window.addEventListener("scroll", handleScrollToBottom, { passive: true });

	// Carousel handler đã được đăng ký bởi initCreatePostModal() ở trên.

	// Lắng nghe CustomEvent từ post-interactions.js để đồng bộ feedState.posts
	// (in-memory state) sau mọi lần toggle like — giải quyết stale data khi mở modal lần sau.
	document.addEventListener("postLikeUpdated", (event) => {
		const { postId, newLikeCount, isLiked } = event.detail ?? {};
		const safePostId = normalizeString(postId);
		if (safePostId.length === 0) return;

		feedState.posts = feedState.posts.map((post) => {
			if (normalizeString(post?.id) !== safePostId) return post;

			return {
				...post,
				isLiked: Boolean(isLiked),
				...(newLikeCount !== undefined
					? { newLikeCount: normalizeNumber(newLikeCount, 0) }
					: {}),
			};
		});
	});

	updateFeedTabs();
	void Promise.all([loadDropdowns(), loadFeed(true)]);
};

document.addEventListener("DOMContentLoaded", initFeedPage);
