"use strict";

import { postApi } from "../api/post-api.js";

// ---------------------------------------------------------------------------
// Utility helpers (module-scoped)
// ---------------------------------------------------------------------------

const normalizeString = (value) => {
	if (typeof value !== "string") return "";
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
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

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

const formatCompactNumber = (num) => {
	const n = normalizeNumber(num, 0);
	if (n === 0) return "";
	if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",").replace(",0", "") + "M";
	if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",").replace(",0", "") + "K";
	return n.toString();
};

const isVideoUrl = (url) => /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

/**
 * Giải quyết danh sách media từ dữ liệu bài viết.
 * Trả về mảng các object {url, isVideo, thumbnailUrl}.
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

// Alias giữ backward-compat
const resolvePostMediaUrls = (post) => resolvePostMediaItems(post).map(item => item.url);

// ---------------------------------------------------------------------------
// Comment state (module-scoped — reset mỗi khi mở bài viết mới)
// ---------------------------------------------------------------------------

/** ID bài viết đang hiển thị trong modal */
let currentPostId = null;

/** Cursor: ID bình luận cuối cùng đã tải, null = lần đầu */
let currentLastCmtId = null;

/** Guard chống gọi API đồng thời */
let isLoadingCmts = false;

/** Còn bình luận để tải không */
let hasMoreCmts = true;

// ---------------------------------------------------------------------------
// Comment render helpers
// ---------------------------------------------------------------------------

const COMMENT_LOADING_ID = "cmt-loading-indicator";
const COMMENT_END_ID = "cmt-end-message";
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=96&q=60";

/**
 * Tạo HTML cho một bình luận từ API response.
 */
const createCommentHtml = (comment) => {
	const authorName = escapeHtml(normalizeString(comment.authorName) || "Người dùng");
	const avatarUrl = escapeHtml(normalizeString(comment.avtUrl) || DEFAULT_AVATAR);
	const content = escapeHtml(normalizeString(comment.content));
	const timeText = escapeHtml(timeAgo(normalizeString(comment.createAt)));

	return `
		<div class="comment-item">
			<img class="comment-avatar" src="${avatarUrl}" alt="Avatar ${authorName}">
			<div class="comment-content">
				<p><strong>${authorName}</strong>${content}</p>
				${timeText ? `<span class="comment-time">${timeText}</span>` : ""}
			</div>
		</div>
	`;
};

/**
 * Chèn skeleton loading vào cuối danh sách bình luận.
 */
const showCommentLoading = (container) => {
	if (!container || container.querySelector(`#${COMMENT_LOADING_ID}`)) return;
	const el = document.createElement("div");
	el.id = COMMENT_LOADING_ID;
	el.className = "comment-loading";
	el.setAttribute("aria-live", "polite");
	el.innerHTML = `
		<div class="comment-item">
			<div class="comment-avatar is-skeleton"></div>
			<div class="comment-content">
				<div class="is-skeleton" style="height:12px;width:60%;border-radius:6px;margin-bottom:6px;"></div>
				<div class="is-skeleton" style="height:10px;width:85%;border-radius:6px;"></div>
			</div>
		</div>
	`;
	container.appendChild(el);
};

/**
 * Xóa skeleton loading khỏi container.
 */
const hideCommentLoading = (container) => {
	container?.querySelector(`#${COMMENT_LOADING_ID}`)?.remove();
};

/**
 * Render dòng "Đã hiển thị tất cả bình luận" ở cuối.
 */
const showCommentEndMessage = (container) => {
	if (!container || container.querySelector(`#${COMMENT_END_ID}`)) return;
	const el = document.createElement("p");
	el.id = COMMENT_END_ID;
	el.className = "comments-end-message";
	el.textContent = "Đã hiển thị tất cả bình luận.";
	container.appendChild(el);
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export const initCommentModal = () => {
	const commentModal = document.getElementById("comment-modal");
	if (!commentModal) {
		return null;
	}

	// Các element trong modal (cached một lần)
	const closeCommentModalBtn = document.getElementById("close-comment-modal");
	const authorNameEl = document.getElementById("comment-modal-author-name");
	const authorAvatarEl = document.getElementById("comment-modal-author-avatar");
	const postTimeEl = document.getElementById("comment-modal-post-time");
	const postTagsEl = document.getElementById("comment-modal-post-tags");
	const postCaptionEl = document.getElementById("comment-modal-post-caption");
	const mediaGalleryEl = document.getElementById("comment-modal-media-gallery");
	const reportBtnEl = document.getElementById("comment-modal-report-btn");
	const likeCountEl = document.getElementById("comment-modal-like-count");
	const likeBtnEl = document.getElementById("btn-like-comment-modal");

	/** Container có scrollbar chứa danh sách bình luận */
	const commentListEl = document.getElementById("comment-modal-comment-list");

	// ---------------------------------------------------------------------------
	// loadComments — gọi API & render
	// ---------------------------------------------------------------------------

	/**
	 * Tải một trang bình luận và append vào commentListEl.
	 * An toàn khi gọi nhiều lần — guard bằng isLoadingCmts / hasMoreCmts.
	 */
	const loadComments = async () => {
		// Guard: không tải khi đang loading hoặc đã hết bình luận
		if (isLoadingCmts || !hasMoreCmts || !currentPostId) return;

		isLoadingCmts = true;
		showCommentLoading(commentListEl);

		try {
			const response = await postApi.getComments(currentPostId, currentLastCmtId);
			const data = response?.data;
			const comments = Array.isArray(data?.commentList) ? data.commentList : [];

			// Render các bình luận mới vào cuối danh sách
			if (comments.length > 0) {
				const html = comments.map(createCommentHtml).join("");
				commentListEl?.insertAdjacentHTML("beforeend", html);
			}

			// Cập nhật cursor và flag
			currentLastCmtId = data?.respLastCommentId ?? currentLastCmtId;
			hasMoreCmts = data?.hasMore === true;

			// Nếu đã hết → hiện thông báo
			if (!hasMoreCmts) {
				showCommentEndMessage(commentListEl);
			}
		} catch (error) {
			// Lỗi tải bình luận — không block toàn modal, chỉ log
			console.error("[comment-modal] Lỗi khi tải bình luận:", error);
		} finally {
			hideCommentLoading(commentListEl);
			isLoadingCmts = false;
		}
	};

	// ---------------------------------------------------------------------------
	// Infinite scroll — lắng nghe scroll trên commentListEl
	// ---------------------------------------------------------------------------

	if (commentListEl) {
		commentListEl.addEventListener("scroll", () => {
			const { scrollTop, clientHeight, scrollHeight } = commentListEl;
			// Khi cuộn còn cách đáy 50px → tải thêm
			if (scrollTop + clientHeight >= scrollHeight - 50) {
				void loadComments();
			}
		}, { passive: true });
	}

	// ---------------------------------------------------------------------------
	// openCommentModal — bind dữ liệu bài viết + reset + load comments
	// ---------------------------------------------------------------------------

	const openCommentModal = (post) => {
		if (!post) return;

		// --- Bind thông tin bài viết ---
		const authorName = normalizeString(post.authorName || post.author_name || post.username) || "Người dùng";
		const avatarUrl = normalizeString(post.avtUrl || post.avt_url || post.avatar_url || post.avatar) || DEFAULT_AVATAR;
		const content = normalizeString(post.content || post.caption);
		const isLiked = post.isLiked === true || post.isLiked === "true" || post.isLiked === 1;
		const likeCount = normalizeNumber(post.newLikeCount ?? post.likeCount ?? post.like_count, 0);
		const address = normalizeString(post.address || post.location);
		const province = normalizeString(post.province);
		const topic = normalizeString(post.topic);
		const createdAt = normalizeString(post.createAt || post.create_at || post.created_at);
		const postId = normalizeString(post.id);

		if (authorNameEl) authorNameEl.textContent = authorName;
		if (authorAvatarEl) {
			authorAvatarEl.src = avatarUrl;
			authorAvatarEl.alt = `Avatar ${authorName}`;
		}
		if (postTimeEl) postTimeEl.textContent = timeAgo(createdAt);
		if (postCaptionEl) postCaptionEl.textContent = content;

		if (postTagsEl) {
			let tagsHtml = "";
			if (province) tagsHtml += `<span class="comment-info-chip"><i class="bx bx-map"></i><span>${escapeHtml(province)}</span></span>`;
			if (topic) tagsHtml += `<span class="comment-info-chip"><i class="bx bx-category"></i><span>${escapeHtml(topic)}</span></span>`;
			if (address) tagsHtml += `<span class="comment-info-chip"><i class="bx bx-current-location"></i><span>${escapeHtml(address)}</span></span>`;
			postTagsEl.innerHTML = tagsHtml;
		}

		if (mediaGalleryEl) {
			const mediaItems = resolvePostMediaItems(post);
			mediaGalleryEl.innerHTML = mediaItems.map(item => {
				if (item.isVideo) {
					const posterAttr = item.thumbnailUrl.length > 0
						? ` poster="${escapeHtml(item.thumbnailUrl)}"`
						: "";
					return `<video src="${escapeHtml(item.url)}" controls preload="metadata"${posterAttr}></video>`;
				}
				return `<img src="${escapeHtml(item.url)}" alt="Media của bài đăng">`;
			}).join("");
		}

		if (reportBtnEl) {
			reportBtnEl.dataset.postId = postId;
		}

		if (likeBtnEl) {
			likeBtnEl.dataset.postId = postId;
			// Đảm bảo nút có class .btn-like để Event Delegation trong post-interactions.js bắt được
			likeBtnEl.classList.add("btn-like");
			likeBtnEl.classList.toggle("active", isLiked);
			likeBtnEl.classList.toggle("is-liked", isLiked);
			likeBtnEl.setAttribute("aria-label", isLiked ? "Bỏ tim bài viết" : "Thả tim bài viết");
			const icon = likeBtnEl.querySelector("i");
			if (icon) {
				icon.className = `bx ${isLiked ? "bxs-heart" : "bx-heart"}`;
			}
		}

		if (likeCountEl) {
			likeCountEl.textContent = formatCompactNumber(likeCount);
		}

		// --- QUAN TRỌNG: Reset state bình luận trước khi mở bài viết mới ---
		currentPostId = postId;
		currentLastCmtId = null;
		hasMoreCmts = true;
		isLoadingCmts = false;

		// Xóa sạch bình luận cũ (bao gồm mock data và bình luận trang trước)
		if (commentListEl) {
			commentListEl.innerHTML = "";
		}

		// Hiện modal
		commentModal.classList.add("open");
		commentModal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";

		// Tải bình luận trang đầu tiên
		void loadComments();
	};

	// ---------------------------------------------------------------------------
	// closeCommentModal
	// ---------------------------------------------------------------------------

	const closeCommentModal = () => {
		commentModal.classList.remove("open");
		commentModal.setAttribute("aria-hidden", "true");
		document.body.style.overflow = "";

		// Xóa media để dừng video đang phát
		if (mediaGalleryEl) mediaGalleryEl.innerHTML = "";

		// Reset comment state khi đóng
		currentPostId = null;
		currentLastCmtId = null;
		hasMoreCmts = true;
		isLoadingCmts = false;
	};

	// ---------------------------------------------------------------------------
	// Event listeners
	// ---------------------------------------------------------------------------

	closeCommentModalBtn?.addEventListener("click", closeCommentModal);

	commentModal.addEventListener("click", (event) => {
		if (event.target === commentModal) {
			closeCommentModal();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && commentModal.classList.contains("open")) {
			closeCommentModal();
		}
	});

	return {
		open: openCommentModal,
		close: closeCommentModal
	};
};
