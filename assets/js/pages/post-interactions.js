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
};
