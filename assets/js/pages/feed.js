"use strict";

import { feedApi } from "../api/feed-api.js";
import { postApi } from "../api/post-api.js";
import { initCreatePostModal } from "./create-post-modal.js";

const SCROLL_BOTTOM_THRESHOLD = 220;
const DEFAULT_PUBLISH_LABEL = "Đăng";

const feedState = {
	posts: [],
	lastId: "",
	provinceCode: "",
	topicCode: "",
	hasMore: true,
	isLoading: false,
	requestSequence: 0
};

let provinceSelectElement;
let topicSelectElement;
let feedPostListElement;
let feedEmptyStateElement;
let feedStatusElement;
let createPostModalController;
let createPostFormElement;
let createPostFileInputElement;
let createPostContentElement;
let createPostProvinceSelectElement;
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

const escapeHtml = (value) => {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#039;");
};

const toCssSelectorValue = (value) => {
	const safeValue = normalizeString(value);

	if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
		return CSS.escape(safeValue);
	}

	return safeValue.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
};

const formatLikeCount = (likeCount) => {
	return new Intl.NumberFormat("vi-VN").format(normalizeNumber(likeCount, 0));
};

const isVideoUrl = (url) => /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);

const isTruthyLike = (value) => value === true || value === "true" || value === 1 || value === "1";

const setStatus = (message, variant = "info") => {
	if (!feedStatusElement) {
		return;
	}

	feedStatusElement.textContent = message;
	feedStatusElement.classList.remove("is-hidden");

	if (variant === "error") {
		feedStatusElement.style.color = "#dc2626";
		return;
	}

	feedStatusElement.style.color = "#4b5563";
};

const clearStatus = () => {
	if (!feedStatusElement) {
		return;
	}

	feedStatusElement.textContent = "";
	feedStatusElement.classList.add("is-hidden");
	feedStatusElement.style.color = "";
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

const syncEmptyState = () => {
	if (!feedEmptyStateElement) {
		return;
	}

	feedEmptyStateElement.classList.toggle("is-hidden", feedState.posts.length > 0);
};

const createMediaHtml = (mediaUrl, authorName) => {
	const safeMediaUrl = normalizeString(mediaUrl);
	if (safeMediaUrl.length === 0) {
		return "";
	}

	if (isVideoUrl(safeMediaUrl)) {
		return `
			<div class="post-image">
				<video src="${escapeHtml(safeMediaUrl)}" controls preload="metadata"></video>
			</div>
		`;
	}

	return `
		<img class="post-image" src="${escapeHtml(safeMediaUrl)}" alt="Bài viết của ${escapeHtml(authorName)}">
	`;
};

const createPostCardHtml = (post) => {
	const postId = normalizeString(post?.id);
	const authorName = normalizeString(post?.author_name) || "Người dùng";
	const avatarUrl = normalizeString(post?.avt_url) || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=96&q=60";
	const content = normalizeString(post?.content) || "";
	const isLiked = isTruthyLike(post?.is_liked);
	const likeCount = normalizeNumber(post?.like_count, 0);
	const mediaHtml = createMediaHtml(post?.media_url, authorName);

	return `
		<article class="post-card" data-post-id="${escapeHtml(postId)}">
			<header class="post-header">
				<div class="post-author">
					<img class="avatar" src="${escapeHtml(avatarUrl)}" alt="Avatar ${escapeHtml(authorName)}">
					<div class="post-meta">
						<div class="post-meta-row">
							<h3>${escapeHtml(authorName)}</h3>
						</div>
					</div>
				</div>
			</header>

			${mediaHtml}

			<div class="post-actions">
				<div class="left-actions">
					<button class="icon-btn post-like-btn${isLiked ? " is-liked" : ""}" type="button" aria-label="${isLiked ? "Bỏ tim bài viết" : "Thả tim bài viết"}">
						<i class="bx ${isLiked ? "bxs-heart" : "bx-heart"}"></i>
					</button>
				</div>
			</div>

			<footer class="post-footer">
				<p class="likes"><span data-role="like-count">${escapeHtml(formatLikeCount(likeCount))}</span> lượt thích</p>
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

const renderSelectOptions = (selectElement, options, defaultLabel) => {
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

	selectElement.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>${optionHtml}`;
};

const toErrorMessage = (error, fallbackMessage) => {
	if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
		return error.data.message.trim();
	}

	if (typeof error?.message === "string" && error.message.trim().length > 0) {
		return error.message.trim();
	}

	return fallbackMessage;
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
		const response = await feedApi.getFeed(requestLastId, feedState.provinceCode, feedState.topicCode);

		if (requestId !== feedState.requestSequence) {
			return;
		}

		const receivedPosts = Array.isArray(response?.data?.posts) ? response.data.posts : [];
		const receivedLastId = normalizeString(response?.data?.last_id);
		const appendedPosts = appendUniquePosts(receivedPosts, shouldReset);

		feedState.lastId = receivedLastId;
		feedState.hasMore = receivedLastId.length > 0 && receivedPosts.length > 0;

		if (feedState.posts.length === 0) {
			setStatus("Không có bài viết phù hợp với bộ lọc hiện tại.");
			return;
		}

		if (appendedPosts.length === 0 || !feedState.hasMore) {
			setStatus("Đã tải hết bài viết.");
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

		setStatus(toErrorMessage(error, "Không thể tải bảng tin. Vui lòng thử lại."), "error");
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

		renderSelectOptions(provinceSelectElement, provinces, "Tất cả tỉnh");
		renderSelectOptions(topicSelectElement, topics, "Tất cả chủ đề");
		renderSelectOptions(createPostProvinceSelectElement, provinces, "Chọn tỉnh");
	} catch (error) {
		setStatus(toErrorMessage(error, "Không tải được dữ liệu bộ lọc."), "error");
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
		const likeCountElement = postCard.querySelector('[data-role="like-count"]');

		setLikeButtonVisualState(likeButton, normalizedIsLiked);

		if (likeCountElement) {
			likeCountElement.textContent = formatLikeCount(normalizedLikeCount);
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

const handleLikeButtonClick = async (likeButton) => {
	const postCard = likeButton?.closest(".post-card");
	const postId = normalizeString(postCard?.dataset.postId);

	if (postId.length === 0 || likeButton.dataset.loading === "true") {
		return;
	}

	likeButton.dataset.loading = "true";
	likeButton.disabled = true;

	try {
		const response = await postApi.toggleLike(postId);
		const currentLikeText = postCard?.querySelector('[data-role="like-count"]')?.textContent;
		const currentLikeCount = normalizeNumber(String(currentLikeText).replace(/[^\d]/g, ""), 0);

		const resolvedLikeCount = normalizeNumber(response?.data?.new_like_count, currentLikeCount);
		const resolvedIsLiked =
			typeof response?.data?.is_liked === "boolean"
				? response.data.is_liked
				: likeButton.classList.contains("is-liked");

		updatePostLikeState(postId, resolvedLikeCount, resolvedIsLiked);
	} catch (error) {
		setStatus(toErrorMessage(error, "Không thể cập nhật lượt thích. Vui lòng thử lại."), "error");
	} finally {
		delete likeButton.dataset.loading;
		likeButton.disabled = false;
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

const buildCreatePostFormData = ({ file, visibility, provinceCode, content, address }) => {
	const formData = new FormData();

	formData.append("file", file);
	formData.append("visibility", visibility);
	formData.append("province_code", provinceCode);
	formData.append("content", content);
	formData.append("address", address);

	return formData;
};

const handleCreatePostSubmit = async () => {
	if (!createPostFileInputElement || !createPostContentElement) {
		return;
	}

	clearCreatePostFeedback();

	const selectedFile = createPostFileInputElement.files?.[0] ?? null;
	if (!selectedFile) {
		setCreatePostFeedback("Vui lòng chọn file ảnh hoặc video để đăng bài.");
		return;
	}

	const provinceCode = normalizeString(createPostProvinceSelectElement?.value);
	if (provinceCode.length === 0) {
		setCreatePostFeedback("Vui lòng chọn tỉnh cho bài đăng.");
		return;
	}

	const payload = {
		file: selectedFile,
		visibility: normalizeString(createPostVisibilitySelectElement?.value) || "PUBLIC",
		provinceCode,
		content: normalizeString(createPostContentElement.value),
		address: normalizeString(createPostAddressInputElement?.value)
	};

	setPublishSubmittingState(true);

	try {
		const response = await postApi.createPost(buildCreatePostFormData(payload));
		const createdPost = response?.data;

		if (createdPost && typeof createdPost === "object") {
			prependPost(createdPost);
		}

		setStatus("Đăng bài thành công.");
		createPostModalController?.close();
	} catch (error) {
		setCreatePostFeedback(toErrorMessage(error, "Đăng bài thất bại. Vui lòng thử lại."));
	} finally {
		setPublishSubmittingState(false);
	}
};

const initFeedPage = () => {
	provinceSelectElement = document.getElementById("province-filter");
	topicSelectElement = document.getElementById("topic-filter");
	feedPostListElement = document.getElementById("feed-post-list");
	feedEmptyStateElement = document.getElementById("feed-empty-state");
	feedStatusElement = document.getElementById("feed-status");

	if (!provinceSelectElement || !topicSelectElement || !feedPostListElement || !feedEmptyStateElement || !feedStatusElement) {
		return;
	}

	createPostModalController = initCreatePostModal({ closeOnPublish: false });
	createPostFormElement = document.getElementById("create-post-form");
	createPostFileInputElement = createPostModalController?.elements?.postFileInput ?? null;
	createPostContentElement = createPostModalController?.elements?.postCaptionInput ?? null;
	createPostProvinceSelectElement = createPostModalController?.elements?.createPostProvinceInput ?? null;
	createPostVisibilitySelectElement = createPostModalController?.elements?.createPostVisibilityInput ?? null;
	createPostAddressInputElement = createPostModalController?.elements?.createPostAddressInput ?? null;
	createPostFeedbackElement = createPostModalController?.elements?.createPostFeedbackElement ?? null;
	publishPostButtonElement = createPostModalController?.elements?.publishPostBtn ?? null;

	createPostFormElement?.addEventListener("submit", (event) => {
		event.preventDefault();
		void handleCreatePostSubmit();
	});

	feedPostListElement.addEventListener("click", (event) => {
		const likeButton = event.target.closest(".post-like-btn");
		if (!likeButton || !feedPostListElement.contains(likeButton)) {
			return;
		}

		event.preventDefault();
		void handleLikeButtonClick(likeButton);
	});

	provinceSelectElement.addEventListener("change", () => {
		void reloadFeedWithFilters();
	});

	topicSelectElement.addEventListener("change", () => {
		void reloadFeedWithFilters();
	});

	window.addEventListener("scroll", handleScrollToBottom, { passive: true });

	void Promise.all([loadDropdowns(), loadFeed(true)]);
};

document.addEventListener("DOMContentLoaded", initFeedPage);
