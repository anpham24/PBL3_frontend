"use strict";

import { postApi } from "../api/post-api.js";
import { isPostOwner } from "../utils/helpers.js";

// ─── HTML Template ────────────────────────────────────────────────────────────

const COMMENT_MODAL_HTML = `
<div id="comment-modal" class="comment-modal" aria-hidden="true" role="dialog" aria-modal="true">
	<button id="close-comment-modal" class="comment-modal-close" type="button"
		aria-label="Đóng hộp thoại bình luận">
		<i class="bx bx-x"></i>
	</button>

	<div class="comment-modal-dialog">
		<!-- ── Cột trái: Media ── -->
		<div class="comment-media-pane">
			<div id="comment-modal-media-gallery" class="comment-media-gallery">
				<!-- Media dynamically injected here -->
			</div>
		</div>

		<!-- ── Cột phải: 3 vùng flex ── -->
		<div class="comment-panel">

			<!-- VÙNG 1 — Ghim cứng ở trên: Header bài đăng -->
			<div class="comment-panel-top">
				<header class="comment-panel-header">
					<div class="comment-header-user">
						<img id="comment-modal-author-avatar" class="comment-header-avatar" src="" alt="Avatar">
						<div class="comment-header-meta">
							<strong id="comment-modal-author-name"></strong>
							<span class="meta-divider">&bull;</span>
							<span id="comment-modal-post-time" class="post-time"></span>
						</div>
					</div>

					<div class="post-menu-wrap">
						<button class="comment-header-menu post-menu-btn" type="button" aria-label="Tùy chọn bài đăng">
							<i class="bx bx-dots-horizontal-rounded"></i>
						</button>
						<div class="post-dropdown-menu">
							<button id="comment-modal-report-btn" class="post-dropdown-item" type="button"
								data-action="report-post" data-post-id="">
								<i class="bx bx-flag"></i>
								<span>Báo cáo</span>
							</button>
						</div>
					</div>
				</header>

				<!-- Tags / Province / Address chips -->
				<div id="comment-modal-post-tags" class="comment-post-tags comment-top-tags" aria-label="Thông tin bài viết">
					<!-- Tags injected here -->
				</div>
			</div>
			<!-- END VÙNG 1 -->

			<!-- VÙNG 2 — Cuộn giữa: Nội dung bài đăng + Danh sách bình luận -->
			<div class="comment-panel-middle">
				<!-- 2a. Nội dung bài đăng (caption) -->
				<section class="comment-post-body" aria-label="Nội dung bài viết">
					<p id="comment-modal-post-caption" class="comment-post-caption"></p>
				</section>

				<!-- 2b. Danh sách bình luận -->
				<div id="comment-modal-comment-list" class="comment-list" aria-label="Danh sách bình luận">
					<!-- Comments dynamically injected here -->
				</div>
			</div>
			<!-- END VÙNG 2 -->

			<!-- VÙNG 3 — Ghim cứng ở dưới: Tương tác + Nhập bình luận -->
			<div class="comment-panel-bottom">
				<div class="comment-action-bar">
					<button id="btn-like-comment-modal" class="comment-action-btn post-action-btn post-like-btn"
						type="button" aria-label="Thả tim bài đăng">
						<i class="bx bx-heart"></i>
						<span id="comment-modal-like-count" class="action-count" data-role="like-count"></span>
					</button>
				</div>

				<footer class="comment-input-bar">
					<textarea id="comment-input" rows="1" placeholder="Thêm bình luận..."></textarea>
					<button class="comment-post-btn" type="button">Đăng</button>
				</footer>
			</div>
			<!-- END VÙNG 3 -->

		</div>
		<!-- END .comment-panel -->
	</div>
</div>
`;

/**
 * Chèn HTML của comment-modal vào cuối <body> nếu chưa tồn tại.
 * Idempotent: gọi nhiều lần cũng chỉ inject một lần.
 */
const injectCommentModal = () => {
	if (document.getElementById("comment-modal")) return;
	document.body.insertAdjacentHTML("beforeend", COMMENT_MODAL_HTML);
};

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

/** Object bài viết đang hiển thị (dùng cho callback edit) */
let currentPostData = null;

/** Số lượng comment hiện tại (dùng để update count ngoài feed) */
let currentPostCommentCount = 0;

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
	const authorId = escapeHtml(normalizeString(comment.authorId || comment.author_id));
	const profileAttr = authorId.length > 0 ? ` data-user-id="${authorId}"` : "";

	return `
		<div class="comment-item">
			<img class="comment-avatar open-profile-link" src="${avatarUrl}" alt="Avatar ${authorName}"${profileAttr} style="cursor:pointer;">
			<div class="comment-content">
				<p><strong class="open-profile-link"${profileAttr} style="cursor:pointer;">${authorName}</strong>${content}</p>
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

export const initCommentModal = (options = {}) => {
	// options giữ lại để tương thích ngược — các callback post-action (onEditRequest,
	// onDeleteSuccess) không còn cần thiết: post-interactions.js xử lý hoàn toàn
	// qua Event Delegation trên document (data-action="edit-post", "delete-post", "report-post").

	// Inject HTML vào DOM nếu chưa có (idempotent)
	injectCommentModal();

	const commentModal = document.getElementById("comment-modal");

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

	/** .post-menu-wrap chứa nút ba chấm trong comment-modal header */
	const commentModalMenuWrapEl = commentModal.querySelector(".comment-panel-header .post-menu-wrap");
	/** Dropdown panel bên trong wrap đó */
	const commentModalDropdownEl = commentModalMenuWrapEl?.querySelector(".post-dropdown-menu") ?? null;

	/** Container có scrollbar chứa danh sách bình luận */
	const commentListEl = document.getElementById("comment-modal-comment-list");
	/** Vùng cuộn chung (nội dung bài + bình luận) */
	const commentPanelMiddleEl = commentModal.querySelector(".comment-panel-middle");

	const commentInputEl = document.getElementById("comment-input");
	const commentPostBtn = commentModal.querySelector(".comment-post-btn");

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
	// Infinite scroll — lắng nghe scroll trên commentPanelMiddleEl (vùng cuộn chung)
	// ---------------------------------------------------------------------------

	if (commentPanelMiddleEl) {
		commentPanelMiddleEl.addEventListener("scroll", () => {
			const { scrollTop, clientHeight, scrollHeight } = commentPanelMiddleEl;
			// Khi cuộn còn cách đáy 80px → tải thêm
			if (scrollTop + clientHeight >= scrollHeight - 80) {
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
		const authorId = normalizeString(post.authorId || post.author_id);

		if (authorNameEl) {
			authorNameEl.textContent = authorName;
			// Cho phép click vào tên tác giả để xem hồ sơ
			if (authorId.length > 0) {
				authorNameEl.classList.add("open-profile-link");
				authorNameEl.dataset.userId = authorId;
				authorNameEl.style.cursor = "pointer";
			} else {
				authorNameEl.classList.remove("open-profile-link");
				delete authorNameEl.dataset.userId;
				authorNameEl.style.cursor = "";
			}
		}
		if (authorAvatarEl) {
			authorAvatarEl.src = avatarUrl;
			authorAvatarEl.alt = `Avatar ${authorName}`;
			// Cho phép click vào avatar để xem hồ sơ
			if (authorId.length > 0) {
				authorAvatarEl.classList.add("open-profile-link");
				authorAvatarEl.dataset.userId = authorId;
				authorAvatarEl.style.cursor = "pointer";
			} else {
				authorAvatarEl.classList.remove("open-profile-link");
				delete authorAvatarEl.dataset.userId;
				authorAvatarEl.style.cursor = "";
			}
		}
		if (postTimeEl) postTimeEl.textContent = timeAgo(createdAt);
		if (postCaptionEl) postCaptionEl.textContent = content;

		// Render Edit/Delete buttons dựa trên quyền sở hữu
		if (commentModalDropdownEl) {
			// Xóa các nút owner cũ để tránh duplicate khi mở bài khác
			commentModalDropdownEl.querySelectorAll(
				'[data-action="edit-post"], [data-action="delete-post"]'
			).forEach(el => el.remove());

			// Ẩn/hiện nút Báo cáo tùy theo quyền sở hữu bài viết
			if (reportBtnEl) {
				reportBtnEl.style.display = isPostOwner(authorId) ? "none" : "";
			}

			if (isPostOwner(authorId)) {
				const editBtn = document.createElement("button");
				editBtn.className = "post-dropdown-item post-dropdown-item--edit";
				editBtn.type = "button";
				editBtn.setAttribute("data-action", "edit-post");
				editBtn.setAttribute("data-post-id", postId);
				editBtn.innerHTML = `<i class="bx bx-edit"></i><span>Chỉnh sửa</span>`;

				const deleteBtn = document.createElement("button");
				deleteBtn.className = "post-dropdown-item post-dropdown-item--delete";
				deleteBtn.type = "button";
				deleteBtn.setAttribute("data-action", "delete-post");
				deleteBtn.setAttribute("data-post-id", postId);
				deleteBtn.innerHTML = `<i class="bx bx-trash"></i><span>Xóa</span>`;

				// Chỉnh sửa + Xóa được đặt TRƯỚC nút Báo cáo
				if (reportBtnEl && commentModalDropdownEl.contains(reportBtnEl)) {
					commentModalDropdownEl.insertBefore(deleteBtn, reportBtnEl);
					commentModalDropdownEl.insertBefore(editBtn, deleteBtn);
				} else {
					commentModalDropdownEl.prepend(deleteBtn);
					commentModalDropdownEl.prepend(editBtn);
				}
			}
		}

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
		currentPostData = post; // Lưu lại để dùng khi gọi openEdit
		currentLastCmtId = null;
		hasMoreCmts = true;
		isLoadingCmts = false;

		let initialCount = normalizeNumber(post.commentCount ?? post.comment_count, 0);
		const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
			? CSS.escape(postId)
			: postId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const postCard = document.querySelector(`.post-card[data-post-id="${escapedId}"]`);
		if (postCard && postCard.dataset.newCommentCount !== undefined) {
			initialCount = normalizeNumber(postCard.dataset.newCommentCount, initialCount);
		}
		currentPostCommentCount = initialCount;

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

	/** Đóng dropdown ba chấm của modal (không đóng modal) */
	const closeModalMenu = () => {
		commentModalMenuWrapEl?.classList.remove("open");
	};

	const closeCommentModal = () => {
		closeModalMenu();
		commentModal.classList.remove("open");
		commentModal.setAttribute("aria-hidden", "true");
		document.body.style.overflow = "";

		// Xóa media để dừng video đang phát
		if (mediaGalleryEl) mediaGalleryEl.innerHTML = "";

		// Reset comment state khi đóng
		currentPostId = null;
		currentPostData = null;
		currentPostCommentCount = 0;
		currentLastCmtId = null;
		hasMoreCmts = true;
		isLoadingCmts = false;
	};

	// ---------------------------------------------------------------------------
	// Event listeners
	// ---------------------------------------------------------------------------

	closeCommentModalBtn?.addEventListener("click", closeCommentModal);

	// ---------------------------------------------------------------------------
	// Toggle dropdown ba chấm bên trong comment-modal
	// ---------------------------------------------------------------------------
	if (commentModalMenuWrapEl) {
		const modalMenuBtn = commentModalMenuWrapEl.querySelector(".post-menu-btn");

		/**
		 * Định vị dropdown bằng position:fixed dựa trên getBoundingClientRect của nút ba chấm.
		 * Cần thiết vì .comment-modal-dialog có overflow:hidden → position:absolute bị clip.
		 */
		const positionModalDropdown = () => {
			if (!commentModalDropdownEl || !modalMenuBtn) return;
			const rect = modalMenuBtn.getBoundingClientRect();
			// Căn phải theo mép phải của nút, xuất hiện ngay dưới nút
			commentModalDropdownEl.style.position = "fixed";
			commentModalDropdownEl.style.top = `${rect.bottom + 4}px`;
			commentModalDropdownEl.style.right = `${window.innerWidth - rect.right}px`;
			commentModalDropdownEl.style.left = "auto";
			commentModalDropdownEl.style.zIndex = "200";
		};

		// Nút ba chấm: toggle open/close + tính lại vị trí khi mở
		modalMenuBtn?.addEventListener("click", (event) => {
			event.stopPropagation();
			const isOpen = commentModalMenuWrapEl.classList.toggle("open");
			if (isOpen) {
				positionModalDropdown();
			}
		});

		// KHÔNG dùng stopPropagation ở đây:
		// Click vào Edit/Delete/Report cần bubble lên document để
		// post-interactions.js bắt được theo data-action.
		// Handler backdrop (dưới đây) đã có .contains() guard,
		// nên dropdown sẽ không bị đóng nhầm.
	}

	// Click ra ngoài panel (backdrop hoặc media pane) đóng dropdown
	commentModal.addEventListener("click", (event) => {
		if (!commentModalMenuWrapEl?.contains(event.target)) {
			closeModalMenu();
		}
		if (event.target === commentModal) {
			closeCommentModal();
		}
	});

	// ---------------------------------------------------------------------------
	// Dropdown menu của modal: KHÔNG dùng stopPropagation — để event bubble
	// lên document và được post-interactions.js bắt theo data-action.
	// Menu sẽ không đóng sai vì commentModal.click chỉ gọi closeModalMenu()
	// khi click NẰM NGOÀI commentModalMenuWrapEl (có kiểm tra .contains()).
	// ---------------------------------------------------------------------------
	// (không cần listener ở đây — mọi action trong dropdown được xử lý toàn cục)

	// ---------------------------------------------------------------------------
	// Lắng nghe yêu cầu đóng từ post-interactions.js
	// (ví dụ: khi user bấm Edit từ bên trong modal, cần đóng modal trước khi mở create-post-modal)
	// ---------------------------------------------------------------------------
	document.addEventListener("closeCommentModalRequested", () => {
		if (commentModal.classList.contains("open")) {
			closeCommentModal();
		}
	});

	// ---------------------------------------------------------------------------
	// Tự đóng modal khi bài viết hiện tại bị xóa (bơi post-interactions.js)
	// ---------------------------------------------------------------------------
	document.addEventListener("postDeleted", (event) => {
		const deletedId = event.detail?.postId ?? "";
		if (deletedId && deletedId === currentPostId) {
			closeCommentModal();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && commentModal.classList.contains("open")) {
			if (commentModalMenuWrapEl?.classList.contains("open")) {
				// Lần 1: chỉ đóng dropdown
				closeModalMenu();
			} else {
				// Lần 2 (hoặc dropdown đã đóng): đóng cả modal
				closeCommentModal();
			}
		}
	});

	// ---------------------------------------------------------------------------
	// Create Comment
	// ---------------------------------------------------------------------------
	let isSubmittingComment = false;

	const handleCreateComment = async () => {
		if (!currentPostId || isSubmittingComment) return;

		const content = normalizeString(commentInputEl?.value);
		if (content.length === 0) return;

		isSubmittingComment = true;
		if (commentPostBtn) {
			commentPostBtn.disabled = true;
			commentPostBtn.textContent = "Đang đăng...";
		}

		try {
			const response = await postApi.createComment(currentPostId, content);
			const newComment = response?.data;

			if (newComment) {
				// 1. Chèn bình luận vào đầu danh sách
				const html = createCommentHtml(newComment);
				commentListEl?.insertAdjacentHTML("afterbegin", html);

				// 2. Xóa ô nhập liệu
				if (commentInputEl) {
					commentInputEl.value = "";
				}

				// 3. Tăng commentCount và update ngoài Feed
				currentPostCommentCount += 1;
				const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
					? CSS.escape(currentPostId)
					: currentPostId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

				const postCard = document.querySelector(`.post-card[data-post-id="${escapedId}"]`);
				if (postCard) {
					postCard.dataset.newCommentCount = String(currentPostCommentCount);
					const countSpan = postCard.querySelector('.post-comment-btn .action-count');
					if (countSpan) {
						countSpan.textContent = formatCompactNumber(currentPostCommentCount);
					}
				}
			}
		} catch (error) {
			console.error("[comment-modal] Lỗi khi tạo bình luận:", error);
			alert("Không thể đăng bình luận. Vui lòng thử lại!");
		} finally {
			isSubmittingComment = false;
			if (commentPostBtn) {
				commentPostBtn.disabled = false;
				commentPostBtn.textContent = "Đăng";
			}
		}
	};

	commentPostBtn?.addEventListener("click", handleCreateComment);

	commentInputEl?.addEventListener("keydown", (event) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			void handleCreateComment();
		}
	});

	return {
		open: openCommentModal,
		close: closeCommentModal
	};
};
