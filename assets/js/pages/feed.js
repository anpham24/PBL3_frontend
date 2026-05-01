"use strict";

import { feedApi } from "../api/feed-api.js";
import { postApi } from "../api/post-api.js";
import { initSidebar } from "../components/sidebar.js";
import { initPostInteractions } from "../components/post-interactions.js";
import { initPostMenus } from "../components/post-menu.js";
import { initCommentModal } from "../components/comment-modal.js";
import { initCreatePostModal } from "../components/create-post-modal.js";

const SCROLL_BOTTOM_THRESHOLD = 220;
const DEFAULT_PUBLISH_LABEL = "Đăng";
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
let createPostModalController;
let commentModalController;
let createPostFormElement;
let createPostFileInputElement;
let createPostContentElement;
let createPostVisibilitySelectElement;
let createPostAddressInputElement;
let createPostFeedbackElement;
let publishPostButtonElement;

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

const setCreatePostFeedback = (message, variant = "error") => {
	if (!createPostFeedbackElement) {
		return;
	}

	createPostFeedbackElement.textContent = message;
	createPostFeedbackElement.classList.remove("is-hidden");
	createPostFeedbackElement.style.color = variant === "error" ? "#dc2626" : "#15803d";
};

const clearCreatePostFeedback = () => {
	if (!createPostFeedbackElement) {
		return;
	}

	createPostFeedbackElement.textContent = "";
	createPostFeedbackElement.classList.add("is-hidden");
	createPostFeedbackElement.style.color = "";
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

const resolvePostMediaUrls = (post) => {
	if (Array.isArray(post?.mediaList)) {
		return post.mediaList.map(m => normalizeString(m?.mediaUrl)).filter(url => url.length > 0);
	}
	let media = post?.media_url || post?.mediaUrl || post?.image_url || post?.imageUrl || post?.media_urls || post?.mediaUrls;
	if (!media) return [];
	if (Array.isArray(media)) {
		return media.map(normalizeString).filter(url => url.length > 0);
	}
	if (typeof media === "string") {
		if (media.includes(",")) {
			return media.split(",").map(url => normalizeString(url)).filter(url => url.length > 0);
		}
		const url = normalizeString(media);
		return url.length > 0 ? [url] : [];
	}
	return [];
};

const createMediaHtml = (post, authorName) => {
	const mediaUrls = resolvePostMediaUrls(post);
	if (mediaUrls.length === 0) {
		return "";
	}

	if (mediaUrls.length === 1) {
		const mediaUrl = mediaUrls[0];
		if (isVideoUrl(mediaUrl)) {
			return `
				<div class="post-image">
					<video src="${escapeHtml(mediaUrl)}" controls preload="metadata"></video>
				</div>
			`;
		}
		return `<img class="post-image" src="${escapeHtml(mediaUrl)}" alt="Bài viết của ${escapeHtml(authorName)}">`;
	}

	const carouselItems = mediaUrls.map((url, index) => {
		if (isVideoUrl(url)) {
			return `
				<div class="carousel-item">
					<video src="${escapeHtml(url)}" controls preload="metadata"></video>
				</div>
			`;
		}
		return `
			<div class="carousel-item">
				<img src="${escapeHtml(url)}" alt="Bài viết của ${escapeHtml(authorName)} - phần ${index + 1}">
			</div>
		`;
	}).join("");

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
	const authorName = normalizeString(post?.authorName || post?.author_name || post?.username) || "Người dùng";
	const avatarUrl =
		normalizeString(post?.avtUrl || post?.avt_url || post?.avatar_url || post?.avatar) ||
		"https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=96&q=60";
	const content = normalizeString(post?.content || post?.caption);
	const isLiked = isTruthyLike(post?.is_liked);
	const isSaved = isTruthyLike(post?.is_saved || post?.isSaved);
	const likeCount = normalizeNumber(post?.likeCount || post?.like_count, 0);
	const commentCount = normalizeNumber(post?.commentCount || post?.comment_count, 0);
	const address = normalizeString(post?.address || post?.location);
	const province = normalizeString(post?.province);
	const topic = normalizeString(post?.topic);
	const createdAt = normalizeString(post?.createAt || post?.create_at || post?.created_at);
	const timeText = timeAgo(createdAt);

	const mediaHtml = createMediaHtml(post, authorName);

	return `
		<article class="post-card" data-post-id="${escapeHtml(postId)}">
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
						<button class="post-dropdown-item" type="button" data-action="report-post" data-post-id="${escapeHtml(postId)}">
							<i class="bx bx-flag"></i>
							<span>Báo cáo</span>
						</button>
					</div>
				</div>
			</header>

			${mediaHtml}

			<div class="post-actions">
				<div class="left-actions">
					<button class="post-action-btn post-like-btn${isLiked ? " is-liked" : ""}" type="button" aria-label="${isLiked ? "Bỏ tim bài viết" : "Thả tim bài viết"}">
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

const setLikeButtonVisualState = (likeButton, isLiked) => {
	if (!likeButton) {
		return;
	}

	const liked = Boolean(isLiked);
	const iconElement = likeButton.querySelector("i");

	likeButton.classList.toggle("is-liked", liked);
	likeButton.setAttribute("aria-label", liked ? "Bỏ tim bài viết" : "Thả tim bài viết");

	if (!iconElement) {
		return;
	}

	iconElement.classList.toggle("bx-heart", !liked);
	iconElement.classList.toggle("bxs-heart", liked);
};

const updatePostLikeState = (postId, newLikeCount, isLiked) => {
	const safePostId = normalizeString(postId);
	if (safePostId.length === 0) {
		return;
	}

	const normalizedLikeCount = normalizeNumber(newLikeCount, 0);
	const normalizedIsLiked = Boolean(isLiked);

	const postCard = feedPostListElement?.querySelector(`[data-post-id="${toCssSelectorValue(safePostId)}"]`);
	if (postCard) {
		const likeButton = postCard.querySelector(".post-like-btn");
		const likeCountElements = postCard.querySelectorAll('[data-role="like-count"]');

		setLikeButtonVisualState(likeButton, normalizedIsLiked);

		likeCountElements.forEach((el) => {
			el.textContent = formatCompactNumber(normalizedLikeCount);
		});
	}

	const modalLikeBtn = document.getElementById("btn-like-comment-modal");
	if (modalLikeBtn && normalizeString(modalLikeBtn.dataset.postId) === safePostId) {
		setLikeButtonVisualState(modalLikeBtn, normalizedIsLiked);
		const modalLikeCount = document.getElementById("comment-modal-like-count");
		if (modalLikeCount) {
			modalLikeCount.textContent = formatCompactNumber(normalizedLikeCount);
		}
	}

	feedState.posts = feedState.posts.map((post) => {
		if (normalizeString(post?.id) !== safePostId) {
			return post;
		}

		return {
			...post,
			like_count: normalizedLikeCount,
			is_liked: normalizedIsLiked
		};
	});
};

const setSaveButtonVisualState = (saveButton, isSaved) => {
	if (!saveButton) {
		return;
	}

	const saved = Boolean(isSaved);
	const iconElement = saveButton.querySelector("i");

	saveButton.classList.toggle("is-saved", saved);
	saveButton.setAttribute("aria-label", saved ? "Bỏ lưu bài viết" : "Lưu bài viết");

	if (!iconElement) {
		return;
	}

	iconElement.classList.toggle("bx-bookmark", !saved);
	iconElement.classList.toggle("bxs-bookmark", saved);
};

const updatePostSaveState = (postId, isSaved) => {
	const safePostId = normalizeString(postId);
	if (safePostId.length === 0) {
		return;
	}

	const normalizedIsSaved = Boolean(isSaved);

	const postCard = feedPostListElement?.querySelector(`[data-post-id="${toCssSelectorValue(safePostId)}"]`);
	if (postCard) {
		const saveButton = postCard.querySelector(".post-save-btn");
		setSaveButtonVisualState(saveButton, normalizedIsSaved);
	}

	feedState.posts = feedState.posts.map((post) => {
		if (normalizeString(post?.id) !== safePostId) {
			return post;
		}

		return {
			...post,
			is_saved: normalizedIsSaved
		};
	});
};

const handleLikeButtonClick = async (likeButton) => {
	const postCard = likeButton?.closest(".post-card");
	let postId = normalizeString(postCard?.dataset.postId);

	if (postId.length === 0) {
		postId = normalizeString(likeButton.dataset.postId);
	}

	if (postId.length === 0 || likeButton.dataset.loading === "true") {
		return;
	}

	likeButton.dataset.loading = "true";
	likeButton.disabled = true;

	try {
		const response = await postApi.toggleLike(postId);
		const post = feedState.posts.find(p => normalizeString(p?.id) === postId);
		const currentLikeCount = normalizeNumber(post?.like_count || post?.likeCount, 0);

		const resolvedLikeCount = normalizeNumber(response?.data?.new_like_count, currentLikeCount);
		const resolvedIsLiked =
			typeof response?.data?.is_liked === "boolean"
				? response.data.is_liked
				: likeButton.classList.contains("is-liked");

		updatePostLikeState(postId, resolvedLikeCount, resolvedIsLiked);
	} catch (error) {
		setStatus(toMessage(error, "Không thể cập nhật lượt thích. Vui lòng thử lại."), "error");
	} finally {
		delete likeButton.dataset.loading;
		likeButton.disabled = false;
	}
};

const handleSaveButtonClick = async (saveButton) => {
	const postCard = saveButton?.closest(".post-card");
	const postId = normalizeString(postCard?.dataset.postId);

	if (postId.length === 0 || saveButton.dataset.loading === "true") {
		return;
	}

	const wasSaved = saveButton.classList.contains("is-saved");
	const nextSaved = !wasSaved;

	saveButton.dataset.loading = "true";
	saveButton.disabled = true;
	setSaveButtonVisualState(saveButton, nextSaved);

	try {
		await postApi.savePost(postId, nextSaved);
		updatePostSaveState(postId, nextSaved);
	} catch (error) {
		setSaveButtonVisualState(saveButton, wasSaved);
		setStatus(toMessage(error, "Không thể lưu bài viết. Vui lòng thử lại."), "error");
	} finally {
		delete saveButton.dataset.loading;
		saveButton.disabled = false;
	}
};

const setPublishSubmittingState = (isSubmitting) => {
	if (!publishPostButtonElement) {
		return;
	}

	publishPostButtonElement.disabled = isSubmitting;

	if (isSubmitting) {
		publishPostButtonElement.innerHTML =
			'<span class="btn-spinner" aria-hidden="true"></span><span>Đang đăng...</span>';
		return;
	}

	publishPostButtonElement.textContent = DEFAULT_PUBLISH_LABEL;
};

const buildCreatePostFormData = ({ files, visibility, content, address }) => {
	const formData = new FormData();

	files.forEach((file) => {
		formData.append("files", file);
	});

	formData.append("visibility", visibility);
	formData.append("content", content);
	formData.append("address", address);

	return formData;
};

const handleCreatePostSubmit = async () => {
	if (!createPostFileInputElement || !createPostContentElement) {
		return;
	}

	clearCreatePostFeedback();

	const selectedFiles = Array.from(createPostFileInputElement.files || []).filter((file) => {
		if (!(file instanceof File)) {
			return false;
		}

		return file.type.startsWith("image/") || file.type.startsWith("video/");
	});

	if (selectedFiles.length === 0) {
		setCreatePostFeedback("Vui lòng chọn ít nhất một ảnh hoặc video để đăng bài.");
		return;
	}

	const address = normalizeString(createPostAddressInputElement?.value);
	if (address.length === 0) {
		setCreatePostFeedback("Vui lòng nhập địa chỉ cụ thể cho bài đăng.");
		return;
	}

	const payload = {
		files: selectedFiles,
		visibility: normalizeString(createPostVisibilitySelectElement?.value) || "PUBLIC",
		content: normalizeString(createPostContentElement.value),
		address
	};

	setPublishSubmittingState(true);

	try {
		const response = await postApi.createPost(buildCreatePostFormData(payload));
		const createdPost = response?.data?.post || response?.data;

		if (createdPost && typeof createdPost === "object") {
			prependPost(createdPost);
		}

		setStatus("Đăng bài thành công.", "success");
		createPostModalController?.close();
	} catch (error) {
		setCreatePostFeedback(toMessage(error, "Đăng bài thất bại. Vui lòng thử lại."));
	} finally {
		setPublishSubmittingState(false);
	}
};

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

const openReportModal = (postId) => {
	if (!reportPostModalElement || !reportPostFormElement) {
		return;
	}

	reportState.activePostId = normalizeString(postId);
	reportState.isSubmitting = false;

	reportPostFormElement.reset();
	clearReportFeedback();
	reportPostSubmitButton && (reportPostSubmitButton.disabled = false);

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
		await postApi.reportPost(reportState.activePostId, reasonCode);
		setReportFeedback("Đã gửi báo cáo thành công.", "success");
		setStatus("Đã gửi báo cáo bài đăng.", "success");

		window.setTimeout(() => {
			closeReportModal();
		}, 550);
	} catch (error) {
		setReportFeedback(toMessage(error, "Không thể gửi báo cáo. Vui lòng thử lại."));
	} finally {
		reportState.isSubmitting = false;
		if (reportPostSubmitButton) {
			reportPostSubmitButton.disabled = false;
			reportPostSubmitButton.textContent = "Gửi";
		}
	}
};

const initFeedPage = () => {
	initSidebar();
	initCreatePostModal();
	initCommentModal(".post-list");
	initPostInteractions();
	initPostMenus();
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

	if (!provinceSelectElement || !topicSelectElement || !feedPostListElement || !feedEmptyStateElement || !feedStatusElement) {
		return;
	}

	createPostModalController = initCreatePostModal({ closeOnPublish: false });
	commentModalController = initCommentModal();
	createPostFormElement = document.getElementById("create-post-form");
	createPostFileInputElement = createPostModalController?.elements?.postFileInput ?? null;
	createPostContentElement = createPostModalController?.elements?.postCaptionInput ?? null;
	createPostVisibilitySelectElement = createPostModalController?.elements?.createPostVisibilityInput ?? null;
	createPostAddressInputElement = createPostModalController?.elements?.createPostAddressInput ?? null;
	createPostFeedbackElement = createPostModalController?.elements?.createPostFeedbackElement ?? null;
	publishPostButtonElement = createPostModalController?.elements?.publishPostBtn ?? null;

	createPostFormElement?.addEventListener("submit", (event) => {
		event.preventDefault();
		void handleCreatePostSubmit();
	});

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

		const likeButton = event.target.closest(".post-like-btn");
		if (likeButton && feedPostListElement.contains(likeButton)) {
			event.preventDefault();
			void handleLikeButtonClick(likeButton);
			return;
		}

		const saveButton = event.target.closest(".post-save-btn");
		if (saveButton && feedPostListElement.contains(saveButton)) {
			event.preventDefault();
			void handleSaveButtonClick(saveButton);
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
					commentModalController.open(post);
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

	const commentModalEl = document.getElementById("comment-modal");
	commentModalEl?.addEventListener("click", (event) => {
		const likeButton = event.target.closest(".post-like-btn");
		if (likeButton) {
			event.preventDefault();
			void handleLikeButtonClick(likeButton);
			return;
		}

		const reportActionButton = event.target.closest('[data-action="report-post"]');
		if (reportActionButton) {
			event.preventDefault();
			event.stopPropagation();
			const postId = normalizeString(reportActionButton.dataset.postId);
			closeAllPostMenus();
			openReportModal(postId);
			const menuWrap = reportActionButton.closest(".post-menu-wrap");
			if (menuWrap) menuWrap.classList.remove("open");
			return;
		}

		const menuButton = event.target.closest(".post-menu-btn");
		if (menuButton) {
			event.preventDefault();
			event.stopPropagation();
			const menuWrap = menuButton.closest(".post-menu-wrap");
			if (!menuWrap) return;
			const shouldOpen = !menuWrap.classList.contains("open");
			closeAllPostMenus();
			if (shouldOpen) {
				menuWrap.classList.add("open");
			}
			return;
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

	document.addEventListener("click", (event) => {
		const prevBtn = event.target.closest(".carousel-btn.prev-btn");
		const nextBtn = event.target.closest(".carousel-btn.next-btn");

		if (prevBtn) {
			const carousel = prevBtn.closest(".post-media-carousel, .draft-preview-carousel");
			const inner = carousel.querySelector(".carousel-inner, .draft-preview-inner");
			if (inner) inner.scrollBy({ left: -inner.clientWidth, behavior: "smooth" });
		} else if (nextBtn) {
			const carousel = nextBtn.closest(".post-media-carousel, .draft-preview-carousel");
			const inner = carousel.querySelector(".carousel-inner, .draft-preview-inner");
			if (inner) inner.scrollBy({ left: inner.clientWidth, behavior: "smooth" });
		}
	});

	updateFeedTabs();
	void Promise.all([loadDropdowns(), loadFeed(true)]);
};

document.addEventListener("DOMContentLoaded", initFeedPage);
