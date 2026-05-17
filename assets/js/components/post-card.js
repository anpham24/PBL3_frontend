/**
 * @file post-card.js
 * @module components/post-card
 *
 * Pure-function component sinh chuỗi HTML cho một thẻ bài đăng.
 *
 * Nguyên tắc thiết kế:
 *  - KHÔNG chứa bất kỳ addEventListener nào.
 *    Mọi tương tác (Like, Comment, Edit, Delete, Report) được xử lý bởi
 *    post-interactions.js và post-menu.js qua Event Delegation trên document.
 *  - Trả về một chuỗi Template Literal hoàn chỉnh, sẵn sàng nhúng vào DOM.
 *  - Mọi giá trị đến từ bên ngoài đều được escape trước khi nhúng vào HTML
 *    để tránh XSS.
 *
 * Sơ đồ data-* attributes dùng làm "giao thức" với Event Delegation:
 *  .post-card[data-post-id]          → định danh bài đăng
 *  .post-card[data-author-id]        → định danh tác giả (dùng bởi post-menu)
 *  .btn-like[data-post-id]           → trigger toggle-like
 *  .post-comment-btn[data-post-id]   → trigger mở comment-modal
 *  .open-profile-link[data-user-id]  → trigger mở trang profile
 */

"use strict";

import { generateDropdownMenuHtml } from "./post-menu.js";

// ---------------------------------------------------------------------------
// Helpers nội bộ — các util này cố ý không export để giữ module tự chứa.
// Nếu dự án đã có một shared helpers.js, có thể import từ đó thay thế.
// ---------------------------------------------------------------------------

/**
 * Chuẩn hóa giá trị sang string, cắt khoảng trắng. Trả về "" nếu rỗng/null/undefined.
 * @param {*} value
 * @returns {string}
 */
const _str = (value) => {
	if (typeof value !== "string") return "";
	const t = value.trim();
	return t.length > 0 ? t : "";
};

/**
 * Chuẩn hóa sang số hữu hạn. Trả về `fallback` nếu không parse được.
 * @param {*} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
const _num = (value, fallback = 0) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

/**
 * Escape ký tự HTML đặc biệt để an toàn khi nhúng vào attribute hoặc text node.
 * @param {*} value
 * @returns {string}
 */
const _esc = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

/**
 * Định dạng số gọn (ví dụ: 1500 → "1,5K", 0 → "").
 * @param {number} num
 * @returns {string}
 */
const _compact = (num) => {
	const n = _num(num, 0);
	if (n === 0) return "";
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "") + "M";
	if (n >= 1_000) return (n / 1_000).toFixed(1).replace(".", ",").replace(",0", "") + "K";
	return n.toString();
};

/**
 * Kiểm tra URL có phải video không (mp4, webm, ogg, mov, m4v).
 * @param {string} url
 * @returns {boolean}
 */
const _isVideo = (url) => /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);

/**
 * Chuyển giá trị "truthy-like" đa dạng kiểu thành boolean.
 * Chấp nhận: true, "true", 1, "1".
 * @param {*} value
 * @returns {boolean}
 */
const _bool = (value) =>
	value === true || value === "true" || value === 1 || value === "1";

/**
 * Tính thời gian tương đối từ ISO string sang dạng "x phút trước".
 * @param {string} dateString
 * @returns {string}
 */
const _timeAgo = (dateString) => {
	if (!dateString) return "";
	const date = new Date(dateString);
	if (isNaN(date.getTime())) return "";

	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 0) return "Vừa xong";

	const intervals = [
		{ unit: "năm",   secs: 31_536_000 },
		{ unit: "tháng", secs: 2_592_000  },
		{ unit: "ngày",  secs: 86_400     },
		{ unit: "giờ",   secs: 3_600      },
		{ unit: "phút",  secs: 60         },
	];

	for (const { unit, secs } of intervals) {
		const n = Math.floor(seconds / secs);
		if (n >= 1) return `${n} ${unit} trước`;
	}

	return "Vừa xong";
};

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

/**
 * Trích xuất danh sách media item từ object bài đăng.
 * Hỗ trợ cả format `mediaList` (chuẩn API mới) lẫn các field legacy.
 *
 * @param {object} post
 * @returns {{ url: string, isVideo: boolean, thumbnailUrl: string }[]}
 */
const _resolveMediaItems = (post) => {
	// Chuẩn API mới: mediaList là mảng object { mediaUrl, mediaType, thumbnailUrl }
	if (Array.isArray(post?.mediaList)) {
		return post.mediaList.reduce((acc, m) => {
			const url = _str(m?.mediaUrl);
			if (!url) return acc;
			acc.push({
				url,
				isVideo: _str(m?.mediaType).toUpperCase() === "VIDEO",
				thumbnailUrl: _str(m?.thumbnailUrl),
			});
			return acc;
		}, []);
	}

	// Fallback: các field URL phẳng (legacy)
	const raw =
		post?.media_url  ||
		post?.mediaUrl   ||
		post?.image_url  ||
		post?.imageUrl   ||
		post?.media_urls ||
		post?.mediaUrls;

	if (!raw) return [];

	const urls = Array.isArray(raw)
		? raw.map(_str).filter(Boolean)
		: typeof raw === "string"
			? (raw.includes(",")
				? raw.split(",").map(_str).filter(Boolean)
				: [_str(raw)].filter(Boolean))
			: [];

	return urls.map((url) => ({ url, isVideo: _isVideo(url), thumbnailUrl: "" }));
};

/**
 * Sinh HTML cho một media item đơn lẻ (ảnh hoặc video).
 * @param {{ url: string, isVideo: boolean, thumbnailUrl: string }} item
 * @param {string} [altText=""]
 * @returns {string}
 */
const _renderMediaItem = (item, altText = "") => {
	if (item.isVideo) {
		const posterAttr = item.thumbnailUrl
			? ` poster="${_esc(item.thumbnailUrl)}"`
			: "";
		return `<video src="${_esc(item.url)}" controls preload="metadata"${posterAttr}></video>`;
	}
	return `<img src="${_esc(item.url)}" alt="${_esc(altText)}" loading="lazy">`;
};

/**
 * Sinh HTML toàn bộ khối media của bài đăng.
 * - 0 ảnh  → chuỗi rỗng
 * - 1 ảnh  → thẻ `<img>` / `<video>` trực tiếp với class `post-image`
 * - N ảnh  → carousel `.post-media-carousel`
 *
 * @param {object} post
 * @param {string} authorName - Dùng làm alt text
 * @returns {string}
 */
const _buildMediaHtml = (post, authorName) => {
	const items = _resolveMediaItems(post);
	if (items.length === 0) return "";

	if (items.length === 1) {
		const item = items[0];
		if (item.isVideo) {
			const posterAttr = item.thumbnailUrl
				? ` poster="${_esc(item.thumbnailUrl)}"`
				: "";
			return `
			<div class="post-image">
				<video src="${_esc(item.url)}" controls preload="metadata"${posterAttr}></video>
			</div>`;
		}
		return `<img class="post-image" src="${_esc(item.url)}" alt="Bài viết của ${_esc(authorName)}" loading="lazy">`;
	}

	// Carousel cho nhiều ảnh/video
	const slides = items
		.map(
			(item, i) => `
			<div class="post-card__carousel-item carousel-item">
				${_renderMediaItem(item, `Bài viết của ${authorName} - phần ${i + 1}`)}
			</div>`
		)
		.join("");

	return `
		<div class="post-media-carousel">
			<div class="carousel-inner">
				${slides}
			</div>
			<button class="carousel-btn prev-btn" type="button" aria-label="Ảnh trước">
				<i class="bx bx-chevron-left"></i>
			</button>
			<button class="carousel-btn next-btn" type="button" aria-label="Ảnh tiếp theo">
				<i class="bx bx-chevron-right"></i>
			</button>
		</div>`;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sinh chuỗi HTML cho một thẻ bài đăng (post card).
 *
 * Hàm này là **pure**: không có side effects, không gọi API, không gắn
 * event listener. Caller chịu trách nhiệm nhúng chuỗi vào DOM.
 *
 * @param {object} postData - Dữ liệu bài đăng từ API.
 * @param {string}  postData.id           - ID duy nhất của bài đăng.
 * @param {string}  postData.authorId     - ID tác giả.
 * @param {string}  [postData.authorName] - Tên hiển thị tác giả (alias: author_name, username).
 * @param {string}  [postData.avtUrl]     - URL avatar tác giả.
 * @param {string}  [postData.content]    - Nội dung / caption bài đăng.
 * @param {boolean} [postData.isLiked]    - Người dùng hiện tại đã like chưa.
 * @param {number}  [postData.likeCount]  - Tổng số lượt like (alias: like_count).
 * @param {number}  [postData.commentCount] - Tổng số bình luận (alias: comment_count).
 * @param {string}  [postData.address]    - Địa chỉ / vị trí (alias: location).
 * @param {string}  [postData.province]   - Tên tỉnh/thành.
 * @param {string}  [postData.topic]      - Chủ đề bài đăng.
 * @param {string}  [postData.createAt]   - ISO timestamp tạo bài (alias: create_at, created_at).
 * @param {Array}   [postData.mediaList]  - Danh sách media (format chuẩn API mới).
 *
 * @returns {string} Chuỗi HTML hoàn chỉnh của thẻ bài đăng.
 */
export const renderPostCard = (postData) => {
	// ── Trích xuất và chuẩn hóa dữ liệu ──────────────────────────────────────
	const postId     = _str(postData?.id);
	const authorId   = _str(postData?.authorId);
	const authorName = _str(postData?.authorName || postData?.author_name || postData?.username) || "Người dùng";
	const avatarUrl  =
		_str(postData?.avtUrl) ||
		"https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=96&q=60";
	const content      = _str(postData?.content || postData?.caption);
	const isLiked      = _bool(postData?.isLiked);
	const likeCount    = _num(postData?.likeCount    ?? postData?.like_count,    0);
	const commentCount = _num(postData?.commentCount ?? postData?.comment_count, 0);
	const address  = _str(postData?.address  || postData?.location);
	const province = _str(postData?.province);
	const topic    = _str(postData?.topic);
	const createdAt = _str(postData?.createAt || postData?.create_at || postData?.created_at);
	const timeText  = _timeAgo(createdAt);

	// ── Sub-blocks HTML ───────────────────────────────────────────────────────
	const authorIdAttr = authorId ? ` data-author-id="${_esc(authorId)}"` : "";
	const userIdAttr   = authorId ? ` data-user-id="${_esc(authorId)}"` : "";

	// Thẻ địa điểm / chủ đề nội tuyến trong header
	const tagsHtml = (province || topic || address)
		? `
			<div class="post-card__tags post-tags-inline">
				${province ? `<span class="post-tag-chip"><i class="bx bx-map"></i><span>${_esc(province)}</span></span>` : ""}
				${topic    ? `<span class="post-tag-chip"><i class="bx bx-category"></i><span>${_esc(topic)}</span></span>` : ""}
				${address  ? `<span class="post-tag-chip"><i class="bx bx-current-location"></i><span>${_esc(address)}</span></span>` : ""}
			</div>`
		: "";

	// Khối media (ảnh/video đơn hoặc carousel)
	const mediaHtml = _buildMediaHtml(postData, authorName);

	// Dropdown menu 3 chấm — được sinh bởi post-menu.js
	const menuHtml = generateDropdownMenuHtml({
		type:     "post",
		itemId:   postId,
		authorId: authorId,
	});

	// ── Template ──────────────────────────────────────────────────────────────
	return `
		<article
			class="post-card"
			data-post-id="${_esc(postId)}"${authorIdAttr}
			role="article"
		>
			<!-- ── Header: avatar + meta + menu 3 chấm ── -->
			<header class="post-card__header post-header">
				<div class="post-card__author post-author">
					<img
						class="post-card__avatar avatar open-profile-link"
						src="${_esc(avatarUrl)}"
						alt="Avatar ${_esc(authorName)}"
						${userIdAttr}
						style="cursor:pointer;"
					>
					<div class="post-card__meta post-meta">
						<div class="post-meta-row">
							<h3>
								<span
									class="post-card__author-name open-profile-link"
									${userIdAttr}
									style="cursor:pointer;"
								>${_esc(authorName)}</span>${timeText ? `<span class="post-card__time post-time"> &bull; ${_esc(timeText)}</span>` : ""}
							</h3>
						</div>
						${tagsHtml}
					</div>
				</div>

				<!-- Dropdown menu được sinh bởi generateDropdownMenuHtml() -->
				${menuHtml}
			</header>

			<!-- ── Media: ảnh/video hoặc carousel ── -->
			${mediaHtml}

			<!-- ── Actions: Like + Comment ── -->
			<div class="post-card__actions post-actions">
				<div class="post-card__actions-left left-actions">
					<!-- Nút Like — Event Delegation trong post-interactions.js lắng nghe .btn-like -->
					<button
						class="post-action-btn btn-like${isLiked ? " active is-liked" : ""}"
						type="button"
						data-post-id="${_esc(postId)}"
						aria-label="${isLiked ? "Bỏ tim bài viết" : "Thả tim bài viết"}"
					>
						<i class="bx ${isLiked ? "bxs-heart" : "bx-heart"}"></i>
						<span class="action-count" data-role="like-count">${_esc(_compact(likeCount))}</span>
					</button>

					<!-- Nút Comment — Event Delegation trong feed.js/profile.js lắng nghe .post-comment-btn -->
					<button
						class="post-action-btn post-comment-btn"
						type="button"
						data-post-id="${_esc(postId)}"
						aria-label="Bình luận bài viết"
					>
						<i class="bx bx-message-rounded"></i>
						<span class="action-count">${_esc(_compact(commentCount))}</span>
					</button>
				</div>
			</div>

			<!-- ── Footer: caption ── -->
			<footer class="post-card__footer post-footer">
				<p class="post-card__caption caption">
					<strong>${_esc(authorName)}</strong>${_esc(content)}
				</p>
			</footer>
		</article>
	`;
};
