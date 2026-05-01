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

	const uploadDropzone = document.querySelector(".upload-dropzone");
	const draftPreviewContainer = document.getElementById("draft-preview-container");
	const draftPreviewInner = document.getElementById("post-draft-preview-inner");
	const draftPrevBtn = document.getElementById("draft-prev-btn");
	const draftNextBtn = document.getElementById("draft-next-btn");
	const reselectFileBtn = document.getElementById("reselect-file-btn");
	const chooseFileBtn = document.getElementById("choose-file-btn");
	const postFileInput = document.getElementById("post-file-input");
	const closeCreateModalBtn = document.getElementById("close-create-modal");
	const publishPostBtn = document.getElementById("publish-post-btn");
	const postCaptionInput = document.getElementById("post-caption-input");
	const createPostProvinceInput = document.getElementById("create-post-province");
	const createPostVisibilityInput = document.getElementById("create-post-visibility");
	const createPostAddressInput = document.getElementById("create-post-address");
	const createPostFeedbackElement = document.getElementById("create-post-feedback");

	const previewObjectUrls = [];

	const resetPreviewGrid = () => {
		while (previewObjectUrls.length > 0) {
			const objectUrl = previewObjectUrls.pop();
			if (typeof objectUrl === "string" && objectUrl.length > 0) {
				URL.revokeObjectURL(objectUrl);
			}
		}

		if (draftPreviewInner) {
			draftPreviewInner.innerHTML = "";
		}

		uploadDropzone?.classList.remove("is-hidden");
		draftPreviewContainer?.classList.add("is-hidden");
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

		if (draftPreviewInner) {
			safeFiles.forEach((file) => {
				const previewItem = document.createElement("div");
				previewItem.className = "carousel-item";

				const objectUrl = URL.createObjectURL(file);
				previewObjectUrls.push(objectUrl);

				if (file.type.startsWith("video/")) {
					const videoElement = document.createElement("video");
					videoElement.src = objectUrl;
					videoElement.muted = true;
					videoElement.loop = true;
					videoElement.playsInline = true;
					videoElement.controls = true;
					videoElement.setAttribute("aria-label", file.name || "Video bản nháp");
					previewItem.appendChild(videoElement);
				} else {
					const imageElement = document.createElement("img");
					imageElement.src = objectUrl;
					imageElement.alt = file.name || "Ảnh bản nháp";
					previewItem.appendChild(imageElement);
				}

				draftPreviewInner.appendChild(previewItem);
			});
			
			uploadDropzone?.classList.add("is-hidden");
			draftPreviewContainer?.classList.remove("is-hidden");
			
			if (safeFiles.length > 1) {
				draftPrevBtn?.classList.remove("is-hidden");
				draftNextBtn?.classList.remove("is-hidden");
			} else {
				draftPrevBtn?.classList.add("is-hidden");
				draftNextBtn?.classList.add("is-hidden");
			}
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

	document.body.addEventListener("click", (event) => {
		const link = event.target.closest(".create-post-link");
		if (link) {
			event.preventDefault();
			openCreateModal();
		}
	});

	chooseFileBtn?.addEventListener("click", () => {
		postFileInput?.click();
	});

	postFileInput?.addEventListener("change", (event) => {
		const selectedFiles = Array.from(event.target.files || []).filter(
			(file) => file instanceof File && (file.type.startsWith("image/") || file.type.startsWith("video/"))
		);

		if (selectedFiles.length === 0) {
			resetPreviewGrid();
			return;
		}

		renderPreviewGrid(selectedFiles);
	});

	reselectFileBtn?.addEventListener("click", () => {
		postFileInput?.click();
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
			postFileInput,
			publishPostBtn,
			postCaptionInput,
			createPostProvinceInput,
			createPostVisibilityInput,
			createPostAddressInput,
			createPostFeedbackElement
		}
	};
};