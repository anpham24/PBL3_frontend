"use strict";

import { postApi } from "../api/post-api.js";

const GOOGLE_SCRIPT_ID = "google-maps-places-sdk";
const DEFAULT_PUBLISH_LABEL = "Đăng";
let googlePlacesPromise = null;

// ─── Google Places ────────────────────────────────────────────────────────────

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

// ─── Carousel (dùng chung cho feed card và draft preview) ────────────────────

/**
 * Khởi tạo global carousel click handler.
 * Chỉ đăng ký một lần duy nhất trên document.
 */
const initCarouselHandler = (() => {
	let registered = false;
	return () => {
		if (registered) return;
		registered = true;

		document.addEventListener("click", (event) => {
			const prevBtn = event.target.closest(".carousel-btn.prev-btn");
			const nextBtn = event.target.closest(".carousel-btn.next-btn");

			if (prevBtn) {
				const carousel = prevBtn.closest(".post-media-carousel, .draft-preview-carousel");
				const inner = carousel?.querySelector(".carousel-inner, .draft-preview-inner");
				if (inner) inner.scrollBy({ left: -inner.clientWidth, behavior: "smooth" });
			} else if (nextBtn) {
				const carousel = nextBtn.closest(".post-media-carousel, .draft-preview-carousel");
				const inner = carousel?.querySelector(".carousel-inner, .draft-preview-inner");
				if (inner) inner.scrollBy({ left: inner.clientWidth, behavior: "smooth" });
			}
		});
	};
})();

// ─── Helpers nội bộ ──────────────────────────────────────────────────────────

const normalizeString = (value) => {
	if (typeof value !== "string") return "";
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : "";
};

// ─── Khởi tạo component ──────────────────────────────────────────────────────

/**
 * Khởi tạo modal tạo bài đăng.
 *
 * @param {object} [options]
 * @param {boolean} [options.closeOnPublish=true]
 *   Tự động đóng modal sau khi submit thành công.
 * @param {function(object): void} [options.onPublish]
 *   Callback nhận object bài đăng vừa được tạo (từ API response).
 *   Ví dụ: `(post) => prependPost(post)` trong feed.js.
 * @returns {object|null} Controller với các method open/close/reset, hoặc null nếu modal không tồn tại trong DOM.
 */
export const initCreatePostModal = (options = {}) => {
	const { closeOnPublish = true, onPublish = null } = options;

	// Đăng ký carousel handler toàn cục (idempotent)
	initCarouselHandler();

	// ── Lấy elements ──────────────────────────────────────────────────────────
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
	const createPostFormElement = document.getElementById("create-post-form");

	const previewObjectUrls = [];

	// ── Preview ảnh/video ─────────────────────────────────────────────────────

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
			if (!(file instanceof File)) return false;
			return file.type.startsWith("image/") || file.type.startsWith("video/");
		});

		resetPreviewGrid();

		if (safeFiles.length === 0) return;

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

	// ── Feedback ──────────────────────────────────────────────────────────────

	const setFeedback = (message, variant = "error") => {
		if (!createPostFeedbackElement) return;
		createPostFeedbackElement.textContent = message;
		createPostFeedbackElement.classList.remove("is-hidden");
		createPostFeedbackElement.style.color = variant === "error" ? "#dc2626" : "#15803d";
	};

	const clearFeedback = () => {
		if (!createPostFeedbackElement) return;
		createPostFeedbackElement.textContent = "";
		createPostFeedbackElement.classList.add("is-hidden");
		createPostFeedbackElement.style.color = "";
	};

	// ── Reset form ────────────────────────────────────────────────────────────

	const resetCreateModalState = () => {
		if (postFileInput) postFileInput.value = "";
		if (postCaptionInput) postCaptionInput.value = "";
		if (createPostAddressInput) createPostAddressInput.value = "";
		if (createPostProvinceInput) createPostProvinceInput.selectedIndex = 0;
		if (createPostVisibilityInput) createPostVisibilityInput.selectedIndex = 0;

		clearFeedback();
		resetPreviewGrid();
	};

	// ── Google Places Autocomplete ────────────────────────────────────────────

	const initAddressAutocomplete = async () => {
		if (!createPostAddressInput) return;
		if (createPostAddressInput.dataset.googleAutocompleteReady === "true") return;

		const maps = await loadGooglePlacesSdk();
		if (!maps?.places) return;

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

	// ── Open / Close ──────────────────────────────────────────────────────────

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

	// ── Submit / Publish ──────────────────────────────────────────────────────

	const setPublishSubmittingState = (isSubmitting) => {
		if (!publishPostBtn) return;
		publishPostBtn.disabled = isSubmitting;

		if (isSubmitting) {
			publishPostBtn.innerHTML =
				'<span class="btn-spinner" aria-hidden="true"></span><span>Đang đăng...</span>';
			return;
		}

		publishPostBtn.textContent = DEFAULT_PUBLISH_LABEL;
	};

	const buildFormData = ({ files, visibility, content, address }) => {
		const formData = new FormData();
		files.forEach((file) => formData.append("files", file));
		formData.append("visibility", visibility);
		formData.append("content", content);
		formData.append("address", address);
		return formData;
	};

	const toMessage = (error, fallback) => {
		if (typeof error?.data?.message === "string" && error.data.message.trim().length > 0) {
			return error.data.message.trim();
		}
		if (typeof error?.message === "string" && error.message.trim().length > 0) {
			return error.message.trim();
		}
		return fallback;
	};

	const handleSubmit = async () => {
		if (!postFileInput || !postCaptionInput) return;

		clearFeedback();

		const selectedFiles = Array.from(postFileInput.files || []).filter(
			(file) =>
				file instanceof File &&
				(file.type.startsWith("image/") || file.type.startsWith("video/"))
		);

		if (selectedFiles.length === 0) {
			setFeedback("Vui lòng chọn ít nhất một ảnh hoặc video để đăng bài.");
			return;
		}

		const address = normalizeString(createPostAddressInput?.value);
		if (address.length === 0) {
			setFeedback("Vui lòng nhập địa chỉ cụ thể cho bài đăng.");
			return;
		}

		const payload = {
			files: selectedFiles,
			visibility: normalizeString(createPostVisibilityInput?.value) || "PUBLIC",
			content: normalizeString(postCaptionInput.value),
			address
		};

		setPublishSubmittingState(true);

		try {
			const response = await postApi.createPost(buildFormData(payload));
			const createdPost = response?.data?.post || response?.data;

			if (typeof onPublish === "function" && createdPost && typeof createdPost === "object") {
				onPublish(createdPost);
			}

			if (closeOnPublish) {
				closeCreateModal();
			} else {
				// Đặt lại form nhưng giữ modal mở (dùng cho feed.js tự đóng sau)
				resetCreateModalState();
			}
		} catch (error) {
			setFeedback(toMessage(error, "Đăng bài thất bại. Vui lòng thử lại."));
		} finally {
			setPublishSubmittingState(false);
		}
	};

	// ── Gắn event listeners ───────────────────────────────────────────────────

	// Mở modal từ bất kỳ link nào có class .create-post-link
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
			(file) =>
				file instanceof File &&
				(file.type.startsWith("image/") || file.type.startsWith("video/"))
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

	// Submit qua form (Enter hoặc nút submit bên trong form)
	createPostFormElement?.addEventListener("submit", (event) => {
		event.preventDefault();
		void handleSubmit();
	});

	// Nút "Đăng" ngoài form (nếu nằm ngoài thẻ <form>)
	if (!createPostFormElement && publishPostBtn) {
		publishPostBtn.addEventListener("click", () => void handleSubmit());
	}

	// Đóng khi click ra ngoài modal
	createPostModal.addEventListener("click", (event) => {
		if (event.target === createPostModal) {
			closeCreateModal();
		}
	});

	// Đóng bằng phím Escape
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && createPostModal.classList.contains("open")) {
			closeCreateModal();
		}
	});

	// ── Public API ────────────────────────────────────────────────────────────

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