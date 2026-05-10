"use strict";

import { postApi } from "../api/post-api.js";
import { toSafeId } from "../utils/helpers.js";

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

const openReportModal = (reportPostModal, reportPostForm, reportPostFeedback, stateRef, postId) => {
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
};

// ---------------------------------------------------------------------------
// Export chính: init với Event Delegation trên document
// ---------------------------------------------------------------------------

export const initPostInteractions = () => {
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
				openReportModal(reportPostModal, reportPostForm, reportPostFeedback, stateRef, postId);
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
				await postApi.reportPost(stateRef.activeReportPostId, reasonCode);
				setReportFeedback(reportPostFeedback, "Đã gửi báo cáo thành công.", "success");
				window.setTimeout(() => doClose(), 500);
			} catch (error) {
				console.error("[post-interactions] reportPost error:", error);
				setReportFeedback(reportPostFeedback, "Không thể gửi báo cáo. Vui lòng thử lại.");
			} finally {
				if (reportPostSubmitButton) reportPostSubmitButton.disabled = false;
			}
		});
	}
};
