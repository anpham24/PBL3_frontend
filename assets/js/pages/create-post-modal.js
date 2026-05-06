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

		// 1. Tách địa chỉ thành từng phần nhỏ qua dấu phẩy
		let parts = displayName.split(',').map(p => p.trim());
		let resultParts = [];

		// 2. Danh sách 63 tỉnh/thành phố chuẩn để tự động nhận dạng
		const twCities = ["Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", "Cần Thơ"];
		const provinces = [
			"An Giang", "Bà Rịa - Vũng Tàu", "Bắc Giang", "Bắc Kạn", "Bạc Liêu", "Bắc Ninh", "Bến Tre", "Bình Định", "Bình Dương", "Bình Phước", "Bình Thuận", "Cà Mau", "Cao Bằng", "Đắk Lắk", "Đắk Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Giang", "Hà Nam", "Hà Tĩnh", "Hải Dương", "Hậu Giang", "Hòa Bình", "Hưng Yên", "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lâm Đồng", "Lạng Sơn", "Lào Cai", "Long An", "Nam Định", "Nghệ An", "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình", "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sóc Trăng", "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa", "Thừa Thiên Huế", "Tiền Giang", "Trà Vinh", "Tuyên Quang", "Vĩnh Long", "Vĩnh Phúc", "Yên Bái"
		];

		for (let part of parts) {
			// Loại bỏ mã bưu điện (chỉ chứa số, 4-6 ký tự)
			if (/^\d{4,6}$/.test(part)) continue;

			// Loại bỏ chữ Vietnam/Việt Nam để tránh lặp
			if (/vi[êe]t\s*nam/i.test(part)) continue;

			let text = part;

			// 3. Sửa các lỗi dịch bậy cố hữu của bản đồ
			text = text.replace(/Hồ Chí Thành phố Minh/i, 'Hồ Chí Minh');
			text = text.replace(/Ho Chi Minh/i, 'Hồ Chí Minh');
			text = text.replace(/Ha Noi/i, 'Hà Nội');
			text = text.replace(/Hai Phong/i, 'Hải Phòng');
			text = text.replace(/Da Nang/i, 'Đà Nẵng');
			text = text.replace(/Can Tho/i, 'Cần Thơ');

			// 4. Dịch các hậu tố tiếng Anh (Đưa Unit lên trước Name)
			text = text.replace(/^(.*?)\s+City$/i, 'Thành phố $1');
			text = text.replace(/^(.*?)\s+Province$/i, 'Tỉnh $1');
			text = text.replace(/^(.*?)\s+District$/i, 'Huyện $1');
			text = text.replace(/^(.*?)\s+Ward$/i, 'Phường $1');
			text = text.replace(/^(.*?)\s+Commune$/i, 'Xã $1');
			text = text.replace(/^(.*?)\s+Town$/i, 'Thị trấn $1');
			text = text.replace(/^(.*?)\s+(Street|Road|Alley)$/i, 'Đường $1');

			// 5. Cải thiện logic tiếng Việt (vd: Huyện Quận -> Quận, Huyện 1 -> Quận 1)
			text = text.replace(/^Huyện\s+Quận\s+/i, 'Quận ');
			text = text.replace(/^Huyện\s+(\d+.*)$/i, 'Quận $1');
			text = text.replace(/^Xã\s+Phường\s+/i, 'Phường ');

			// 6. Tự động gắn thêm Tỉnh/Thành phố nếu API chỉ nhả về tên trần
			if (twCities.includes(text)) {
				text = "Thành phố " + text;
			} else if (provinces.includes(text)) {
				text = "Tỉnh " + text;
			}

			// Viết hoa chữ cái đầu tiên cho đẹp
			text = text.charAt(0).toUpperCase() + text.slice(1);

			if (text) resultParts.push(text);
		}

		// Gộp các phần lại và lọc bỏ những thành phần trùng lặp
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

		try {
			const url1 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parsed.full)},+Việt+Nam&format=json&addressdetails=1&countrycodes=vn&limit=5`;
			const res1 = await fetch(url1, { signal });
			const data1 = await res1.json();
			if (data1.length > 0) results.push(...data1);

			if (results.length === 0 && parsed.streetName && parsed.streetName !== parsed.full) {
				const url2 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parsed.streetName)},+Việt+Nam&format=json&addressdetails=1&countrycodes=vn&limit=5`;
				const res2 = await fetch(url2, { signal });
				const data2 = await res2.json();
				if (data2.length > 0) results.push(...data2);
			}

			if (results.length === 0 && parsed.streetName.includes(' ')) {
				const broadSearch = parsed.streetName.split(' ').slice(0, 2).join(' ');
				if (broadSearch !== parsed.streetName) {
					const url3 = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(broadSearch)},+Việt+Nam&format=json&addressdetails=1&countrycodes=vn&limit=5`;
					try {
						const res3 = await fetch(url3, { signal });
						const data3 = await res3.json();
						if (data3.length > 0) results.push(...data3);
					} catch (e) {
					}
				}
			}

			const seen = new Set();
			const uniqueResults = results.filter(place => {
				const key = place.display_name;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});

			return uniqueResults.slice(0, 5);
		} catch (error) {
			if (error.name === 'AbortError') {
				return [];
			}
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