"use strict";

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

const resolvePostMediaUrls = (post) => {
	if (Array.isArray(post?.mediaList)) {
		return post.mediaList.map(m => normalizeString(m?.mediaUrl)).filter(url => url.length > 0);
	}
	let media = post?.media_url || post?.mediaUrl || post?.image_url || post?.imageUrl || post?.media_urls || post?.mediaUrls;
	if (!media) return [];
	if (Array.isArray(media)) return media.map(normalizeString).filter(url => url.length > 0);
	if (typeof media === "string") {
		if (media.includes(",")) return media.split(",").map(url => normalizeString(url)).filter(url => url.length > 0);
		const url = normalizeString(media);
		return url.length > 0 ? [url] : [];
	}
	return [];
};

export const initCommentModal = () => {
	const commentModal = document.getElementById("comment-modal");
	if (!commentModal) {
		return null;
	}

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

	const openCommentModal = (post) => {
		if (!post) return;

		const authorName = normalizeString(post.authorName || post.author_name || post.username) || "Người dùng";
		const avatarUrl = normalizeString(post.avtUrl || post.avt_url || post.avatar_url || post.avatar) || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=96&q=60";
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
			const mediaUrls = resolvePostMediaUrls(post);
			mediaGalleryEl.innerHTML = mediaUrls.map(url => {
				if (isVideoUrl(url)) {
					return `<video src="${escapeHtml(url)}" controls preload="metadata"></video>`;
				}
				return `<img src="${escapeHtml(url)}" alt="Media của bài đăng">`;
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

		commentModal.classList.add("open");
		commentModal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";
	};

	const closeCommentModal = () => {
		commentModal.classList.remove("open");
		commentModal.setAttribute("aria-hidden", "true");
		document.body.style.overflow = "";
		if (mediaGalleryEl) mediaGalleryEl.innerHTML = ""; // Clear media to stop videos playing
	};

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
