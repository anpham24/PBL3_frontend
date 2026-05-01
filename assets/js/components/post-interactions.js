"use strict";

import { postApi } from "../api/post-api.js";
import { toArray, toSafeId } from "../utils/helpers.js";

const toggleActionIcon = (button, outlinedClass, solidClass) => {
	if (!button) {
		return false;
	}

	const icon = button.querySelector("i");
	if (!icon) {
		return false;
	}

	const isActive = button.classList.toggle("active");
	icon.classList.toggle(outlinedClass, !isActive);
	icon.classList.toggle(solidClass, isActive);
	return isActive;
};

const syncInteraction = async (requestAction) => {
	try {
		await requestAction();
	} catch (error) {
		console.error("AJAX interaction error:", error);
	}
};

export const initPostInteractions = () => {
	const likeCommentModalBtn = document.getElementById("btn-like-comment-modal");
	const saveCommentModalBtn = document.getElementById("btn-save-comment-modal");
	const postLikeButtons = toArray(document.querySelectorAll(".post-like-btn"));
	const postSaveButtons = toArray(document.querySelectorAll(".post-save-btn"));
	const commentLikeButtons = toArray(document.querySelectorAll(".comment-like-btn"));
	const reportPostModal = document.getElementById("report-post-modal");
	const reportPostForm = document.getElementById("report-post-form");
	const reportPostCloseButton = document.getElementById("report-post-close");
	const reportPostCancelButton = document.getElementById("report-post-cancel");
	const reportPostSubmitButton = document.getElementById("report-post-submit");
	const reportPostFeedback = document.getElementById("report-post-feedback");

	let activeReportPostId = "";

	const clearReportFeedback = () => {
		if (!reportPostFeedback) {
			return;
		}

		reportPostFeedback.textContent = "";
		reportPostFeedback.classList.add("is-hidden");
		reportPostFeedback.style.color = "";
	};

	const setReportFeedback = (message, variant = "error") => {
		if (!reportPostFeedback) {
			return;
		}

		reportPostFeedback.textContent = message;
		reportPostFeedback.classList.remove("is-hidden");
		reportPostFeedback.style.color = variant === "error" ? "#dc2626" : "#15803d";
	};

	const closeReportModal = () => {
		if (!reportPostModal) {
			return;
		}

		reportPostModal.classList.add("is-hidden");
		reportPostModal.setAttribute("aria-hidden", "true");
		activeReportPostId = "";
		clearReportFeedback();
		document.body.style.overflow = "";
	};

	const openReportModal = (postId) => {
		if (!reportPostModal || !reportPostForm || typeof postId !== "string" || postId.trim().length === 0) {
			return;
		}

		activeReportPostId = postId.trim();
		reportPostForm.reset();
		clearReportFeedback();

		reportPostModal.classList.remove("is-hidden");
		reportPostModal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";
	};

	likeCommentModalBtn?.addEventListener("click", async () => {
		const isActive = toggleActionIcon(likeCommentModalBtn, "bx-heart", "bxs-heart");

		await syncInteraction(() => postApi.likeCurrentPostFromCommentModal(isActive));
	});

	saveCommentModalBtn?.addEventListener("click", async () => {
		const isActive = toggleActionIcon(saveCommentModalBtn, "bx-bookmark", "bxs-bookmark");

		await syncInteraction(() => postApi.saveCurrentPostFromCommentModal(isActive));
	});

	postLikeButtons.forEach((button, index) => {
		button.addEventListener("click", async () => {
			const isActive = toggleActionIcon(button, "bx-heart", "bxs-heart");
			const postCard = button.closest(".post-card");
			const postId = toSafeId(postCard?.dataset.postId, `post-${index + 1}`);

			await syncInteraction(() => postApi.likePost(postId, isActive));
		});
	});

	postSaveButtons.forEach((button, index) => {
		button.addEventListener("click", async () => {
			const isActive = toggleActionIcon(button, "bx-bookmark", "bxs-bookmark");
			const postCard = button.closest(".post-card");
			const postId = toSafeId(postCard?.dataset.postId, `post-${index + 1}`);

			await syncInteraction(() => postApi.savePost(postId, isActive));
		});
	});

	commentLikeButtons.forEach((button, index) => {
		button.addEventListener("click", async () => {
			const isActive = toggleActionIcon(button, "bx-heart", "bxs-heart");
			const commentId = toSafeId(button.dataset.commentId, `comment-${index + 1}`);

			await syncInteraction(() => postApi.likeComment(commentId, isActive));
		});
	});

	if (reportPostModal && reportPostForm) {
		document.addEventListener("click", (event) => {
			const reportButton = event.target.closest('[data-action="report-post"]');
			if (!reportButton) {
				return;
			}

			event.preventDefault();
			const postId = toSafeId(reportButton.dataset.postId, "");
			openReportModal(postId);
		});

		reportPostCloseButton?.addEventListener("click", closeReportModal);
		reportPostCancelButton?.addEventListener("click", closeReportModal);

		reportPostModal.addEventListener("click", (event) => {
			if (event.target === reportPostModal) {
				closeReportModal();
			}
		});

		reportPostForm.addEventListener("submit", async (event) => {
			event.preventDefault();

			const reasonInput = reportPostForm.querySelector('input[name="report-reason"]:checked');
			const reasonCode = toSafeId(reasonInput?.value, "");

			if (activeReportPostId.length === 0) {
				setReportFeedback("Không xác định được bài đăng cần báo cáo.");
				return;
			}

			if (reasonCode.length === 0) {
				setReportFeedback("Vui lòng chọn lý do báo cáo.");
				return;
			}

			reportPostSubmitButton && (reportPostSubmitButton.disabled = true);
			clearReportFeedback();

			try {
				await postApi.reportPost(activeReportPostId, reasonCode);
				setReportFeedback("Đã gửi báo cáo thành công.", "success");

				window.setTimeout(() => {
					closeReportModal();
				}, 500);
			} catch (error) {
				console.error("Report post error:", error);
				setReportFeedback("Không thể gửi báo cáo. Vui lòng thử lại.");
			} finally {
				reportPostSubmitButton && (reportPostSubmitButton.disabled = false);
			}
		});
	}
};
