"use strict";

import { toArray } from "../utils/helpers.js";

export const initCommentModal = (triggerSelector) => {
	const commentModal = document.getElementById("comment-modal");
	if (!commentModal) {
		return;
	}

	const closeCommentModalBtn = document.getElementById("close-comment-modal");
	const triggers = triggerSelector ? toArray(document.querySelectorAll(triggerSelector)) : [];

	const openCommentModal = () => {
		commentModal.classList.add("open");
		commentModal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";
	};

	const closeCommentModal = () => {
		commentModal.classList.remove("open");
		commentModal.setAttribute("aria-hidden", "true");
		document.body.style.overflow = "";
	};

	triggers.forEach((trigger) => {
		trigger.addEventListener("click", (event) => {
			event.preventDefault();
			openCommentModal();
		});
	});

	if (typeof triggerSelector === "string" && triggerSelector.trim().length > 0) {
		document.addEventListener("click", (event) => {
			const dynamicTrigger = event.target.closest(triggerSelector);
			if (!dynamicTrigger) {
				return;
			}

			event.preventDefault();
			openCommentModal();
		});
	}

	closeCommentModalBtn?.addEventListener("click", closeCommentModal);

	commentModal.addEventListener("click", (event) => {
		if (event.target === commentModal) {
			closeCommentModal();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeCommentModal();
		}
	});
};
