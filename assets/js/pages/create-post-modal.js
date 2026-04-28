"use strict";

import { toArray } from "../utils/helpers.js";

const GOOGLE_SCRIPT_ID = "google-maps-places-sdk";
let googlePlacesPromise = null;

const getGoogleMapsApiKey = () => {
	if (typeof window.GOOGLE_MAPS_API_KEY === "string" && window.GOOGLE_MAPS_API_KEY.trim().length > 0) {
		return window.GOOGLE_MAPS_API_KEY.trim();
	}

	const bodyKey = document.body?.dataset?.googleMapsApiKey;
	if (typeof bodyKey === "string" && bodyKey.trim().length > 0) {
		return bodyKey.trim();
	}

	const htmlKey = document.documentElement?.dataset?.googleMapsApiKey;
	if (typeof htmlKey === "string" && htmlKey.trim().length > 0) {
		return htmlKey.trim();
	}

	return "";
};

const loadGooglePlacesSdk = () => {
	if (window.google?.maps?.places) {
		return Promise.resolve(window.google.maps);
	}

	if (googlePlacesPromise) {
		return googlePlacesPromise;
	}

	const apiKey = getGoogleMapsApiKey();
	if (apiKey.length === 0) {
		return Promise.resolve(null);
	}

	googlePlacesPromise = new Promise((resolve) => {
		const existingScript = document.getElementById(GOOGLE_SCRIPT_ID);
		if (existingScript) {
			existingScript.addEventListener(
				"load",
				() => resolve(window.google?.maps?.places ? window.google.maps : null),
				{ once: true }
			);
			existingScript.addEventListener("error", () => resolve(null), { once: true });
			return;
		}

		const script = document.createElement("script");
		script.id = GOOGLE_SCRIPT_ID;
		script.async = true;
		script.defer = true;
		script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=vi`;

		script.addEventListener("load", () => {
			resolve(window.google?.maps?.places ? window.google.maps : null);
		});
		script.addEventListener("error", () => {
			resolve(null);
		});

		document.head.appendChild(script);
	});

	return googlePlacesPromise;
};

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
	const postDraftPreviewGrid = document.getElementById("post-draft-preview-grid");
	const postDraftPreviewFallback = document.getElementById("post-draft-preview");
	const createPostProvinceInput = document.getElementById("create-post-province");
	const createPostVisibilityInput = document.getElementById("create-post-visibility");
	const createPostAddressInput = document.getElementById("create-post-address");
	const createPostFeedbackElement = document.getElementById("create-post-feedback");
	const createPostLinks = toArray(document.querySelectorAll(".create-post-link"));

	const previewObjectUrls = [];

	const resetPreviewGrid = () => {
		while (previewObjectUrls.length > 0) {
			const objectUrl = previewObjectUrls.pop();
			if (typeof objectUrl === "string" && objectUrl.length > 0) {
				URL.revokeObjectURL(objectUrl);
			}
		}

		if (postDraftPreviewGrid) {
			postDraftPreviewGrid.innerHTML = "";
		}

		if (postDraftPreviewFallback) {
			postDraftPreviewFallback.removeAttribute("src");
			postDraftPreviewFallback.alt = "Ảnh bản nháp bài đăng";
		}
	};

	const renderPreviewGrid = (files) => {
		const safeFiles = Array.from(files || []).filter((file) => {
			if (!(file instanceof File)) {
				return false;
			}

			return file.type.startsWith("image/") || file.type.startsWith("video/");
		});

		resetPreviewGrid();

		if (safeFiles.length === 0) {
			return;
		}

		if (postDraftPreviewGrid) {
			safeFiles.forEach((file) => {
				const previewItem = document.createElement("figure");
				previewItem.className = "draft-preview-item";

				const objectUrl = URL.createObjectURL(file);
				previewObjectUrls.push(objectUrl);

				if (file.type.startsWith("video/")) {
					const videoElement = document.createElement("video");
					videoElement.src = objectUrl;
					videoElement.muted = true;
					videoElement.loop = true;
					videoElement.playsInline = true;
					videoElement.setAttribute("aria-label", file.name || "Video bản nháp");
					previewItem.appendChild(videoElement);
				} else {
					const imageElement = document.createElement("img");
					imageElement.src = objectUrl;
					imageElement.alt = file.name || "Ảnh bản nháp";
					previewItem.appendChild(imageElement);
				}

				postDraftPreviewGrid.appendChild(previewItem);
			});
			return;
		}

		if (postDraftPreviewFallback) {
			const firstFile = safeFiles[0];
			const objectUrl = URL.createObjectURL(firstFile);
			previewObjectUrls.push(objectUrl);
			postDraftPreviewFallback.src = objectUrl;
			postDraftPreviewFallback.alt = firstFile.name || "Ảnh bản nháp bài đăng";
		}
	};

	const clearFeedback = () => {
		if (!createPostFeedbackElement) {
			return;
		}

		createPostFeedbackElement.textContent = "";
		createPostFeedbackElement.classList.add("is-hidden");
		createPostFeedbackElement.style.color = "";
	};

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

		clearFeedback();
		resetPreviewGrid();

		step1Upload?.classList.remove("is-hidden");
		step2Details?.classList.add("is-hidden");
	};

	const initAddressAutocomplete = async () => {
		if (!createPostAddressInput) {
			return;
		}

		if (createPostAddressInput.dataset.googleAutocompleteReady === "true") {
			return;
		}

		const maps = await loadGooglePlacesSdk();
		if (!maps?.places) {
			return;
		}

		const autocomplete = new maps.places.Autocomplete(createPostAddressInput, {
			fields: ["formatted_address", "name"],
			types: ["address"]
		});

		autocomplete.addListener("place_changed", () => {
			const place = autocomplete.getPlace();
			const fullAddress =
				typeof place?.formatted_address === "string" && place.formatted_address.trim().length > 0
					? place.formatted_address.trim()
					: typeof place?.name === "string"
						? place.name.trim()
						: "";

			if (fullAddress.length > 0) {
				createPostAddressInput.value = fullAddress;
			}
		});

		createPostAddressInput.dataset.googleAutocompleteReady = "true";
	};

	const openCreateModal = () => {
		resetCreateModalState();
		void initAddressAutocomplete();

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
		const selectedFiles = Array.from(event.target.files || []).filter(
			(file) => file instanceof File && file.type.startsWith("image/")
		);

		if (selectedFiles.length === 0) {
			resetPreviewGrid();
			return;
		}

		renderPreviewGrid(selectedFiles);

		step1Upload?.classList.add("is-hidden");
		step2Details?.classList.remove("is-hidden");
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
		if (event.key === "Escape" && createPostModal.classList.contains("open")) {
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
			postDraftPreviewGrid,
			postDraftPreviewFallback,
			createPostProvinceInput,
			createPostVisibilityInput,
			createPostAddressInput,
			createPostFeedbackElement
		}
	};
};