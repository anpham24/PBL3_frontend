"use strict";

import { toArray } from "../utils/helpers.js";

export const initCreatePostModal = (options = {}) => {
	const { closeOnPublish = true } = options;

	const createPostModal = document.getElementById("create-post-modal");
	if (!createPostModal) {
		return null;
	}

	const step1Upload = document.getElementById("step-1-upload");
	const step2Details = document.getElementById("step-2-details");
	const chooseFileBtn = document.getElementById("choose-file-btn");
	const postFileInput = document.getElementById("post-file-input");
	const closeCreateModalBtn = document.getElementById("close-create-modal");
	const publishPostBtn = document.getElementById("publish-post-btn");
	const postCaptionInput = document.getElementById("post-caption-input");
	const postDraftPreview = document.getElementById("post-draft-preview");
	const createPostProvinceInput = document.getElementById("create-post-province");
	const createPostVisibilityInput = document.getElementById("create-post-visibility");
	const createPostAddressInput = document.getElementById("create-post-address");
	const createPostFeedbackElement = document.getElementById("create-post-feedback");
	const createPostLinks = toArray(document.querySelectorAll(".create-post-link"));

	const resetCreateModalState = () => {
		if (postFileInput) {
			postFileInput.value = "";
		}

		if (postCaptionInput) {
			postCaptionInput.value = "";
		}

		if (createPostAddressInput) {
			createPostAddressInput.value = "";
		}

		if (createPostProvinceInput) {
			createPostProvinceInput.selectedIndex = 0;
		}

		if (createPostVisibilityInput) {
			createPostVisibilityInput.selectedIndex = 0;
		}

		if (createPostFeedbackElement) {
			createPostFeedbackElement.textContent = "";
			createPostFeedbackElement.classList.add("is-hidden");
			createPostFeedbackElement.style.color = "";
		}

		if (postDraftPreview) {
			postDraftPreview.removeAttribute("src");
			postDraftPreview.alt = "Ảnh bản nháp bài đăng";
		}

		step1Upload?.classList.remove("is-hidden");
		step2Details?.classList.add("is-hidden");
	};

	const openCreateModal = () => {
		resetCreateModalState();
		createPostModal.classList.add("open");
		createPostModal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";
	};

	const closeCreateModal = () => {
		createPostModal.classList.remove("open");
		createPostModal.setAttribute("aria-hidden", "true");
		resetCreateModalState();
		document.body.style.overflow = "";
	};

	createPostLinks.forEach((link) => {
		link.addEventListener("click", (event) => {
			event.preventDefault();
			openCreateModal();
		});
	});

	chooseFileBtn?.addEventListener("click", () => {
		postFileInput?.click();
	});

	postFileInput?.addEventListener("change", (event) => {
		const selectedFile = event.target.files?.[0];
		if (!selectedFile) {
			return;
		}

		const reader = new FileReader();
		reader.onload = (loadEvent) => {
			const dataUrl = loadEvent.target?.result;
			if (typeof dataUrl !== "string" || !postDraftPreview) {
				return;
			}

			postDraftPreview.src = dataUrl;
			postDraftPreview.alt = selectedFile.name || "Ảnh bản nháp bài đăng";

			step1Upload?.classList.add("is-hidden");
			step2Details?.classList.remove("is-hidden");
		};

		reader.readAsDataURL(selectedFile);
	});

	closeCreateModalBtn?.addEventListener("click", closeCreateModal);

	if (closeOnPublish) {
		publishPostBtn?.addEventListener("click", closeCreateModal);
	}

	createPostModal.addEventListener("click", (event) => {
		if (event.target === createPostModal) {
			closeCreateModal();
		}
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			closeCreateModal();
		}
	});

	return {
		open: openCreateModal,
		close: closeCreateModal,
		reset: resetCreateModalState,
		elements: {
			createPostModal,
			step1Upload,
			step2Details,
			postFileInput,
			publishPostBtn,
			postCaptionInput,
			postDraftPreview,
			createPostProvinceInput,
			createPostVisibilityInput,
			createPostAddressInput,
			createPostFeedbackElement
		}
	};
};
