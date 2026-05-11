"use strict";

import { postApi } from "../api/post-api.js";
import { getAvtUrl, getNickname } from "../utils/auth.js";
import { apiClient } from "../api/api-client.js";

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
 * Bản đồ chuyển đổi tên tỉnh/thành sang mã provinceCode từ Master Data.
 * @param {string} provinceName - Tên tỉnh/thành từ Nominatim (extractProvince)
 * @param {Array} provincesList - Danh sách tỉnh/thành từ API
 * @returns {string} Mã provinceCode hoặc "" nếu không khớp
 */
const mapProvinceToCode = (provinceName, provincesList) => {
	if (typeof provinceName !== "string" || provinceName.trim().length === 0) return "";
	if (!Array.isArray(provincesList) || provincesList.length === 0) return "";

	const normalize = (str) => {
		return str
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.replace(/đ/gi, "d")
			.toLowerCase()
			.replace(/^(tinh|thanh pho|tp\.?\s*)\s*/i, "")
			.trim();
	};

	const target = normalize(provinceName);

	// Ưu tiên khớp chính xác
	for (const prov of provincesList) {
		if (prov && typeof prov.name === "string") {
			const pName = normalize(prov.name);
			if (pName === target) {
				return prov.code || "";
			}
		}
	}

	// Khớp tương đối nếu không có khớp chính xác
	for (const prov of provincesList) {
		if (prov && typeof prov.name === "string") {
			const pName = normalize(prov.name);
			if (pName.includes(target) || target.includes(pName)) {
				return prov.code || "";
			}
		}
	}

	return "";
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

	// ── State địa điểm đã chọn ───────────────────────────────────────────────
	// Lưu province được bóc tách khi người dùng click chọn gợi ý
	let selectedProvince = "";

	// Bug 3 fix: flag idempotent — đảm bảo listeners chỉ gắn một lần
	let locationSuggestInitialized = false;

	// ── Master Data Tỉnh/Thành ───────────────────────────────────────────────
	let masterProvinces = [];

	const fetchMasterProvinces = async () => {
		try {
			const response = await apiClient.get("/api/master-data", { requiresAuth: false });
			if (response?.data?.provinces && Array.isArray(response.data.provinces)) {
				masterProvinces = response.data.provinces;
			} else if (response?.provinces && Array.isArray(response.provinces)) {
				masterProvinces = response.provinces;
			} else if (Array.isArray(response?.data)) {
				masterProvinces = response.data;
			} else if (Array.isArray(response)) {
				masterProvinces = response;
			}
		} catch (error) {
			console.error("Lỗi khi tải danh sách tỉnh/thành:", error);
		}
	};

	// Gọi ngay khi khởi tạo component
	fetchMasterProvinces();

	// ── State quản lý ảnh đã chọn ────────────────────────────────────────────
	/**
	 * Mảng lưu trữ các đối tượng File thực tế.
	 * Đây là nguồn truth duy nhất — KHÔNG dùng postFileInput.files vì FileList là read-only.
	 */
	let selectedFiles = [];

	/** Index của ảnh/video đang hiển thị trong Main Preview. */
	let activePreviewIndex = 0;

	/** WeakMap lưu objectURL tương ứng với từng File để tránh tạo trùng lặp. */
	const fileUrlMap = new WeakMap();

	const getObjectUrl = (file) => {
		if (fileUrlMap.has(file)) return fileUrlMap.get(file);
		const url = URL.createObjectURL(file);
		fileUrlMap.set(file, url);
		return url;
	};

	const revokeObjectUrl = (file) => {
		if (fileUrlMap.has(file)) {
			URL.revokeObjectURL(fileUrlMap.get(file));
		}
	};

	// Lấy element thumbnail strip (được thêm vào HTML)
	const draftThumbnailStrip = document.getElementById("draft-thumbnail-strip");

	// ── Preview ảnh/video ─────────────────────────────────────────────────────

	const resetPreviewGrid = () => {
		selectedFiles.forEach(revokeObjectUrl);
		selectedFiles = [];
		activePreviewIndex = 0;

		if (draftPreviewInner) draftPreviewInner.innerHTML = "";
		if (draftThumbnailStrip) draftThumbnailStrip.innerHTML = "";

		uploadDropzone?.classList.remove("is-hidden");
		draftPreviewContainer?.classList.add("is-hidden");
	};

	const scrollMainPreviewTo = (index) => {
		if (!draftPreviewInner) return;
		const item = draftPreviewInner.children[index];
		if (item) item.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
	};

	const updateThumbnailActive = (index) => {
		if (!draftThumbnailStrip) return;
		draftThumbnailStrip.querySelectorAll(".draft-thumbnail-item").forEach((el, i) => {
			el.classList.toggle("is-active", i === index);
		});
		activePreviewIndex = index;
	};

	const renderThumbnailStrip = () => {
		if (!draftThumbnailStrip) return;
		draftThumbnailStrip.innerHTML = "";

		selectedFiles.forEach((file, index) => {
			const objectUrl = getObjectUrl(file);
			const item = document.createElement("div");
			item.className = "draft-thumbnail-item";
			if (index === activePreviewIndex) item.classList.add("is-active");
			item.setAttribute("role", "button");
			item.setAttribute("tabindex", "0");
			item.setAttribute("aria-label", `Xem ảnh ${index + 1}`);

			if (file.type.startsWith("video/")) {
				const videoEl = document.createElement("video");
				videoEl.src = objectUrl;
				videoEl.muted = true;
				item.appendChild(videoEl);
			} else {
				const imgEl = document.createElement("img");
				imgEl.src = objectUrl;
				imgEl.alt = file.name || `Ảnh ${index + 1}`;
				item.appendChild(imgEl);
			}

			// Nút X xóa ảnh
			const removeBtn = document.createElement("button");
			removeBtn.className = "draft-thumbnail-remove";
			removeBtn.type = "button";
			removeBtn.setAttribute("aria-label", `Xóa ảnh ${index + 1}`);
			removeBtn.innerHTML = '<i class="bx bx-x"></i>';
			removeBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				removeFileAtIndex(index);
			});
			item.appendChild(removeBtn);

			// Click → navigate
			item.addEventListener("click", () => {
				activePreviewIndex = index;
				scrollMainPreviewTo(index);
				updateThumbnailActive(index);
			});
			item.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					activePreviewIndex = index;
					scrollMainPreviewTo(index);
					updateThumbnailActive(index);
				}
			});

			draftThumbnailStrip.appendChild(item);
		});

		// Nút + thêm ảnh
		const addBtn = document.createElement("button");
		addBtn.className = "draft-thumbnail-add";
		addBtn.type = "button";
		addBtn.setAttribute("aria-label", "Thêm ảnh");
		addBtn.innerHTML = '<i class="bx bx-plus"></i>';
		addBtn.addEventListener("click", () => postFileInput?.click());
		draftThumbnailStrip.appendChild(addBtn);
	};

	const renderMainPreview = () => {
		if (!draftPreviewInner) return;
		draftPreviewInner.innerHTML = "";

		selectedFiles.forEach((file) => {
			const objectUrl = getObjectUrl(file);
			const previewItem = document.createElement("div");
			previewItem.className = "carousel-item";

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
	};

	/**
	 * Render toàn bộ preview (main + thumbnail). Gọi mỗi khi selectedFiles thay đổi.
	 */
	const renderPreview = () => {
		if (selectedFiles.length === 0) {
			uploadDropzone?.classList.remove("is-hidden");
			draftPreviewContainer?.classList.add("is-hidden");
			return;
		}

		uploadDropzone?.classList.add("is-hidden");
		draftPreviewContainer?.classList.remove("is-hidden");

		renderMainPreview();
		renderThumbnailStrip();

		if (activePreviewIndex >= selectedFiles.length) {
			activePreviewIndex = Math.max(0, selectedFiles.length - 1);
		}

		requestAnimationFrame(() => {
			scrollMainPreviewTo(activePreviewIndex);
			updateThumbnailActive(activePreviewIndex);
		});

		if (selectedFiles.length > 1) {
			draftPrevBtn?.classList.remove("is-hidden");
			draftNextBtn?.classList.remove("is-hidden");
		} else {
			draftPrevBtn?.classList.add("is-hidden");
			draftNextBtn?.classList.add("is-hidden");
		}
	};

	const removeFileAtIndex = (index) => {
		if (index < 0 || index >= selectedFiles.length) return;
		const wasActive = index === activePreviewIndex;
		revokeObjectUrl(selectedFiles[index]);
		selectedFiles.splice(index, 1);

		if (selectedFiles.length === 0) {
			resetPreviewGrid();
			return;
		}

		if (wasActive) {
			activePreviewIndex = Math.min(index, selectedFiles.length - 1);
		} else if (index < activePreviewIndex) {
			activePreviewIndex = activePreviewIndex - 1;
		}

		renderPreview();
	};

	/**
	 * Thêm (append) các file mới vào selectedFiles — KHÔNG ghi đè ảnh cũ.
	 * @param {FileList|File[]} newFiles
	 */
	const appendFiles = (newFiles) => {
		const validFiles = Array.from(newFiles || []).filter(
			(file) =>
				file instanceof File &&
				(file.type.startsWith("image/") || file.type.startsWith("video/"))
		);
		if (validFiles.length === 0) return;
		activePreviewIndex = selectedFiles.length; // trỏ đến ảnh đầu tiên vừa thêm
		selectedFiles.push(...validFiles);
		renderPreview();
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

		if (masterProvinces.length === 0) {
			fetchMasterProvinces();
		}

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
		if (!postCaptionInput) return;

		clearFeedback();

		// Guard: chặn nếu nội dung bài đăng rỗng
		const contentValue = normalizeString(postCaptionInput.value);
		if (contentValue.length === 0) {
			setFeedback("Vui lòng nhập nội dung cho bài đăng.");
			return;
		}

		// Dùng selectedFiles module-level (đã được quản lý bởi appendFiles/removeFileAtIndex)
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
		const resolvedProvinceCode = mapProvinceToCode(selectedProvince, masterProvinces);

		const payload = {
			files: selectedFiles,
			visibility: normalizeString(createPostVisibilityInput?.value) || "PUBLIC",
			content: normalizeString(postCaptionInput.value),
			address: cleanedAddress, // Giữ lại địa chỉ đầy đủ (không provinceCode) như hợp đồng API yêu cầu "address (Chuỗi địa chỉ đầy đủ)"
			provinceCode: resolvedProvinceCode
		};

		setPublishSubmittingState(true);

		try {
			const response = await postApi.createPost(buildFormData(payload));

			// Thành công 201
			setFeedback("Lưu bài thành công, Đang chờ AI kiểm duyệt.", "success");

			const createdPost = response?.data?.post || response?.data;
			if (typeof onPublish === "function" && createdPost && typeof createdPost === "object") {
				onPublish(createdPost);
			}

			// Đợi một chút để người dùng thấy thông báo thành công
			setTimeout(() => {
				if (closeOnPublish) {
					closeCreateModal();
				} else {
					resetCreateModalState();
				}
			}, 1500);
		} catch (error) {
			if (error?.status === 400) {
				setFeedback(toMessage(error, "Bài đăng thiếu nội dung, media hoặc bị AI từ chối."));
			} else if (error?.status === 500) {
				setFeedback("Lỗi hệ thống. Vui lòng thử lại sau.");
			} else {
				setFeedback(toMessage(error, "Đăng bài thất bại. Vui lòng thử lại."));
			}
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
		// Dùng appendFiles để THÊM vào danh sách, không ghi đè ảnh cũ
		appendFiles(event.target.files);
		// Reset input value để có thể chọn lại cùng một file sau khi xóa
		event.target.value = "";
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