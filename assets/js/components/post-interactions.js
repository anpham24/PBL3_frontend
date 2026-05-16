"use strict";

import { postApi } from "../api/post-api.js";
import { toSafeId } from "../utils/helpers.js";

// Cache danh sách lý do báo cáo — shared giữa các lần mở modal
let _reportReasonsCache = null;

// ─── HTML Template cho report-post-modal ────────────────────────────────────

const REPORT_MODAL_HTML = `
<div id="report-post-modal" class="report-post-modal is-hidden" aria-hidden="true" role="dialog" aria-modal="true">
	<div class="report-post-dialog">
		<header class="report-post-header">
			<h2 class="report-post-title">Báo cáo bài đăng</h2>
			<button id="report-post-close" class="report-post-close" type="button" aria-label="Đóng">
				<i class="bx bx-x"></i>
			</button>
		</header>
		<form id="report-post-form" class="report-post-form" novalidate>
			<p class="report-post-instruction">Vui lòng chọn lý do báo cáo:</p>
			<div id="report-reasons-container" class="report-reasons-list">
				<!-- Reasons dynamically injected -->
			</div>
			<p id="report-post-feedback" class="report-post-feedback is-hidden" role="alert" aria-live="assertive"></p>
			<div class="report-post-actions">
				<button id="report-post-cancel" class="btn btn--ghost" type="button">Hủy</button>
				<button id="report-post-submit" class="btn btn--primary" type="submit">Gửi</button>
			</div>
		</form>
	</div>
</div>
`;

/**
 * Chèn HTML của report-post-modal vào cuối <body> nếu chưa tồn tại.
 * Idempotent: gọi nhiều lần cũng chỉ inject một lần.
 */
const injectReportModal = () => {
	if (document.getElementById("report-post-modal")) return;
	document.body.insertAdjacentHTML("beforeend", REPORT_MODAL_HTML);
};

// ---------------------------------------------------------------------------
// Helpers nội bộ
// ---------------------------------------------------------------------------

const normalizeString = (value) => {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : "";
};

const normalizeNumber = (value, fallback = 0) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const formatCompactNumber = (num) => {
	const n = normalizeNumber(num, 0);
	if (n === 0) return "";
	if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".", ",").replace(",0", "") + "M";
	if (n >= 1000) return (n / 1000).toFixed(1).replace(".", ",").replace(",0", "") + "K";
	return n.toString();
};

// ---------------------------------------------------------------------------
// Cập nhật visual state cho MỘT nút .btn-like
// ---------------------------------------------------------------------------

const applyLikeVisualState = (btn, isLiked, newLikeCount) => {
	if (!btn) return;

	const liked = Boolean(isLiked);
	btn.classList.toggle("active", liked);
	btn.classList.toggle("is-liked", liked);
	btn.setAttribute("aria-label", liked ? "Bỏ tim bài viết" : "Thả tim bài viết");

	const icon = btn.querySelector("i");
	if (icon) {
		icon.classList.toggle("bx-heart", !liked);
		icon.classList.toggle("bxs-heart", liked);
	}

	if (newLikeCount !== undefined) {
		const countEl = btn.querySelector('[data-role="like-count"]');
		if (countEl) {
			countEl.textContent = formatCompactNumber(newLikeCount);
		}
	}
};

// ---------------------------------------------------------------------------
// Đồng bộ TẤT CẢ các nút .btn-like[data-post-id="<id>"] trên trang
// (bao gồm cả nút trong feed lẫn trong comment-modal)
// ---------------------------------------------------------------------------

const syncAllLikeButtons = (postId, isLiked, newLikeCount) => {
	const safePostId = normalizeString(postId);
	if (safePostId.length === 0) return;

	// Dùng CSS.escape nếu có (tránh lỗi với id chứa ký tự đặc biệt)
	const escapedId =
		typeof CSS !== "undefined" && typeof CSS.escape === "function"
			? CSS.escape(safePostId)
			: safePostId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

	const allLikeBtns = document.querySelectorAll(`.btn-like[data-post-id="${escapedId}"]`);
	allLikeBtns.forEach((btn) => {
		applyLikeVisualState(btn, isLiked, newLikeCount);
	});

	// Đồng bộ riêng phần tử hiển thị like count ngoài nút (comment-modal)
	const modalLikeCountEl = document.getElementById("comment-modal-like-count");
	if (modalLikeCountEl) {
		const modalLikeBtn = document.getElementById("btn-like-comment-modal");
		const modalPostId = normalizeString(modalLikeBtn?.dataset.postId);
		if (modalPostId === safePostId && newLikeCount !== undefined) {
			modalLikeCountEl.textContent = formatCompactNumber(newLikeCount);
		}
	}
};

// ---------------------------------------------------------------------------
// Xử lý click like (được gọi từ Event Delegation)
// ---------------------------------------------------------------------------

const handleLikeClick = async (btn) => {
	const postId = toSafeId(btn.dataset.postId, "");
	if (postId.length === 0) return;

	// Chống spam double-click
	if (btn.dataset.loading === "true") return;

	// Disable tạm tất cả nút cùng postId để tránh race condition
	const escapedId =
		typeof CSS !== "undefined" && typeof CSS.escape === "function"
			? CSS.escape(postId)
			: postId;
	const relatedBtns = document.querySelectorAll(`.btn-like[data-post-id="${escapedId}"]`);
	relatedBtns.forEach((b) => {
		b.dataset.loading = "true";
		b.disabled = true;
	});

	try {
		const response = await postApi.toggleLike(postId);

		// Đọc đúng key theo API contract: newLikeCount và isLiked (camelCase)
		const newLikeCount = normalizeNumber(response?.data?.newLikeCount, undefined);
		const isLiked =
			typeof response?.data?.isLiked === "boolean"
				? response.data.isLiked
				: btn.classList.contains("is-liked");

		// 1. Cập nhật DOM: tất cả nút .btn-like cùng postId trên trang
		syncAllLikeButtons(postId, isLiked, newLikeCount);

		// 2. Ghi data-attribute lên .post-card (nguồn truth cho JS state khi mở modal)
		const postCard = document.querySelector(`.post-card[data-post-id="${escapedId}"]`);
		if (postCard) {
			postCard.dataset.isLiked = String(isLiked);
			if (newLikeCount !== undefined) {
				postCard.dataset.newLikeCount = String(newLikeCount);
			}
		}

		// 3. Dispatch CustomEvent để feed.js đồng bộ in-memory state
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

// ---------------------------------------------------------------------------
// Toast notification (dùng cho report modal)
// ---------------------------------------------------------------------------

const showReportToast = (message, variant = "info") => {
	const containerId = "post-interactions-toast-container";
	let container = document.getElementById(containerId);
	if (!container) {
		container = document.createElement("div");
		container.id = containerId;
		container.className = "toast-container";
		document.body.appendChild(container);
	}

	const toast = document.createElement("div");
	toast.className = `toast toast--${variant}`;
	toast.setAttribute("role", "status");
	toast.setAttribute("aria-live", "polite");
	toast.textContent = message;
	container.appendChild(toast);

	void toast.offsetWidth;
	toast.classList.add("toast--visible");

	window.setTimeout(() => {
		toast.classList.remove("toast--visible");
		toast.addEventListener("transitionend", () => toast.remove(), { once: true });
	}, 3500);
};

// ---------------------------------------------------------------------------
// Report modal helpers (giữ nguyên logic cũ, không thay đổi)
// ---------------------------------------------------------------------------

const clearReportFeedback = (reportPostFeedback) => {
	if (!reportPostFeedback) return;
	reportPostFeedback.textContent = "";
	reportPostFeedback.classList.add("is-hidden");
	reportPostFeedback.style.color = "";
};

const setReportFeedback = (reportPostFeedback, message, variant = "error") => {
	if (!reportPostFeedback) return;
	reportPostFeedback.textContent = message;
	reportPostFeedback.classList.remove("is-hidden");
	reportPostFeedback.style.color = variant === "error" ? "#dc2626" : "#15803d";
};

const closeReportModal = (reportPostModal, reportPostFeedback, stateRef) => {
	if (!reportPostModal) return;
	reportPostModal.classList.add("is-hidden");
	reportPostModal.setAttribute("aria-hidden", "true");
	stateRef.activeReportPostId = "";
	clearReportFeedback(reportPostFeedback);
	document.body.style.overflow = "";
};

const openReportModal = (reportPostModal, reportPostForm, reportPostFeedback, stateRef, postId, reasonsContainer) => {
	if (
		!reportPostModal ||
		!reportPostForm ||
		typeof postId !== "string" ||
		postId.trim().length === 0
	) {
		return;
	}

	stateRef.activeReportPostId = postId.trim();
	reportPostForm.reset();
	clearReportFeedback(reportPostFeedback);
	reportPostModal.classList.remove("is-hidden");
	reportPostModal.setAttribute("aria-hidden", "false");
	document.body.style.overflow = "hidden";

	// Load lý do báo cáo động (có cache)
	if (reasonsContainer) {
		void loadReportReasons(reasonsContainer);
	}
};

/**
 * Tải danh sách lý do báo cáo từ API vào container, có cache.
 * @param {HTMLElement} container - Phần tử chứa các radio button.
 */
const loadReportReasons = async (container) => {
	if (!container) return;

	// Render từ cache nếu đã có
	if (Array.isArray(_reportReasonsCache) && _reportReasonsCache.length > 0) {
		renderReportReasons(container, _reportReasonsCache);
		return;
	}

	// Hiển thị spinner
	container.innerHTML = `
		<div class="report-reasons-loading">
			<span class="report-reasons-spinner" aria-label="Đang tải..."></span>
			<span>Đang tải lý do...</span>
		</div>`;

	try {
		const response = await postApi.getReportReasons();
		const reasons = Array.isArray(response?.data?.reportReasons)
			? response.data.reportReasons
			: [];
		_reportReasonsCache = reasons;
		renderReportReasons(container, reasons);
	} catch (err) {
		console.error("[post-interactions] loadReportReasons error:", err);
		container.innerHTML = `<p class="report-reasons-error">Đã có lỗi khi tải lý do. Vui lòng thử lại.</p>`;
	}
};

/**
 * Render danh sách lý do vào container.
 * @param {HTMLElement} container
 * @param {Array<{code: string, reason: string}>} reasons
 */
const renderReportReasons = (container, reasons) => {
	if (!container) return;
	const escHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	const html = reasons.map(item => {
		const code = escHtml(String(item?.code ?? "").trim());
		const reason = escHtml(String(item?.reason ?? "").trim());
		if (!code || !reason) return "";
		return `<label class="report-reason-option"><input type="radio" name="report-reason" value="${code}"><span>${reason}</span></label>`;
	}).join("");
	container.innerHTML = html || `<p class="report-reasons-error">Không có lý do nào được tải.</p>`;
};

// ---------------------------------------------------------------------------
// Export chính: init với Event Delegation trên document
// ---------------------------------------------------------------------------

export const initPostInteractions = () => {
	// Inject report modal vào DOM nếu chưa có (idempotent)
	// — đảm bảo hoạt động trên cả feed.html (đã có HTML tĩnh) và profile.html (không có)
	injectReportModal();

	const reportPostModal = document.getElementById("report-post-modal");
	const reportPostForm = document.getElementById("report-post-form");
	const reportPostCloseButton = document.getElementById("report-post-close");
	const reportPostCancelButton = document.getElementById("report-post-cancel");
	const reportPostSubmitButton = document.getElementById("report-post-submit");
	const reportPostFeedback = document.getElementById("report-post-feedback");

	const stateRef = { activeReportPostId: "" };

	// ------------------------------------------------------------------
	// Event Delegation trên document — lắng nghe TẤT CẢ nút .btn-like
	// Hoạt động với cả bài viết render động (feed) và bên trong modal
	// ------------------------------------------------------------------
	document.addEventListener("click", (event) => {
		const likeBtn = event.target.closest(".btn-like");
		if (likeBtn) {
			event.preventDefault();
			void handleLikeClick(likeBtn);
			return;
		}

		// Report post (backward-compatible với nút data-action="report-post")
		if (reportPostModal && reportPostForm) {
			const reportButton = event.target.closest('[data-action="report-post"]');
			if (reportButton) {
				event.preventDefault();
				const postId = toSafeId(reportButton.dataset.postId, "");
				const reasonsContainer = reportPostModal.querySelector("#report-reasons-container");
				openReportModal(reportPostModal, reportPostForm, reportPostFeedback, stateRef, postId, reasonsContainer);
				return;
			}
		}
	});

	// ------------------------------------------------------------------
	// Report modal: đóng / submit (giữ nguyên)
	// ------------------------------------------------------------------
	if (reportPostModal && reportPostForm) {
		const doClose = () =>
			closeReportModal(reportPostModal, reportPostFeedback, stateRef);

		reportPostCloseButton?.addEventListener("click", doClose);
		reportPostCancelButton?.addEventListener("click", doClose);

		reportPostModal.addEventListener("click", (event) => {
			if (event.target === reportPostModal) doClose();
		});

		reportPostForm.addEventListener("submit", async (event) => {
			event.preventDefault();

			const reasonInput = reportPostForm.querySelector('input[name="report-reason"]:checked');
			const reasonCode = toSafeId(reasonInput?.value, "");

			if (stateRef.activeReportPostId.length === 0) {
				setReportFeedback(reportPostFeedback, "Không xác định được bài đăng cần báo cáo.");
				return;
			}

			if (reasonCode.length === 0) {
				setReportFeedback(reportPostFeedback, "Vui lòng chọn lý do báo cáo.");
				return;
			}

			if (reportPostSubmitButton) reportPostSubmitButton.disabled = true;
			clearReportFeedback(reportPostFeedback);

			try {
				const response = await postApi.reportPost(stateRef.activeReportPostId, reasonCode);
				// HTTP 201 — thành công
				const successMsg = String(response?.message ?? "").trim() || "Báo cáo thành công.";
				showReportToast(successMsg, "success");
				window.setTimeout(() => doClose(), 500);
			} catch (error) {
				console.error("[post-interactions] reportPost error:", error);
				// HTTP 404 hoặc 409 — dùng chính xác message từ API
				const errMsg =
					(typeof error?.data?.message === "string" && error.data.message.trim().length > 0)
						? error.data.message.trim()
						: (typeof error?.message === "string" && error.message.trim().length > 0)
							? error.message.trim()
							: "Không thể gửi báo cáo. Vui lòng thử lại.";
				showReportToast(errMsg, "error");
			} finally {
				if (reportPostSubmitButton) reportPostSubmitButton.disabled = false;
			}
		});
	}
};
