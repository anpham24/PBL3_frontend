/**
 * @file post-interactions.js
 * @module components/post-interactions
 *
 * Trung tâm xử lý tương tác bài viết — Event Delegation toàn cục trên `document`.
 *
 * ── Trách nhiệm (Single Responsibility) ────────────────────────────────────────
 *  Module này là "bộ não" duy nhất cho 6 hành động bài viết:
 *    1. Like       — toggle like, đồng bộ tất cả nút cùng postId trên trang
 *    2. Comment    — mở comment-modal với post data mới nhất
 *    3. Edit       — mở create-post-modal ở chế độ Edit
 *    4. Delete     — xác nhận, gọi API, xóa DOM card, dispatch 'postDeleted'
 *    5. Report     — delegate sang ReportPostModal.open()
 *    6. Navigate   — click avatar / tên tác giả → chuyển hướng trang cá nhân
 *
 * ── Nguyên tắc ─────────────────────────────────────────────────────────────────
 *  - KHÔNG chứa HTML template của bất kỳ modal nào.
 *  - Nhận controllers (comment, createPost) và hàm getter (getPostData) qua options.
 *  - Idempotent: gọi nhiều lần chỉ đăng ký listener 1 lần.
 *  - Hoạt động với mọi post card được render động sau khi init (không cần re-init).
 *
 * ── Protocol với các component khác ────────────────────────────────────────────
 *  Selector bắt sự kiện:
 *    .btn-like[data-post-id]                   → Like
 *    .post-comment-btn[data-post-id]           → Comment (mở modal)
 *    [data-action="edit-post"][data-post-id]   → Edit
 *    [data-action="delete-post"][data-post-id] → Delete
 *    [data-action="report-post"][data-post-id] → Report
 *    .open-profile-link[data-user-id]          → Navigate to profile
 *
 *  CustomEvent dispatch (để page-level JS đồng bộ state):
 *    document → 'postLikeUpdated'  { detail: { postId, newLikeCount, isLiked } }
 *    document → 'postDeleted'      { detail: { postId } }
 *
 * @example
 *   // Trong feed.js / search.js / profile.js:
 *   initPostInteractions({
 *     commentModalController: commentModal,   // object { open, close }
 *     createModalController:  createModal,    // object { openEdit }
 *     getPostData: (postId) => findPost(postId), // function → post object | null
 *   });
 */

"use strict";

import { postApi }        from "../api/post-api.js";
import { toSafeId }       from "../utils/helpers.js";
import { ReportPostModal } from "./report-post-modal.js";
import { ConfirmModal }    from "./confirm-modal.js";

// ─── Idempotency guard ────────────────────────────────────────────────────────────────────────────
let _isInstalled = false;

// ─── Carousel helpers (Feed) ──────────────────────────────────────────────────────────────────────

/**
 * Cập nhật trạng thái hiện/ẩn của 2 nút prev/next dựa vào scrollLeft hiện tại.
 * → Gọi mỗi khi carousel-inner scroll hoặc khi khởi tạo lần đầu.
 *
 * @param {HTMLElement} inner - .carousel-inner
 * @param {HTMLElement} prevBtn
 * @param {HTMLElement} nextBtn
 */
const _syncCarouselBtns = (inner, prevBtn, nextBtn) => {
	if (!inner || !prevBtn || !nextBtn) return;
	const { scrollLeft, scrollWidth, clientWidth } = inner;
	// Ẩn nút trái khi ở slide đầu (dùng ngưỡng 4px để bữf lỗi làm tròn số)
	prevBtn.classList.toggle("is-hidden", scrollLeft <= 4);
	// Ẩn nút phải khi ở slide cuối
	nextBtn.classList.toggle("is-hidden", scrollLeft >= scrollWidth - clientWidth - 4);
};

/**
 * Gắn scroll listener và sync lần đầu cho một `.post-media-carousel` cụ thể.
 * Đánh dấu bằng data-carousel-init="1 2 để tránh gắn lại nhiều lần.
 *
 * @param {HTMLElement} carousel
 */
const _attachCarouselScrollListener = (carousel) => {
	if (!carousel || carousel.dataset.carouselInit === "1") return;
	const inner   = carousel.querySelector(".carousel-inner");
	const prevBtn = carousel.querySelector(".prev-btn");
	const nextBtn = carousel.querySelector(".next-btn");
	if (!inner || !prevBtn || !nextBtn) return;

	// Sync ngay khi gắn (slide đầu: ẩn nút trái, hiện nút phải nếu có nhiều slide)
	_syncCarouselBtns(inner, prevBtn, nextBtn);

	// Cập nhật khi người dùng scroll (scroll snap)
	inner.addEventListener("scroll", () => _syncCarouselBtns(inner, prevBtn, nextBtn), { passive: true });

	// Đánh dấu đã khởi tạo
	carousel.dataset.carouselInit = "1";
};

/**
 * Khởi tạo tất cả carousel hiện có trong DOM và theo dõi carousel mới thêm vào
 * bằng MutationObserver.
 * Chỉ gọi một lần khi module được install.
 */
const _initFeedCarousels = () => {
	// Khởi tạo các carousel đã có trong DOM ngay lúc này
	document.querySelectorAll(".post-media-carousel").forEach(_attachCarouselScrollListener);

	// Theo dõi các carousel được thêm sau (infinite scroll, create-post, v.v.)
	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;
				// Nếu chính node là carousel
				if (node.classList.contains("post-media-carousel")) {
					_attachCarouselScrollListener(node);
				}
				// Hoặc carousel nằm bên trong node vừa được thêm
				node.querySelectorAll?.(".post-media-carousel").forEach(_attachCarouselScrollListener);
			}
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
};

// ─── Helpers nội bộ ──────────────────────────────────────────────────────────

const _str = (value) => {
	if (typeof value !== "string") return "";
	const t = value.trim();
	return t.length > 0 ? t : "";
};

const _num = (value, fallback = 0) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const _compact = (num) => {
	const n = _num(num, 0);
	if (n === 0) return "";
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "") + "M";
	if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(".", ",").replace(",0", "") + "K";
	return n.toString();
};

/**
 * CSS.escape an ID để dùng trong querySelector.
 * @param {string} id
 * @returns {string}
 */
const _cssEscape = (id) =>
	typeof CSS !== "undefined" && typeof CSS.escape === "function"
		? CSS.escape(id)
		: id.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// ─── Like: Visual state helpers ──────────────────────────────────────────────

/**
 * Cập nhật visual state cho MỘT nút .btn-like.
 */
const _applyLikeVisual = (btn, isLiked, newLikeCount) => {
	if (!btn) return;
	const liked = Boolean(isLiked);
	btn.classList.toggle("active", liked);
	btn.classList.toggle("is-liked", liked);
	btn.setAttribute("aria-label", liked ? "Bỏ tim bài viết" : "Thả tim bài viết");

	const icon = btn.querySelector("i");
	if (icon) {
		icon.classList.toggle("bx-heart",  !liked);
		icon.classList.toggle("bxs-heart", liked);
	}

	if (newLikeCount !== undefined) {
		const countEl = btn.querySelector('[data-role="like-count"]');
		if (countEl) countEl.textContent = _compact(newLikeCount);
	}
};

/**
 * Đồng bộ TẤT CẢ nút .btn-like[data-post-id="<id>"] trên trang
 * (kể cả nút bên trong comment-modal).
 */
const _syncAllLikeButtons = (postId, isLiked, newLikeCount) => {
	const safe = _str(postId);
	if (!safe) return;

	document
		.querySelectorAll(`.btn-like[data-post-id="${_cssEscape(safe)}"]`)
		.forEach((btn) => _applyLikeVisual(btn, isLiked, newLikeCount));
};

// ─── Like: API handler ────────────────────────────────────────────────────────

const _handleLikeClick = async (btn) => {
	const postId = toSafeId(btn.dataset.postId, "");
	if (!postId) return;

	// Chống spam double-click
	if (btn.dataset.loading === "true") return;

	// Disable tạm tất cả nút cùng postId
	const relatedBtns = document.querySelectorAll(
		`.btn-like[data-post-id="${_cssEscape(postId)}"]`
	);
	relatedBtns.forEach((b) => {
		b.dataset.loading = "true";
		b.disabled = true;
	});

	try {
		const response    = await postApi.toggleLike(postId);
		const newLikeCount = _num(response?.data?.newLikeCount, undefined);
		const isLiked =
			typeof response?.data?.isLiked === "boolean"
				? response.data.isLiked
				: btn.classList.contains("is-liked"); // fallback optimistic

		// 1. Cập nhật DOM
		_syncAllLikeButtons(postId, isLiked, newLikeCount);

		// 2. Ghi data-attribute lên .post-card để page-level JS đọc lại khi mở modal
		const postCard = document.querySelector(
			`.post-card[data-post-id="${_cssEscape(postId)}"]`
		);
		if (postCard) {
			postCard.dataset.isLiked = String(isLiked);
			if (newLikeCount !== undefined) {
				postCard.dataset.newLikeCount = String(newLikeCount);
			}
		}

		// 3. Dispatch để feed.js / search.js đồng bộ in-memory state
		document.dispatchEvent(
			new CustomEvent("postLikeUpdated", {
				bubbles: false,
				detail: { postId, newLikeCount, isLiked },
			})
		);
	} catch (error) {
		console.error("[post-interactions] toggleLike error:", error);
	} finally {
		relatedBtns.forEach((b) => {
			delete b.dataset.loading;
			b.disabled = false;
		});
	}
};

// ─── Delete: API handler ──────────────────────────────────────────────────────

const _handleDeleteClick = async (btn) => {
	const postId = toSafeId(btn.dataset.postId, "");
	if (!postId) return;

	// 1. Xác nhận — dùng ConfirmModal thay cho window.confirm
	const confirmed = await ConfirmModal.show(
		"Xóa bài viết",
		"Bạn có chắc chắn muốn xóa bài viết này? Hành động này không thể hoàn tác.",
		{ confirmLabel: "Xóa", danger: true }
	);
	if (!confirmed) return;

	// 2. Disable nút
	btn.disabled = true;

	try {
		// 3. Gọi API
		await postApi.deletePost(postId);

		// 4. Xóa post card khỏi DOM
		const postCard = document.querySelector(
			`.post-card[data-post-id="${_cssEscape(postId)}"]`
		);
		postCard?.remove();

		// 5. Dispatch để page-level JS dọn state
		document.dispatchEvent(
			new CustomEvent("postDeleted", {
				bubbles: false,
				detail: { postId },
			})
		);

		// 6. Redirect về trang cá nhân
		window.location.href = "profile.html";
	} catch (error) {
		console.error("[post-interactions] deletePost error:", error);
		const errMsg =
			_str(error?.data?.message) ||
			_str(error?.message) ||
			"Xóa bài thất bại. Vui lòng thử lại.";
		// Hiển thị lỗi bằng ConfirmModal (thông báo thuần)
		await ConfirmModal.show("Xóa thất bại", errMsg, {
			confirmLabel: "Đóng",
			danger: false,
		});
		btn.disabled = false;
	}
};

// ─── Export chính ─────────────────────────────────────────────────────────────

/**
 * Khởi tạo Event Delegation toàn cục cho tất cả tương tác bài viết.
 * Idempotent: gọi nhiều lần chỉ thực sự chạy lần đầu tiên.
 *
 * @param {object}   [options]
 * @param {object}   [options.commentModalController]
 *   Controller từ initCommentModal() — cần có method `open(post)`.
 * @param {object}   [options.createModalController]
 *   Controller từ initCreatePostModal() — cần có method `openEdit(post)`.
 * @param {function} [options.getPostData]
 *   Hàm nhận postId → trả về post object (từ in-memory state của page)
 *   hoặc null/undefined nếu không tìm thấy.
 *   Dùng để mở comment-modal / edit modal với đúng dữ liệu.
 * @param {function} [options.navigateTo]
 *   Hàm điều hướng trang cá nhân, nhận userId.
 *   Mặc định: `window.location.href = 'profile.html?id=<userId>'`.
 */
export const initPostInteractions = (options = {}) => {
	if (_isInstalled) return;
	_isInstalled = true;

	// Khởi tạo carousel navigation cho tất cả .post-media-carousel trên trang Feed
	_initFeedCarousels();
	const {
		commentModalController = null,
		createModalController  = null,
		getPostData            = null,
		navigateTo             = null,
	} = options;

	/**
	 * Điều hướng đến trang cá nhân của userId.
	 * Dùng callback `navigateTo` nếu được cung cấp, ngược lại fallback window.location.
	 * @param {string} userId
	 */
	const _goToProfile = (userId) => {
		const safeId = _str(userId);
		if (!safeId) return;
		if (typeof navigateTo === "function") {
			navigateTo(safeId);
		} else {
			window.location.href = `profile.html?id=${encodeURIComponent(safeId)}`;
		}
	};

	// ── Event Delegation duy nhất trên document ──────────────────────────────
	document.addEventListener("click", async (event) => {

		// ── 0. CAROUSEL PREV/NEXT ────────────────────────────────────────────
		// Bắt click vào .carousel-btn bên trong .post-media-carousel (feed cards).
		// Phải kiểm tra trước LIKE để tránh bubble nhầm (nút nằm overlay lên card).
		const carouselBtn = event.target.closest(".carousel-btn");
		if (carouselBtn && !carouselBtn.closest("#comment-modal")) {
			// comment-modal có handler riêng — chỉ xử lý carousel của feed/reports
			event.preventDefault();
			event.stopPropagation();
			const carousel = carouselBtn.closest(".post-media-carousel");
			const inner    = carousel?.querySelector(".carousel-inner");
			if (inner) {
				const direction = carouselBtn.classList.contains("prev-btn") ? -1 : 1;
				inner.scrollBy({ left: direction * inner.clientWidth, behavior: "smooth" });
			}
			return;
		}

		// ── 1. LIKE ──────────────────────────────────────────────────────────
		const likeBtn = event.target.closest(".btn-like");
		if (likeBtn) {
			event.preventDefault();
			void _handleLikeClick(likeBtn);
			return;
		}

		// ── 2. COMMENT (mở comment-modal) ────────────────────────────────────
		const commentBtn = event.target.closest(".post-comment-btn");
		if (commentBtn) {
			event.preventDefault();
			if (!commentModalController) return;

			// Ưu tiên đọc postId từ nút, fallback lên .post-card cha
			const postCard = commentBtn.closest(".post-card");
			const postId   = _str(commentBtn.dataset.postId || postCard?.dataset.postId);
			if (!postId) return;

			// Lấy post data — ưu tiên callback getPostData (in-memory state),
			// fallback đọc từ data-attribute của card (đã cập nhật bởi like handler)
			let post = typeof getPostData === "function" ? getPostData(postId) : null;

			// Đồng bộ like state mới nhất vào post object trước khi mở modal
			if (post && postCard) {
				const domIsLiked      = postCard.dataset.isLiked;
				const domNewLikeCount = postCard.dataset.newLikeCount;
				post = {
					...post,
					...(domIsLiked      !== undefined ? { isLiked:      domIsLiked === "true" }     : {}),
					...(domNewLikeCount !== undefined ? { newLikeCount: _num(domNewLikeCount, 0) }   : {}),
				};
			}

			if (post) commentModalController.open(post);
			return;
		}

		// ── 3. EDIT ──────────────────────────────────────────────────────────
		const editBtn = event.target.closest('[data-action="edit-post"]');
		if (editBtn) {
			event.preventDefault();
			event.stopPropagation(); // tránh đóng dropdown quá sớm
			if (!createModalController) return;

			const postId = _str(editBtn.dataset.postId);
			if (!postId) return;

			// Nếu được trigger từ bên trong comment-modal, đóng modal đó trước
			if (editBtn.closest("#comment-modal")) {
				document.dispatchEvent(new CustomEvent("closeCommentModalRequested"));
			}

			const post = typeof getPostData === "function" ? getPostData(postId) : null;
			if (post) {
				createModalController.openEdit(post);
			} else {
				console.warn("[post-interactions] edit-post: không tìm thấy post data cho", postId);
			}
			return;
		}

		// ── 4. DELETE ─────────────────────────────────────────────────────────
		const deleteBtn = event.target.closest('[data-action="delete-post"]');
		if (deleteBtn) {
			event.preventDefault();
			event.stopPropagation();
			void _handleDeleteClick(deleteBtn);
			return;
		}

		// ── 5. REPORT ─────────────────────────────────────────────────────────
		const reportBtn = event.target.closest('[data-action="report-post"]');
		if (reportBtn) {
			event.preventDefault();
			event.stopPropagation();
			const postId = _str(reportBtn.dataset.postId);
			if (postId) ReportPostModal.open(postId);
			return;
		}

		// ── 6. SEE MORE / COLLAPSE ────────────────────────────────────────────
		// Toggle "Xem thêm" / "Thu gọn" trên nội dung bài đăng dài.
		const seeMoreBtn = event.target.closest('[data-role="see-more"]');
		if (seeMoreBtn) {
			event.preventDefault();
			const wrap    = seeMoreBtn.closest(".post-card__caption-wrap");
			const caption = wrap?.querySelector('[data-role="post-caption"]');
			if (!caption) return;

			const isExpanded = seeMoreBtn.getAttribute("aria-expanded") === "true";
			if (isExpanded) {
				// Thu gọn lại
				caption.classList.add("post-card__caption--clamped");
				seeMoreBtn.textContent = "Xem thêm";
				seeMoreBtn.setAttribute("aria-expanded", "false");
			} else {
				// Mở rộng
				caption.classList.remove("post-card__caption--clamped");
				seeMoreBtn.textContent = "Thu gọn";
				seeMoreBtn.setAttribute("aria-expanded", "true");
			}
			return;
		}

		// ── 7. NAVIGATE TO PROFILE ────────────────────────────────────────────
		// Bắt click vào bất kỳ phần tử nào có class .open-profile-link + data-user-id.
		// Giao thức này dùng chung cho: avatar/tên trên post-card, tên tác giả trong
		// comment-modal, avatar trong danh sách bình luận, v.v.
		const profileLink = event.target.closest(".open-profile-link");
		if (profileLink) {
			const userId = _str(profileLink.dataset.userId);
			if (!userId) return; // không có userId → bỏ qua, không preventDefault
			// Bỏ qua nếu click đã bị xử lý bởi handler trước (ví dụ: nút trong dropdown)
			if (event.defaultPrevented) return;
			event.preventDefault();
			_goToProfile(userId);
			return;
		}
	});

	// ── Lắng nghe CustomEvent 'postReportRequested' từ comment-modal.js ──────
	// comment-modal dispatch event thay vì gọi trực tiếp để tránh coupling.
	document.addEventListener("postReportRequested", (event) => {
		const postId = _str(event.detail?.postId ?? "");
		if (postId) ReportPostModal.open(postId);
	});
};
