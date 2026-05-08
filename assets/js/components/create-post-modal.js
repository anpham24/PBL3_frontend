"use strict";

import { postApi } from "../api/post-api.js";
import { getAvtUrl, getNickname } from "../utils/auth.js";

const DEFAULT_PUBLISH_LABEL = "Đăng";

// ─── Debounce utility ────────────────────────────────────────────────────────

/**
 * Trả về phiên bản debounce của fn, chỉ thực thi sau khi
 * không có lần gọi mới nào trong vòng `delay` ms.
 * @param {Function} fn
 * @param {number} delay - ms
 */
const debounce = (fn, delay) => {
	let timerId = null;
	return (...args) => {
		clearTimeout(timerId);
		timerId = setTimeout(() => fn(...args), delay);
	};
};

// ─── Nominatim Location Auto-suggest ─────────────────────────────────────────

const NOMINATIM_URL =
	"https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=vn&q=";

/**
 * Bóc tách tỉnh/thành từ object address trả về bởi Nominatim.
 * Thứ tự ưu tiên: state → city → province → county → ""
 * @param {object} address
 * @returns {string}
 */
const extractProvince = (address) => {
	if (!address || typeof address !== "object") return "";
	return (
		address.state ||
		address.city ||
		address.province ||
		address.county ||
		""
	);
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

/**
 * Xóa postal code (mã bưu điện) khỏi chuỗi địa chỉ.
 * Postal code Việt Nam thường là chuỗi 5-6 chữ số đứng riêng biệt
 * (ví dụ: "54 Nguyễn Lương Bằng, 550000, Đà Nẵng" → "54 Nguyễn Lương Bằng, Đà Nẵng").
 * @param {string} address
 * @returns {string}
 */
const removePostalCode = (address) => {
	if (typeof address !== "string") return "";
	// Xóa chuỗi 5-6 chữ số được bao quanh bởi dấu phẩy/khoảng trắng
	// và dọn dẹp dấu phẩy/khoảng trắng thừa sau khi xóa
	return address
		.replace(/,?\s*\b\d{5,6}\b\s*,?/g, ",")
		.replace(/,\s*,/g, ",")
		.replace(/^\s*,\s*/, "")
		.replace(/\s*,\s*$/, "")
		.replace(/\s{2,}/g, " ")
		.trim();
};

/**
 * Bản đồ chuyển đổi tên tỉnh/thành sang mã provinceCode.
 * Sử dụng Unicode normalization (NFD) để loại bỏ dấu tiếng Việt,
 * sau đó chuyển sang UPPER_SNAKE_CASE.
 *
 * Ví dụ:
 *   "Thành phố Đà Nẵng" → "DA_NANG"
 *   "Hà Nội"             → "HA_NOI"
 *   "Hồ Chí Minh"        → "HO_CHI_MINH"
 *
 * @param {string} provinceName - Tên tỉnh/thành từ Nominatim (extractProvince)
 * @returns {string} Mã provinceCode dạng UPPER_SNAKE_CASE hoặc "" nếu không xác định
 */
const PROVINCE_ALIASES = {
	"tp. ho chi minh": "HO_CHI_MINH",
	"tp ho chi minh": "HO_CHI_MINH",
	"tp.hcm": "HO_CHI_MINH",
	"tphcm": "HO_CHI_MINH",
	"ho chi minh city": "HO_CHI_MINH",
	"saigon": "HO_CHI_MINH",
	"sai gon": "HO_CHI_MINH",
	"ha noi capital": "HA_NOI",
	"thu do ha noi": "HA_NOI",
	"hanoi": "HA_NOI",
	"danang": "DA_NANG",
	"da nang city": "DA_NANG",
	"hue": "THUA_THIEN_HUE",
	"thua thien-hue": "THUA_THIEN_HUE",
	"ba ria - vung tau": "BA_RIA_VUNG_TAU",
	"ba ria-vung tau": "BA_RIA_VUNG_TAU",
};

const provinceToCode = (provinceName) => {
	if (typeof provinceName !== "string" || provinceName.trim().length === 0) return "";

	// Bước 1: Chuẩn hóa chuỗi — loại bỏ dấu tiếng Việt, chuyển thường
	const normalized = provinceName
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/đ/gi, "d")
		.toLowerCase()
		.trim();

	// Bước 2: Kiểm tra alias trước
	if (PROVINCE_ALIASES[normalized]) {
		return PROVINCE_ALIASES[normalized];
	}

	// Bước 3: Xóa tiền tố "tinh", "thanh pho", "tp.", "tp"
	const cleaned = normalized
		.replace(/^(tinh|thanh pho|tp\.?\s*)\s*/i, "")
		.trim();

	// Bước 4: Kiểm tra alias một lần nữa sau khi xóa tiền tố
	if (PROVINCE_ALIASES[cleaned]) {
		return PROVINCE_ALIASES[cleaned];
	}

	// Bước 5: Chuyển sang UPPER_SNAKE_CASE
	return cleaned
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+/g, "_")
		.toUpperCase();
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

	const createPostVisibilityInput = document.getElementById("create-post-visibility");
	const createPostAddressInput = document.getElementById("create-post-address");
	const createPostFeedbackElement = document.getElementById("create-post-feedback");
	const createPostFormElement = document.getElementById("create-post-form");
	const locationSuggestList = document.getElementById("location-suggest-list");

	const previewObjectUrls = [];

	// ── State địa điểm đã chọn ───────────────────────────────────────────────
	// Lưu province được bóc tách khi người dùng click chọn gợi ý
	let selectedProvince = "";

	// Bug 3 fix: flag idempotent — đảm bảo listeners chỉ gắn một lần
	let locationSuggestInitialized = false;

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

		if (createPostVisibilityInput) createPostVisibilityInput.selectedIndex = 0;

		// Xóa province đã chọn và đóng dropdown
		selectedProvince = "";
		hideSuggestList();

		clearFeedback();
		resetPreviewGrid();

		// Đặt lại nút Đăng về disabled khi reset form
		if (publishPostBtn) publishPostBtn.disabled = true;
	};

	// ── Nominatim Location Auto-suggest ───────────────────────────────────────

	/** Hiện / ẩn dropdown gợi ý */
	const showSuggestList = () => {
		if (!locationSuggestList || !createPostAddressInput) return;

		// Bug 1+2 fix: Dùng position:fixed + getBoundingClientRect()
		// để dropdown thoát khỏi mọi overflow container.
		const rect = createPostAddressInput.getBoundingClientRect();
		locationSuggestList.style.top = `${rect.bottom + 6}px`;
		locationSuggestList.style.left = `${rect.left}px`;
		locationSuggestList.style.width = `${rect.width}px`;

		locationSuggestList.classList.remove("is-hidden");
		createPostAddressInput.setAttribute("aria-expanded", "true");
	};

	const hideSuggestList = () => {
		locationSuggestList?.classList.add("is-hidden");
		createPostAddressInput?.setAttribute("aria-expanded", "false");
	};

	/** Render danh sách gợi ý từ kết quả Nominatim */
	const renderSuggestions = (results) => {
		if (!locationSuggestList) return;

		locationSuggestList.innerHTML = "";

		if (!results || results.length === 0) {
			const emptyMsg = document.createElement("li");
			emptyMsg.className = "location-suggest-msg";
			emptyMsg.textContent = "Không tìm thấy địa điểm phù hợp.";
			locationSuggestList.appendChild(emptyMsg);
			showSuggestList();
			return;
		}

		results.forEach((place) => {
			const cleanedDisplayName = removePostalCode(place.display_name);

			const item = document.createElement("li");
			item.className = "location-suggest-item";
			item.setAttribute("role", "option");
			item.setAttribute("tabindex", "-1");
			item.innerHTML = `<i class="bx bx-map-pin" aria-hidden="true"></i><span>${cleanedDisplayName}</span>`;

			item.addEventListener("mousedown", (e) => {
				// mousedown thay vì click để chạy trước blur của input
				e.preventDefault();
				createPostAddressInput.value = cleanedDisplayName;
				selectedProvince = extractProvince(place.address);
				hideSuggestList();
			});

			locationSuggestList.appendChild(item);
		});

		showSuggestList();
	};

	/** Gọi Nominatim API, xử lý lỗi và cập nhật UI */
	const fetchSuggestions = async (query) => {
		if (!locationSuggestList) return;

		// Hiện trạng thái đang tải
		locationSuggestList.innerHTML =
			'<li class="location-suggest-msg">Đang tìm kiếm...</li>';
		showSuggestList();

		try {
			const response = await fetch(`${NOMINATIM_URL}${encodeURIComponent(query)}`, {
				headers: { "Accept-Language": "vi,en" }
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const data = await response.json();
			renderSuggestions(Array.isArray(data) ? data : []);
		} catch {
			locationSuggestList.innerHTML =
				'<li class="location-suggest-msg">Lỗi kết nối. Vui lòng thử lại.</li>';
			showSuggestList();
		}
	};

	/** Phiên bản debounce 500ms của fetchSuggestions */
	const debouncedFetch = debounce(fetchSuggestions, 500);

	/** Gắn sự kiện input cho ô địa chỉ (idempotent — chỉ gắn 1 lần) */
	const initLocationSuggest = () => {
		// Bug 3 fix: kiểm tra flag trước để không gắn listener trùng
		if (locationSuggestInitialized) return;
		if (!createPostAddressInput || !locationSuggestList) return;

		createPostAddressInput.addEventListener("input", () => {
			const query = createPostAddressInput.value.trim();

			// Nếu người dùng thay đổi nội dung thủ công → xóa province đã chọn trước
			selectedProvince = "";

			if (query.length === 0) {
				hideSuggestList();
				locationSuggestList.innerHTML = "";
				return;
			}

			debouncedFetch(query);
		});

		// Ẩn dropdown khi click ra ngoài khu vực tìm kiếm
		createPostAddressInput.addEventListener("blur", () => {
			// Dùng setTimeout để blur chạy sau mousedown của item
			setTimeout(hideSuggestList, 150);
		});

		// Cho phép điều hướng bằng bàn phím (Escape)
		createPostAddressInput.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				hideSuggestList();
			}
		});

		locationSuggestInitialized = true;
	};

	// ── Open / Close ──────────────────────────────────────────────────────────

	const openCreateModal = () => {
		resetCreateModalState();
		populateAuthorInfo();

		createPostModal.classList.add("open");
		createPostModal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";
	};

	// Gọi initLocationSuggest() một lần ngay khi khởi tạo component
	// (không gọi lại trong openCreateModal để tránh duplicate listeners)
	initLocationSuggest();

	// ── Điền thông tin tác giả từ localStorage ────────────────────────────────

	const DEFAULT_AVATAR = "../assets/images/225-default-avatar.png";

	/**
	 * Lấy avtUrl và nickname từ localStorage (qua auth helpers)
	 * và gán vào các phần tử tương ứng trong modal.
	 * - Avatar fallback về ảnh mặc định nếu avtUrl trống/null/undefined.
	 * - Nickname fallback về "Người dùng" nếu rỗng.
	 */
	const populateAuthorInfo = () => {
		const avatarEl = createPostModal.querySelector("#create-post-author-avatar");
		const nicknameEl = createPostModal.querySelector(".create-post-author-nickname");

		if (avatarEl) {
			const rawAvtUrl = getAvtUrl();
			avatarEl.src =
				typeof rawAvtUrl === "string" && rawAvtUrl.trim().length > 0
					? rawAvtUrl.trim()
					: DEFAULT_AVATAR;
			// Đặt lại fallback nếu URL ảnh bị lỗi khi tải
			avatarEl.onerror = () => {
				avatarEl.onerror = null;
				avatarEl.src = DEFAULT_AVATAR;
			};
		}

		if (nicknameEl) {
			const rawNickname = getNickname();
			nicknameEl.textContent =
				typeof rawNickname === "string" && rawNickname.trim().length > 0
					? rawNickname.trim()
					: "Người dùng";
		}
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

	const buildFormData = ({ files, visibility, content, address, provinceCode }) => {
		const formData = new FormData();
		files.forEach((file) => formData.append("files", file));
		formData.append("visibility", visibility);
		formData.append("content", content);
		formData.append("address", address);
		formData.append("provinceCode", provinceCode);
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

		// Guard: chặn nếu nội dung bài đăng rỗng
		const contentValue = normalizeString(postCaptionInput.value);
		if (contentValue.length === 0) {
			setFeedback("Vui lòng nhập nội dung cho bài đăng.");
			return;
		}

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

		const cleanedAddress = removePostalCode(address);
		const resolvedProvinceCode = provinceToCode(selectedProvince);

		const payload = {
			files: selectedFiles,
			visibility: normalizeString(createPostVisibilityInput?.value) || "PUBLIC",
			content: normalizeString(postCaptionInput.value),
			address: cleanedAddress,
			provinceCode: resolvedProvinceCode
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

	// Điều khiển trạng thái disabled của nút Đăng theo nội dung textarea
	if (postCaptionInput && publishPostBtn) {
		postCaptionInput.addEventListener("input", () => {
			const hasContent = postCaptionInput.value.trim().length > 0;
			publishPostBtn.disabled = !hasContent;
		});
	}

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

			createPostVisibilityInput,
			createPostAddressInput,
			createPostFeedbackElement
		}
	};
};