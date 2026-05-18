"use strict";

import { postApi } from "../api/post-api.js";
import { getAvtUrl, getNickname } from "../utils/auth.js";
import { apiClient } from "../api/api-client.js";

const DEFAULT_PUBLISH_LABEL = "Đăng";
const DEFAULT_EDIT_LABEL = "Lưu";

// ─── HTML Template ────────────────────────────────────────────────────────────

const CREATE_POST_MODAL_HTML = `
<div id="create-post-modal" class="create-post-modal" aria-hidden="true" role="dialog" aria-modal="true">
	<div class="create-post-dialog split-layout">
		<div class="create-preview-col">
			<div class="upload-dropzone">
				<i class="bx bx-images" aria-hidden="true"></i>
				<p>Chọn ảnh hoặc video để bắt đầu tạo bài đăng mới</p>
				<button id="choose-file-btn" class="choose-file-btn" type="button">Chọn từ máy tính</button>
				<input type="file" id="post-file-input" accept="image/*,video/*" multiple hidden>
			</div>
			<div id="draft-preview-container" class="draft-preview-container is-hidden">
				<div id="post-draft-preview-carousel" class="draft-preview-carousel">
					<div id="post-draft-preview-inner" class="draft-preview-inner"></div>
					<button id="draft-prev-btn" class="carousel-btn prev-btn is-hidden" type="button"
						aria-label="Ảnh trước"><i class="bx bx-chevron-left"></i></button>
					<button id="draft-next-btn" class="carousel-btn next-btn is-hidden" type="button"
						aria-label="Ảnh tiếp theo"><i class="bx bx-chevron-right"></i></button>
				</div>
				<div id="draft-thumbnail-strip" class="draft-thumbnail-strip" aria-label="Danh sách ảnh đã chọn" role="list"></div>
			</div>
		</div>

		<div class="create-form-col">
			<header class="create-modal-header">
				<h2 id="create-post-title">Tạo bài đăng</h2>
				<button id="close-create-modal" class="modal-close-btn" type="button" aria-label="Đóng">
					<i class="bx bx-x"></i>
				</button>
			</header>

			<form id="create-post-form" class="create-modal-body" novalidate>
				<div class="create-detail-top">
					<div class="create-post-author">
						<img class="detail-avatar" id="create-post-author-avatar"
							src="../assets/images/default-avatar.png"
							alt="Avatar người dùng">
						<span class="create-post-author-nickname">Người dùng</span>
					</div>

					<div class="detail-chips">
						<label class="detail-chip detail-chip-select" for="create-post-visibility">
							<i class="bx bx-lock-alt"></i>
							<select id="create-post-visibility" aria-label="Quyền riêng tư bài đăng" required>
								<option value="PUBLIC">Công khai</option>
								<option value="PRIVATE">Chỉ mình tôi</option>
							</select>
						</label>
					</div>
				</div>

				<div class="post-caption-wrap">
					<textarea id="post-caption-input" placeholder="Viết chú thích cho bài đăng..."></textarea>
				</div>

				<div class="post-caption-wrap location-input-wrap">
					<label class="location-input-label" for="create-post-address">
						<i class="bx bx-map-pin" aria-hidden="true"></i>
						<input id="create-post-address" type="text" placeholder="Nhập địa điểm..." required
							autocomplete="off" aria-autocomplete="list"
							aria-controls="location-suggest-list" aria-expanded="false">
					</label>
					<ul id="location-suggest-list" class="location-suggest-list is-hidden"
						role="listbox" aria-label="Gợi ý địa điểm"></ul>
				</div>

				<p id="create-post-feedback" class="create-post-feedback is-hidden" role="status"
					aria-live="polite"></p>

				<div class="create-modal-footer">
					<button id="publish-post-btn" class="publish-btn" type="submit">Đăng</button>
				</div>
			</form>
		</div>
	</div>
</div>
`;

/**
 * Chèn HTML của create-post-modal vào cuối <body> nếu chưa tồn tại.
 * Idempotent: gọi nhiều lần cũng chỉ inject một lần.
 */
const injectCreatePostModal = () => {
	if (document.getElementById("create-post-modal")) return;
	document.body.insertAdjacentHTML("beforeend", CREATE_POST_MODAL_HTML);
};

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

	// Inject HTML vào DOM nếu chưa có (idempotent)
	injectCreatePostModal();

	// Đăng ký carousel handler toàn cục (idempotent)
	initCarouselHandler();

	// ── Lấy elements ──────────────────────────────────────────────────────────
	const createPostModal = document.getElementById("create-post-modal");

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

	// Bug 3 fix: flag idempotent — đảm bảo listeners chỉ gắn một lần
	let locationSuggestInitialized = false;

	// ── State quản lý media ───────────────────────────────────────────────────
	/**
	 * Mảng mediaItems — nguồn truth duy nhất cho toàn bộ preview.
	 * Mỗi phần tử là một trong hai cấu trúc:
	 *   - Media cũ (từ server): { id, type: 'old', url, mediaType: 'image'|'video' }
	 *   - File mới (upload):    { id, type: 'new', file: File }
	 */
	let mediaItems = [];

	/** Index của item đang hiển thị trong Main Preview. */
	let activePreviewIndex = 0;

	// ── Edit state ────────────────────────────────────────────────────────────
	/** null = chế độ Create; string = chế độ Edit (postId đang sửa). */
	let editPostId = null;

	/** Snapshot URL media gốc khi mở Edit, dùng để phát hiện xóa media cũ. */
	let originalMediaUrls = [];

	// ── Object URL cache (chỉ cho File mới) ──────────────────────────────────
	/** WeakMap lưu objectURL tương ứng với từng File để tránh tạo trùng lặp. */
	const fileUrlMap = new WeakMap();

	const getObjectUrl = (file) => {
		if (fileUrlMap.has(file)) return fileUrlMap.get(file);
		const url = URL.createObjectURL(file);
		fileUrlMap.set(file, url);
		return url;
	};

	/**
	 * Lấy URL hiển thị của một mediaItem.
	 * - type 'old': trả về item.url trực tiếp.
	 * - type 'new': tạo/lấy objectURL từ fileUrlMap.
	 * @param {{ type: string, url?: string, file?: File }} item
	 * @returns {string}
	 */
	const getMediaUrl = (item) => {
		if (item.type === "old") return item.url;
		return getObjectUrl(item.file);
	};

	/**
	 * Xác định mediaType (image/video) của một mediaItem.
	 * @param {{ type: string, mediaType?: string, file?: File }} item
	 * @returns {'image'|'video'}
	 */
	const getMediaType = (item) => {
		if (item.type === "old") return item.mediaType || "image";
		return item.file.type.startsWith("video/") ? "video" : "image";
	};

	/** Giải phóng objectURL nếu item là 'new'. */
	const revokeItemUrl = (item) => {
		if (item.type === "new" && fileUrlMap.has(item.file)) {
			URL.revokeObjectURL(fileUrlMap.get(item.file));
		}
	};

	// Lấy element thumbnail strip (được thêm vào HTML)
	const draftThumbnailStrip = document.getElementById("draft-thumbnail-strip");

	// ── Preview ảnh/video ─────────────────────────────────────────────────────

	const resetPreviewGrid = () => {
		mediaItems.forEach(revokeItemUrl);
		mediaItems = [];
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

		mediaItems.forEach((mediaItem, index) => {
			const mediaUrl = getMediaUrl(mediaItem);
			const mediaType = getMediaType(mediaItem);
			const item = document.createElement("div");
			item.className = "draft-thumbnail-item";
			if (index === activePreviewIndex) item.classList.add("is-active");
			item.setAttribute("role", "button");
			item.setAttribute("tabindex", "0");
			item.setAttribute("aria-label", `Xem ảnh ${index + 1}`);

			if (mediaType === "video") {
				const videoEl = document.createElement("video");
				videoEl.src = mediaUrl;
				videoEl.muted = true;
				item.appendChild(videoEl);
			} else {
				const imgEl = document.createElement("img");
				imgEl.src = mediaUrl;
				imgEl.alt = `Ảnh ${index + 1}`;
				item.appendChild(imgEl);
			}

			// Nút X xóa media
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

		mediaItems.forEach((mediaItem) => {
			const mediaUrl = getMediaUrl(mediaItem);
			const mediaType = getMediaType(mediaItem);
			const previewItem = document.createElement("div");
			previewItem.className = "carousel-item";

			if (mediaType === "video") {
				const videoElement = document.createElement("video");
				videoElement.src = mediaUrl;
				videoElement.muted = true;
				videoElement.loop = true;
				videoElement.playsInline = true;
				videoElement.controls = true;
				videoElement.setAttribute("aria-label", "Video bản nháp");
				previewItem.appendChild(videoElement);
			} else {
				const imageElement = document.createElement("img");
				imageElement.src = mediaUrl;
				imageElement.alt = "Ảnh bản nháp";
				previewItem.appendChild(imageElement);
			}

			draftPreviewInner.appendChild(previewItem);
		});
	};

	/**
	 * Render toàn bộ preview (main + thumbnail). Gọi mỗi khi mediaItems thay đổi.
	 */
	const renderPreview = () => {
		if (mediaItems.length === 0) {
			uploadDropzone?.classList.remove("is-hidden");
			draftPreviewContainer?.classList.add("is-hidden");
			return;
		}

		uploadDropzone?.classList.add("is-hidden");
		draftPreviewContainer?.classList.remove("is-hidden");

		renderMainPreview();
		renderThumbnailStrip();

		if (activePreviewIndex >= mediaItems.length) {
			activePreviewIndex = Math.max(0, mediaItems.length - 1);
		}

		requestAnimationFrame(() => {
			scrollMainPreviewTo(activePreviewIndex);
			updateThumbnailActive(activePreviewIndex);
		});

		if (mediaItems.length > 1) {
			draftPrevBtn?.classList.remove("is-hidden");
			draftNextBtn?.classList.remove("is-hidden");
		} else {
			draftPrevBtn?.classList.add("is-hidden");
			draftNextBtn?.classList.add("is-hidden");
		}
	};

	const removeFileAtIndex = (index) => {
		if (index < 0 || index >= mediaItems.length) return;
		const wasActive = index === activePreviewIndex;
		revokeItemUrl(mediaItems[index]);
		mediaItems.splice(index, 1);

		if (mediaItems.length === 0) {
			resetPreviewGrid();
			return;
		}

		if (wasActive) {
			activePreviewIndex = Math.min(index, mediaItems.length - 1);
		} else if (index < activePreviewIndex) {
			activePreviewIndex = activePreviewIndex - 1;
		}

		renderPreview();
	};

	/**
	 * Thêm (append) các file mới vào mediaItems — KHÔNG ghi đè media cũ.
	 * Mỗi File được wrap thành mediaItem { type: 'new', file, id }.
	 * @param {FileList|File[]} newFiles
	 */
	const appendFiles = (newFiles) => {
		const validFiles = Array.from(newFiles || []).filter(
			(file) =>
				file instanceof File &&
				(file.type.startsWith("image/") || file.type.startsWith("video/"))
		);
		if (validFiles.length === 0) return;
		activePreviewIndex = mediaItems.length; // trỏ đến item đầu tiên vừa thêm
		validFiles.forEach((file) => {
			mediaItems.push({ id: `new-${Date.now()}-${Math.random()}`, type: "new", file });
		});
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
		// Xóa edit state
		editPostId = null;
		originalMediaUrls = [];

		if (postFileInput) postFileInput.value = "";
		if (postCaptionInput) postCaptionInput.value = "";
		if (createPostAddressInput) createPostAddressInput.value = "";

		if (createPostVisibilityInput) createPostVisibilityInput.selectedIndex = 0;

		// Đóng dropdown gợi ý địa chỉ
		hideSuggestList();

		clearFeedback();
		resetPreviewGrid();

		// Khôi phục tiêu đề và nút submit về chế độ Create
		const modalTitle = createPostModal.querySelector(".create-post-modal-title");
		if (modalTitle) modalTitle.textContent = "Tạo bài viết";
		if (publishPostBtn) {
			publishPostBtn.textContent = DEFAULT_PUBLISH_LABEL;
			publishPostBtn.disabled = true;
		}
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

	const DEFAULT_AVATAR = "../assets/images/default-avatar.png";

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
			const loadingLabel = editPostId ? "Đang lưu..." : "Đang đăng...";
			publishPostBtn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span><span>${loadingLabel}</span>`;
			return;
		}

		publishPostBtn.textContent = editPostId ? DEFAULT_EDIT_LABEL : DEFAULT_PUBLISH_LABEL;
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
		if (!postCaptionInput) return;

		clearFeedback();

		// Guard: chặn nếu nội dung bài đăng rỗng
		const contentValue = normalizeString(postCaptionInput.value);
		if (contentValue.length === 0) {
			setFeedback("Vui lòng nhập nội dung cho bài đăng.");
			return;
		}

		const address = normalizeString(createPostAddressInput?.value);
		if (address.length === 0) {
			setFeedback("Vui lòng nhập địa chỉ cụ thể cho bài đăng.");
			return;
		}

		const cleanedAddress = removePostalCode(address);
		const visibility = normalizeString(createPostVisibilityInput?.value) || "PUBLIC";

		setPublishSubmittingState(true);

		try {
			if (editPostId) {
				// ── Chế độ Edit ─────────────────────────────────────────────
				if (mediaItems.length === 0) {
					setFeedback("Vui lòng giữ lại hoặc thêm ít nhất một ảnh/video.");
					return;
				}

				// Tách old URL (giữ lại) và new File (mới upload)
				const oldUrls = mediaItems
					.filter((item) => item.type === "old")
					.map((item) => item.url);
				const newFiles = mediaItems.filter((item) => item.type === "new");

				// isMediaChanged = true nếu có file mới HOẶC có url cũ bị xóa
				const isMediaChanged =
					newFiles.length > 0 ||
					oldUrls.length !== originalMediaUrls.length ||
					!oldUrls.every((url) => originalMediaUrls.includes(url));

				const formData = new FormData();
				formData.append("isMediaChanged", isMediaChanged.toString());
				oldUrls.forEach((url) => formData.append("oldUrls", url));
				newFiles.forEach((item) => formData.append("newFiles", item.file));
				formData.append("content", contentValue);
				formData.append("visibility", visibility);
				formData.append("address", cleanedAddress);

				const editResponse = await postApi.updatePost(editPostId, formData);

				const editMsg =
					typeof editResponse?.data?.message === "string" && editResponse.data.message.trim().length > 0
						? editResponse.data.message.trim()
						: "Lưu bài thành công!";
				setFeedback(editMsg, "success");

				if (typeof options.onUpdate === "function") {
					options.onUpdate(editPostId);
				}
			} else {
				// ── Chế độ Create ────────────────────────────────────────────
				if (mediaItems.length === 0) {
					setFeedback("Vui lòng chọn ít nhất một ảnh hoặc video để đăng bài.");
					return;
				}

				const newFilesOnly = mediaItems.map((item) => item.file);
				const payload = {
					files: newFilesOnly,
					visibility,
					content: contentValue,
					address: cleanedAddress
				};

				const response = await postApi.createPost(buildFormData(payload));

				const createMsg =
					typeof response?.data?.message === "string" && response.data.message.trim().length > 0
						? response.data.message.trim()
						: "Đăng bài thành công! Đang chờ AI kiểm duyệt.";
				setFeedback(createMsg, "success");

				const createdPost = response?.data?.post || response?.data;
				if (typeof onPublish === "function" && createdPost && typeof createdPost === "object") {
					onPublish(createdPost);
				}
			}

			// Đợi một chút để người dùng thấy thông báo thành công, sau đó redirect về profile
			setTimeout(() => {
				if (closeOnPublish) {
					closeCreateModal();
				} else {
					resetCreateModalState();
				}
				window.location.href = "profile.html";
			}, 1500);
		} catch (error) {
			if (error?.status === 400) {
				setFeedback(toMessage(error, "Bài đăng thiếu nội dung, media hoặc bị AI từ chối."));
			} else if (error?.status === 500) {
				setFeedback("Lỗi hệ thống. Vui lòng thử lại sau.");
			} else {
				setFeedback(toMessage(error, editPostId ? "Cập nhật bài thất bại. Vui lòng thử lại." : "Đăng bài thất bại. Vui lòng thử lại."));
			}
		} finally {
			setPublishSubmittingState(false);
		}
	};

	// ── Open / Edit ───────────────────────────────────────────────────────────

	/**
	 * Mở modal ở chế độ Edit, populate dữ liệu từ postData.
	 * @param {{
	 *   id: string,
	 *   content?: string,
	 *   address?: string,
	 *   visibility?: string,
	 *   mediaList?: Array<{mediaType: string, mediaUrl: string}>
	 * }} postData
	 */
	const openEdit = (postData) => {
		if (!postData?.id) {
			console.warn("openEdit: postData.id bị thiếu.");
			return;
		}

		resetCreateModalState();
		editPostId = postData.id;

		// Đổ nội dung text
		if (postCaptionInput) {
			postCaptionInput.value = postData.content || "";
		}
		if (createPostAddressInput) {
			createPostAddressInput.value = postData.address || "";
		}
		if (createPostVisibilityInput && postData.visibility) {
			const opt = Array.from(createPostVisibilityInput.options).find(
				(o) => o.value === postData.visibility
			);
			if (opt) createPostVisibilityInput.value = postData.visibility;
		}

		// Đổ mediaList thành mediaItems type 'old'
		const mediaList = Array.isArray(postData.mediaList) ? postData.mediaList : [];
		mediaItems = mediaList.map((m, i) => ({
			id: `old-${i}-${m.mediaUrl}`,
			type: "old",
			url: m.mediaUrl,
			mediaType: m.mediaType === "VIDEO" || m.mediaType === "video" ? "video" : "image"
		}));

		// Lưu snapshot URL gốc để so sánh khi submit
		originalMediaUrls = mediaItems.map((item) => item.url);

		// Populate avatar/nickname
		populateAuthorInfo();

		// Cập nhật tiêu đề và nút submit
		const modalTitle = createPostModal.querySelector(".create-post-modal-title");
		if (modalTitle) modalTitle.textContent = "Chỉnh sửa bài viết";
		if (publishPostBtn) {
			publishPostBtn.textContent = DEFAULT_EDIT_LABEL;
			publishPostBtn.disabled = false;
		}

		// Render media preview nếu có
		activePreviewIndex = 0;
		renderPreview();

		createPostModal.classList.add("open");
		createPostModal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";
	};

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
		openEdit,
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