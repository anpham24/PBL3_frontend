"use strict";

import { feedApi } from "../api/feed-api.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const searchState = {
	activeTab: "users", // "users" | "posts"
	query: "",
	provinceCode: "ALL",
	topicCode: "ALL",
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const DEFAULT_AVATAR_URL =
	"https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=520&q=70";

const getEl = (id) => document.getElementById(id);

const showEl = (el) => el?.classList.remove("is-hidden");
const hideEl = (el) => el?.classList.add("is-hidden");

// ---------------------------------------------------------------------------
// Hero search bar logic
// ---------------------------------------------------------------------------

const initSearchBar = () => {
	const mainInput = getEl("search-main-input");
	const clearBtn = getEl("search-clear-btn");

	if (!mainInput) return;

	// Sync clear-button visibility
	const syncClearBtn = () => {
		if (mainInput.value.trim().length > 0) {
			showEl(clearBtn);
		} else {
			hideEl(clearBtn);
		}
	};

	mainInput.addEventListener("input", syncClearBtn);

	clearBtn?.addEventListener("click", () => {
		mainInput.value = "";
		syncClearBtn();
		mainInput.focus();
		clearResults();
	});

	// Trigger search on Enter key only
	mainInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			runSearch();
		}
	});
};

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------

const initTabs = () => {
	const tabs = document.querySelectorAll(".search-tab");

	tabs.forEach((tab) => {
		tab.addEventListener("click", () => {
			const targetTab = tab.dataset.tab;
			if (targetTab === searchState.activeTab) return;

			// Deactivate all tabs
			tabs.forEach((t) => {
				t.classList.remove("is-active");
				t.setAttribute("aria-selected", "false");
			});

			// Activate clicked tab
			tab.classList.add("is-active");
			tab.setAttribute("aria-selected", "true");

			// Toggle panels
			const usersPanel = getEl("search-panel-users");
			const postsPanel = getEl("search-panel-posts");

			if (targetTab === "users") {
				showEl(usersPanel);
				hideEl(postsPanel);
			} else {
				hideEl(usersPanel);
				showEl(postsPanel);
			}

			searchState.activeTab = targetTab;

			// Re-run search in the new tab context if there's a query
			if (searchState.query.length > 0) {
				runSearch();
			}
		});
	});
};

// ---------------------------------------------------------------------------
// Dropdown filters (province & topic)
// ---------------------------------------------------------------------------

const populateSelect = (selectEl, items, labelKey, valueKey, defaultLabel) => {
	if (!selectEl) return;

	// Keep the default "All" option
	selectEl.innerHTML = `<option value="ALL">${defaultLabel}</option>`;

	if (!Array.isArray(items)) return;

	items.forEach((item) => {
		const opt = document.createElement("option");
		opt.value = item[valueKey] ?? "";
		opt.textContent = item[labelKey] ?? "";
		selectEl.appendChild(opt);
	});
};

const initDropdownFilters = async () => {
	const provinceSelect = getEl("search-province-filter");
	const topicSelect = getEl("search-topic-filter");

	try {
		const response = await feedApi.getDropdownData();
		const data = response?.data ?? {};

		const provinces = Array.isArray(data.provinces) ? data.provinces : [];
		const topics = Array.isArray(data.topics) ? data.topics : [];

		populateSelect(provinceSelect, provinces, "provinceName", "provinceCode", "Tất cả tỉnh");
		populateSelect(topicSelect, topics, "topicName", "topicCode", "Tất cả chủ đề");
	} catch (err) {
		// Filters are non-critical — silently fail and keep defaults
		console.warn("[search] Không thể tải danh sách tỉnh/chủ đề:", err);
	}

	provinceSelect?.addEventListener("change", () => {
		searchState.provinceCode = provinceSelect.value;
		if (searchState.query.length > 0) {
			runSearch();
		}
	});

	topicSelect?.addEventListener("change", () => {
		searchState.topicCode = topicSelect.value;
		if (searchState.query.length > 0) {
			runSearch();
		}
	});
};

// ---------------------------------------------------------------------------
// Result rendering helpers
// ---------------------------------------------------------------------------

/**
 * Render trạng thái loading vào container chỉ định.
 * @param {HTMLElement} container
 */
const renderLoading = (container) => {
	if (!container) return;
	container.innerHTML = `
		<div class="search-loading">
			<span class="search-spinner" aria-label="Đang tải..."></span>
			<span>Đang tìm kiếm...</span>
		</div>
	`;
};

/**
 * Render thông báo trạng thái / lỗi vào container chỉ định.
 * @param {HTMLElement} container
 * @param {string} message
 * @param {boolean} isError
 */
const renderStatus = (container, message, isError = false) => {
	if (!container) return;
	const cls = isError ? "search-status is-error" : "search-status";
	container.innerHTML = `<p class="${cls}">${message}</p>`;
};

/**
 * Render trạng thái rỗng khi chưa có query.
 * @param {HTMLElement} container
 * @param {string} icon - Boxicons class (vd: "bx-group")
 * @param {string} message
 */
const renderEmpty = (container, icon, message) => {
	if (!container) return;
	container.innerHTML = `
		<div class="search-empty-state">
			<i class="bx ${icon}"></i>
			<p>${message}</p>
		</div>
	`;
};

/**
 * Tạo card người dùng từ dữ liệu.
 * @param {object} user
 * @returns {HTMLElement}
 */
const createUserCard = (user) => {
	const card = document.createElement("div");
	card.className = "search-user-card";
	card.setAttribute("role", "article");

	const avatar = user.avtUrl || DEFAULT_AVATAR_URL;
	const nickname = user.nickname || "Người dùng";
	const bio = user.bio || "";
	const userId = user.id || user.userId || "";

	card.innerHTML = `
		<img class="search-user-avatar" src="${avatar}" alt="Avatar ${nickname}" loading="lazy">
		<div class="search-user-info">
			<p class="search-user-name">${nickname}</p>
			${bio.length > 0 ? `<p class="search-user-bio">${bio}</p>` : ""}
		</div>
		<div class="search-user-action">
			<button
				class="search-view-profile-btn open-profile-link"
				type="button"
				data-user-id="${userId}"
				aria-label="Xem hồ sơ ${nickname}"
			>
				Xem hồ sơ
			</button>
		</div>
	`;

	// Navigate to profile when clicking anywhere on the card (except the button itself)
	card.addEventListener("click", (e) => {
		if (e.target.closest(".search-view-profile-btn")) return;
		if (userId.length > 0) {
			window.location.href = `profile.html?id=${encodeURIComponent(userId)}`;
		}
	});

	return card;
};

// ---------------------------------------------------------------------------
// Search runners (hooked to API when endpoints are available)
// ---------------------------------------------------------------------------

/**
 * Tìm kiếm người dùng theo keyword.
 * Phần này dành sẵn để tích hợp API thực khi backend sẵn sàng.
 * @param {string} keyword
 */
const searchUsers = async (keyword) => {
	const container = getEl("search-results-container");
	renderLoading(container);

	try {
		// TODO: thay thế bằng userApi.searchUsers(keyword) khi API sẵn sàng
		// const response = await userApi.searchUsers(keyword);
		// const users = response?.data?.users ?? [];

		// ── Placeholder: hiển thị trạng thái chờ tích hợp API ─────────────
		renderStatus(
			container,
			`Kết quả tìm kiếm người dùng cho "<strong>${keyword}</strong>" sẽ hiển thị tại đây sau khi API được tích hợp.`
		);
	} catch (err) {
		console.error("[search] Lỗi tìm kiếm người dùng:", err);
		renderStatus(container, "Không thể tìm kiếm. Vui lòng thử lại.", true);
	}
};

/**
 * Tìm kiếm bài viết theo keyword, tỉnh và chủ đề.
 * Phần này dành sẵn để tích hợp API thực khi backend sẵn sàng.
 * @param {string} keyword
 * @param {string} provinceCode
 * @param {string} topicCode
 */
const searchPosts = async (keyword, provinceCode, topicCode) => {
	const container = getEl("search-posts-container");
	renderLoading(container);

	try {
		// TODO: thay thế bằng postApi.searchPosts(keyword, provinceCode, topicCode) khi API sẵn sàng
		// const safeProvince = provinceCode === "ALL" ? "" : provinceCode;
		// const safeTopic    = topicCode === "ALL"    ? "" : topicCode;
		// const response = await postApi.searchPosts(keyword, safeProvince, safeTopic);
		// const posts = response?.data?.postList ?? [];

		// ── Placeholder: hiển thị trạng thái chờ tích hợp API ─────────────
		renderStatus(
			container,
			`Kết quả tìm kiếm bài viết cho "<strong>${keyword}</strong>" sẽ hiển thị tại đây sau khi API được tích hợp.`
		);
	} catch (err) {
		console.error("[search] Lỗi tìm kiếm bài viết:", err);
		renderStatus(container, "Không thể tìm kiếm. Vui lòng thử lại.", true);
	}
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Đọc query từ input, cập nhật state, dispatch sang đúng tab.
 */
const runSearch = () => {
	const mainInput = getEl("search-main-input");
	const query = mainInput?.value.trim() ?? "";

	searchState.query = query;

	if (query.length === 0) {
		clearResults();
		return;
	}

	if (searchState.activeTab === "users") {
		searchUsers(query);
	} else {
		searchPosts(query, searchState.provinceCode, searchState.topicCode);
	}
};

/**
 * Đặt lại kết quả về trạng thái mặc định (empty state).
 */
const clearResults = () => {
	renderEmpty(
		getEl("search-results-container"),
		"bx-search-alt",
		"Nhập từ khóa để tìm kiếm người dùng"
	);
	renderEmpty(
		getEl("search-posts-container"),
		"bx-news",
		"Nhập từ khóa để tìm kiếm bài viết"
	);
};

// ---------------------------------------------------------------------------
// URL query pre-fill (optional: open search page with ?q=...)
// ---------------------------------------------------------------------------

const prefillFromQuery = () => {
	const params = new URLSearchParams(window.location.search);
	const q = params.get("q");
	if (typeof q === "string" && q.trim().length > 0) {
		const mainInput = getEl("search-main-input");
		if (mainInput) {
			mainInput.value = q.trim();
			const clearBtn = getEl("search-clear-btn");
			showEl(clearBtn);
		}
		// Trigger search immediately
		runSearch();
	}
};

// ---------------------------------------------------------------------------
// Page initializer
// ---------------------------------------------------------------------------

const initSearchPage = () => {
	initSearchBar();
	initTabs();
	initDropdownFilters();
	prefillFromQuery();
};

document.addEventListener("DOMContentLoaded", initSearchPage);
