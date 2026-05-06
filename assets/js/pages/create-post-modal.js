"use strict";

import { toArray } from "../utils/helpers.js";

const initAddressAutocomplete = () => {
	const addressInput = document.getElementById("create-post-address");
	const suggestionsBox = document.getElementById("address-suggestions");

	if (!addressInput || !suggestionsBox) return;

	let debounceTimer;
	let abortController = null;

	const translateAddressToVietnamese = (displayName) => {
		if (!displayName) return "";

		let parts = displayName.split(',').map(p => p.trim());
		let resultParts = [];

		// Danh sách 34 Tỉnh/Thành phố theo kịch bản sáp nhập mới nhất
		const twCities = [
			"Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", "Cần Thơ", "Huế"
		];
		const provinces = [
			"An Giang", "Bắc Ninh", "Cà Mau", "Cao Bằng", "Đắk Lắk",
			"Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Tĩnh",
			"Hưng Yên", "Khánh Hòa", "Lai Châu", "Lâm Đồng", "Lạng Sơn",
			"Lào Cai", "Nghệ An", "Ninh Bình", "Phú Thọ", "Quảng Ngãi",
			"Quảng Ninh", "Quảng Trị", "Sơn La", "Tây Ninh", "Thái Nguyên",
			"Thanh Hóa", "Tuyên Quang", "Vĩnh Long"
		];

		for (let part of parts) {
			// Loại bỏ mã bưu điện
			if (/^\d{4,6}$/.test(part)) continue;
			// Loại bỏ chữ Vietnam/Việt Nam để tránh lặp
			if (/vi[êe]t\s*nam/i.test(part)) continue;

			let text = part;

			text = text.replace(/Hồ Chí Thành phố Minh/i, 'Hồ Chí Minh');
			text = text.replace(/Ho Chi Minh/i, 'Hồ Chí Minh');
			text = text.replace(/Ha Noi/i, 'Hà Nội');
			text = text.replace(/Hai Phong/i, 'Hải Phòng');
			text = text.replace(/Da Nang/i, 'Đà Nẵng');
			text = text.replace(/Can Tho/i, 'Cần Thơ');

			text = text.replace(/^(.*?)\s+City$/i, 'Thành phố $1');
			text = text.replace(/^(.*?)\s+Province$/i, 'Tỉnh $1');
			text = text.replace(/^(.*?)\s+District$/i, 'Huyện $1');
			text = text.replace(/^(.*?)\s+Ward$/i, 'Phường $1');
			text = text.replace(/^(.*?)\s+Commune$/i, 'Xã $1');
			text = text.replace(/^(.*?)\s+Town$/i, 'Thị trấn $1');
			text = text.replace(/^(.*?)\s+(Street|Road|Alley)$/i, 'Đường $1');

			text = text.replace(/^Huyện\s+Quận\s+/i, 'Quận ');
			text = text.replace(/^Huyện\s+(\d+.*)$/i, 'Quận $1');
			text = text.replace(/^Xã\s+Phường\s+/i, 'Phường ');

			// Tự động gắn thêm Tỉnh/Thành phố
			if (twCities.includes(text)) {
				text = "Thành phố " + text;
			} else if (provinces.includes(text)) {
				text = "Tỉnh " + text;
			}

			text = text.charAt(0).toUpperCase() + text.slice(1);
			if (text) resultParts.push(text);
		}

		return [...new Set(resultParts)].join(', ');
	};

	const parseAddressQuery = (query) => {
		const cleaned = query.replace(/\s+/g, ' ').trim();
		let streetNumber = '';
		let streetName = cleaned;

		const numberMatch = cleaned.match(/^([\d\/]+[A-Za-z]?)\s*[,.\-\s]+/);
		if (numberMatch) {
			streetNumber = numberMatch[1];
			streetName = cleaned.substring(numberMatch[0].length).trim();
		}
		return { streetNumber, streetName, full: cleaned };
	};

	const fetchAddresses = async (query) => {
		if (abortController) {
			abortController.abort();
		}
		abortController = new AbortController();
		const signal = abortController.signal;

		const parsed = parseAddressQuery(query);
		const results = [];
		const MAX_RESULTS = 8;

		const fetchNominatim = async (searchQuery) => {
			try {
				const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&countrycodes=vn&limit=${MAX_RESULTS}`;
				const res = await fetch(url, { signal });
				return await res.json();
			} catch (e) {
				return [];
			}
		};

		try {
			// TRƯỜNG HỢP 1: Tìm chính xác (Kèm Việt Nam)
			let data = await fetchNominatim(`${parsed.full}, Việt Nam`);
			if (data.length > 0) results.push(...data);

			// TRƯỜNG HỢP 2: Tìm chính xác (Bỏ Việt Nam)
			if (results.length === 0) {
				data = await fetchNominatim(`${parsed.full}`);
				if (data.length > 0) results.push(...data);
			}

			// TRƯỜNG HỢP 3: Chỉ tìm tên đường (Bỏ số nhà)
			if (results.length === 0 && parsed.streetName && parsed.streetName !== parsed.full) {
				data = await fetchNominatim(`${parsed.streetName}, Việt Nam`);
				if (data.length > 0) results.push(...data);
			}

			// TRƯỜNG HỢP 4: Bỏ các tiền tố đường phố chuẩn
			if (results.length === 0 && parsed.streetName) {
				const cleanPrefix = parsed.streetName.replace(/^(Đường|Phố|Ngõ|Hẻm|Kiệt|Đại lộ)\s+/i, '').trim();
				if (cleanPrefix !== parsed.streetName) {
					data = await fetchNominatim(`${cleanPrefix}, Việt Nam`);
					if (data.length > 0) results.push(...data);
				}
			}

			// TRƯỜNG HỢP 5: Nếu có dấu phẩy, tìm khu vực phía sau dấu phẩy (Quận/Huyện/Tỉnh)
			if (results.length === 0 && parsed.full.includes(',')) {
				const afterComma = parsed.full.substring(parsed.full.indexOf(',') + 1).trim();
				if (afterComma.length > 2) {
					data = await fetchNominatim(`${afterComma}, Việt Nam`);
					if (data.length > 0) results.push(...data);
				}
			}

			// TRƯỜNG HỢP 6: Dùng 2 từ đầu tiên của tên đường để quét rộng
			if (results.length === 0 && parsed.streetName.includes(' ')) {
				const broadSearch = parsed.streetName.split(' ').slice(0, 2).join(' ');
				if (broadSearch !== parsed.streetName) {
					data = await fetchNominatim(`${broadSearch}, Việt Nam`);
					if (data.length > 0) results.push(...data);
				}
			}

			const seen = new Set();
			const uniqueResults = results.filter(place => {
				const key = place.display_name;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});

			return uniqueResults.slice(0, MAX_RESULTS);
		} catch (error) {
			if (error.name === 'AbortError') return [];
			console.error("Lỗi khi tìm địa chỉ:", error);
			return [];
		}
	};

	const highlightMatch = (text, query) => {
		if (!query || query.length < 2) return text;
		try {
			const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const regex = new RegExp(`(${escapedQuery})`, 'gi');
			return text.replace(regex, '<mark style="background:#fef3c7;padding:0 2px;border-radius:2px;">$1</mark>');
		} catch (e) {
			return text;
		}
	};

	const renderSuggestions = (results, originalQuery) => {
		suggestionsBox.innerHTML = "";

		if (results.length === 0) {
			suggestionsBox.innerHTML = `
				<li style="text-align: center; color: #9ca3af; cursor: default; justify-content: center;">
					<i class='bx bx-info-circle'></i> Không tìm thấy địa chỉ phù hợp
				</li>`;
			suggestionsBox.classList.remove("is-hidden");
			return;
		}

		const fragment = document.createDocumentFragment();

		results.forEach(place => {
			const li = document.createElement("li");
			const displayName = place.display_name;

			const shortName = translateAddressToVietnamese(displayName);

			li.innerHTML = `
				<i class='bx bx-map-pin'></i> 
				<span>${highlightMatch(shortName, originalQuery)}</span>
			`;

			li.addEventListener("click", () => {
				const currentValue = addressInput.value.trim();
				const numberMatch = currentValue.match(/^(\d+\/?\d*[A-Za-z]?)\s*[,.\-\s]+/);
				const currentNumber = numberMatch ? numberMatch[1] : '';

				if (currentNumber && !shortName.startsWith(currentNumber)) {
					const cleanShortName = shortName.replace(/^,\s*/, '');
					addressInput.value = currentNumber + ', ' + cleanShortName;
				} else {
					addressInput.value = shortName.replace(/^,\s*/, '');
				}

				suggestionsBox.classList.add("is-hidden");
			});

			fragment.appendChild(li);
		});

		suggestionsBox.appendChild(fragment);
		suggestionsBox.classList.remove("is-hidden");
	};

	addressInput.addEventListener("input", (e) => {
		const query = e.target.value.trim();
		clearTimeout(debounceTimer);

		if (query.length < 2) {
			suggestionsBox.classList.add("is-hidden");
			return;
		}

		suggestionsBox.innerHTML = `
			<li style="color: #6b7280; justify-content: center;">
				<i class='bx bx-loader-alt bx-spin'></i> Đang tìm kiếm...
			</li>`;
		suggestionsBox.classList.remove("is-hidden");

		debounceTimer = setTimeout(async () => {
			const results = await fetchAddresses(query);
			if (addressInput.value.trim() === query) {
				renderSuggestions(results, query);
			}
		}, 400);
	});

	document.addEventListener("click", (e) => {
		if (!addressInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
			suggestionsBox.classList.add("is-hidden");
		}
	});

	addressInput.addEventListener("keydown", (e) => {
		if (!suggestionsBox.classList.contains("is-hidden")) {
			const items = suggestionsBox.querySelectorAll("li");
			const currentFocus = suggestionsBox.querySelector("li:focus");

			if (e.key === "ArrowDown") {
				e.preventDefault();
				if (!currentFocus || !currentFocus.nextElementSibling) {
					items[0]?.focus();
				} else {
					currentFocus.nextElementSibling.focus();
				}
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				if (!currentFocus || !currentFocus.previousElementSibling) {
					items[items.length - 1]?.focus();
				} else {
					currentFocus.previousElementSibling.focus();
				}
			} else if (e.key === "Enter" && currentFocus) {
				e.preventDefault();
				currentFocus.click();
			} else if (e.key === "Escape") {
				suggestionsBox.classList.add("is-hidden");
				addressInput.blur();
			}
		}
	});
};

const initCustomDropdowns = () => {
	const provinces34 = [
		"Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", "Cần Thơ", "Huế",
		"An Giang", "Bắc Ninh", "Cà Mau", "Cao Bằng", "Đắk Lắk",
		"Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Tĩnh",
		"Hưng Yên", "Khánh Hòa", "Lai Châu", "Lâm Đồng", "Lạng Sơn",
		"Lào Cai", "Nghệ An", "Ninh Bình", "Phú Thọ", "Quảng Ngãi",
		"Quảng Ninh", "Quảng Trị", "Sơn La", "Tây Ninh", "Thái Nguyên",
		"Thanh Hóa", "Tuyên Quang", "Vĩnh Long"
	].sort((a, b) => a.localeCompare(b, 'vi'));

	const visibilityOptions = [
		{ value: "PUBLIC", label: "Công khai", icon: "bx-globe" },
		{ value: "FRIENDS", label: "Bạn bè", icon: "bx-group" },
		{ value: "PRIVATE", label: "Chỉ mình tôi", icon: "bx-lock-alt" }
	];

	// 1. Chuyển đổi Dropdown Tỉnh/Thành
	const oldProvSelect = document.getElementById("create-post-province");
	const provLabel = oldProvSelect?.closest('.detail-chip');
	let hiddenProvInput = oldProvSelect;

	if (oldProvSelect && oldProvSelect.tagName === 'SELECT' && provLabel) {
		hiddenProvInput = document.createElement("input");
		hiddenProvInput.type = "hidden";
		hiddenProvInput.id = "create-post-province";
		oldProvSelect.replaceWith(hiddenProvInput);

		provLabel.classList.add("custom-select-active");
		provLabel.innerHTML = `
			<i class="bx bx-map"></i>
			<div class="custom-dropdown-trigger">
				<span class="selected-text" id="prov-selected-text">Chọn tỉnh</span>
				<i class="bx bx-chevron-down"></i>
			</div>
			<div class="custom-dropdown-menu is-hidden" id="prov-dropdown">
				<div class="custom-dropdown-search" onclick="event.stopPropagation()">
					<i class="bx bx-search"></i>
					<input type="text" id="prov-search-input" placeholder="Gõ tìm nhanh...">
				</div>
				<ul class="custom-dropdown-list" id="prov-list"></ul>
			</div>
		`;
		provLabel.appendChild(hiddenProvInput);

		const dropdown = document.getElementById("prov-dropdown");
		const searchInput = document.getElementById("prov-search-input");
		const list = document.getElementById("prov-list");
		const selectedText = document.getElementById("prov-selected-text");

		const renderProvList = (filter = "") => {
			list.innerHTML = "";
			const filtered = provinces34.filter(p => p.toLowerCase().includes(filter.toLowerCase()));

			if (filtered.length === 0) {
				list.innerHTML = `<li class="no-result">Không tìm thấy</li>`;
				return;
			}

			filtered.forEach(prov => {
				const li = document.createElement("li");
				li.textContent = prov;
				if (hiddenProvInput.value === prov) li.classList.add("selected");

				li.addEventListener("click", (e) => {
					e.stopPropagation();
					hiddenProvInput.value = prov;
					selectedText.textContent = prov;
					dropdown.classList.add("is-hidden");
				});
				list.appendChild(li);
			});
		};

		renderProvList();

		provLabel.addEventListener("click", (e) => {
			e.preventDefault();
			const isHidden = dropdown.classList.contains("is-hidden");
			document.querySelectorAll(".custom-dropdown-menu").forEach(el => el.classList.add("is-hidden"));

			if (isHidden) {
				dropdown.classList.remove("is-hidden");
				searchInput.value = "";
				renderProvList();
				setTimeout(() => searchInput.focus(), 50);
			}
		});

		searchInput.addEventListener("input", (e) => {
			renderProvList(e.target.value);
		});
	}

	// 2. Chuyển đổi Dropdown Quyền Riêng Tư
	const oldVisSelect = document.getElementById("create-post-visibility");
	const visLabel = oldVisSelect?.closest('.detail-chip');
	let hiddenVisInput = oldVisSelect;

	if (oldVisSelect && oldVisSelect.tagName === 'SELECT' && visLabel) {
		hiddenVisInput = document.createElement("input");
		hiddenVisInput.type = "hidden";
		hiddenVisInput.id = "create-post-visibility";
		hiddenVisInput.value = "PUBLIC";
		oldVisSelect.replaceWith(hiddenVisInput);

		visLabel.classList.add("custom-select-active");
		visLabel.innerHTML = `
			<i class="bx bx-globe" id="vis-icon"></i>
			<div class="custom-dropdown-trigger">
				<span class="selected-text" id="vis-selected-text">Công khai</span>
				<i class="bx bx-chevron-down"></i>
			</div>
			<div class="custom-dropdown-menu is-hidden" id="vis-dropdown">
				<ul class="custom-dropdown-list" id="vis-list"></ul>
			</div>
		`;
		visLabel.appendChild(hiddenVisInput);

		const dropdown = document.getElementById("vis-dropdown");
		const list = document.getElementById("vis-list");
		const selectedText = document.getElementById("vis-selected-text");
		const visIcon = document.getElementById("vis-icon");

		const renderVisList = () => {
			list.innerHTML = "";
			visibilityOptions.forEach(opt => {
				const li = document.createElement("li");
				li.innerHTML = `<i class='bx ${opt.icon}'></i> <span>${opt.label}</span>`;
				if (hiddenVisInput.value === opt.value) li.classList.add("selected");

				li.addEventListener("click", (e) => {
					e.stopPropagation();
					hiddenVisInput.value = opt.value;
					selectedText.textContent = opt.label;
					visIcon.className = `bx ${opt.icon}`;
					dropdown.classList.add("is-hidden");
				});
				list.appendChild(li);
			});
		};

		renderVisList();

		visLabel.addEventListener("click", (e) => {
			e.preventDefault();
			const isHidden = dropdown.classList.contains("is-hidden");
			document.querySelectorAll(".custom-dropdown-menu").forEach(el => el.classList.add("is-hidden"));

			if (isHidden) {
				dropdown.classList.remove("is-hidden");
				renderVisList();
			}
		});
	}

	document.addEventListener("click", (e) => {
		if (!e.target.closest(".custom-select-active")) {
			document.querySelectorAll(".custom-dropdown-menu").forEach(el => el.classList.add("is-hidden"));
		}
	});

	return {
		provinceInput: hiddenProvInput,
		visibilityInput: hiddenVisInput
	};
};

export const initCreatePostModal = (options = {}) => {
	const { closeOnPublish = true } = options;

	const createPostModal = document.getElementById("create-post-modal");
	if (!createPostModal) {
		return null;
	}

	let createPostProvinceInput = document.getElementById("create-post-province");
	let createPostVisibilityInput = document.getElementById("create-post-visibility");

	const customInputs = initCustomDropdowns();
	if (customInputs) {
		createPostProvinceInput = customInputs.provinceInput;
		createPostVisibilityInput = customInputs.visibilityInput;
	}

	const step1Upload = document.getElementById("step-1-upload");
	const step2Details = document.getElementById("step-2-details");
	const chooseFileBtn = document.getElementById("choose-file-btn");
	const postFileInput = document.getElementById("post-file-input");
	const closeCreateModalBtn = document.getElementById("close-create-modal");
	const publishPostBtn = document.getElementById("publish-post-btn");
	const postCaptionInput = document.getElementById("post-caption-input");
	const postDraftPreview = document.getElementById("post-draft-preview");
	const createPostAddressInput = document.getElementById("create-post-address");
	const createPostFeedbackElement = document.getElementById("create-post-feedback");
	const createPostLinks = toArray(document.querySelectorAll(".create-post-link"));

	const resetCreateModalState = () => {
		if (postFileInput) postFileInput.value = "";
		if (postCaptionInput) postCaptionInput.value = "";
		if (createPostAddressInput) createPostAddressInput.value = "";

		if (createPostProvinceInput) {
			createPostProvinceInput.value = "";
			const provText = document.getElementById("prov-selected-text");
			if (provText) provText.textContent = "Chọn tỉnh";
		}

		if (createPostVisibilityInput) {
			createPostVisibilityInput.value = "PUBLIC";
			const visText = document.getElementById("vis-selected-text");
			const visIcon = document.getElementById("vis-icon");
			if (visText) visText.textContent = "Công khai";
			if (visIcon) visIcon.className = "bx bx-globe";
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
		const suggestionsBox = document.getElementById("address-suggestions");
		if (suggestionsBox) {
			suggestionsBox.classList.add("is-hidden");
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
		if (!selectedFile) return;

		const reader = new FileReader();
		reader.onload = (loadEvent) => {
			const dataUrl = loadEvent.target?.result;
			if (typeof dataUrl !== "string" || !postDraftPreview) return;

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

	createPostModal.addEventListener("dblclick", (event) => {
		if (event.target === createPostModal) {
			closeCreateModal();
		}
	});

	initAddressAutocomplete();

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