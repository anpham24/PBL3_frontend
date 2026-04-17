"use strict";

const toggleCommentActionIcon = (button, outlinedClass, solidClass) => {
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

const sendInteraction = async (endpoint, payload) => {
	try {
		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify(payload)
		});

		if (!response.ok) {
			throw new Error(`Request failed: ${response.status}`);
		}

		return await response.json().catch(() => null);
	} catch (error) {
		console.error("AJAX interaction error:", error);
		return null;
	}
};

document.addEventListener("DOMContentLoaded", () => {
	const likeCommentModalBtn = document.getElementById("btn-like-comment-modal");
	const saveCommentModalBtn = document.getElementById("btn-save-comment-modal");
	const postLikeButtons = Array.from(document.querySelectorAll(".post-like-btn"));
	const postSaveButtons = Array.from(document.querySelectorAll(".post-save-btn"));
	const commentLikeButtons = Array.from(document.querySelectorAll(".comment-like-btn"));

	likeCommentModalBtn?.addEventListener("click", async () => {
		const isActive = toggleCommentActionIcon(likeCommentModalBtn, "bx-heart", "bxs-heart");

		await sendInteraction("/api/posts/current/like", {
			liked: isActive,
			source: "comment-modal"
		});
	});

	saveCommentModalBtn?.addEventListener("click", async () => {
		const isActive = toggleCommentActionIcon(saveCommentModalBtn, "bx-bookmark", "bxs-bookmark");

		await sendInteraction("/api/posts/current/save", {
			saved: isActive,
			source: "comment-modal"
		});
	});

	postLikeButtons.forEach((button, index) => {
		button.addEventListener("click", async () => {
			const isActive = toggleCommentActionIcon(button, "bx-heart", "bxs-heart");
			const postCard = button.closest(".post-card");
			const postId = postCard?.dataset.postId || `post-${index + 1}`;

			await sendInteraction(`/api/posts/${postId}/like`, {
				liked: isActive
			});
		});
	});

	postSaveButtons.forEach((button, index) => {
		button.addEventListener("click", async () => {
			const isActive = toggleCommentActionIcon(button, "bx-bookmark", "bxs-bookmark");
			const postCard = button.closest(".post-card");
			const postId = postCard?.dataset.postId || `post-${index + 1}`;

			await sendInteraction(`/api/posts/${postId}/save`, {
				saved: isActive
			});
		});
	});

	commentLikeButtons.forEach((button, index) => {
		button.addEventListener("click", async () => {
			const isActive = toggleCommentActionIcon(button, "bx-heart", "bxs-heart");

			await sendInteraction(`/api/comments/comment-${index + 1}/like`, {
				liked: isActive
			});
		});
	});
});
