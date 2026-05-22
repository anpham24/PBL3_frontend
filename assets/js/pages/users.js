/**
 * @file users.js
 * @module pages/users
 *
 * Logic trang Quản lý người dùng (Admin).
 *
 * ── Luồng khởi tạo ────────────────────────────────────────────────────────
 *  1. Kiểm tra quyền — chỉ cho ADMIN vào, còn lại redirect feed.html.
 *  2. Gọi GET /api/admin/users → render bảng người dùng.
 *  3. Hỗ trợ tìm kiếm (debounce) + load more (cursor-based).
 *
 * ── Sự kiện chính ─────────────────────────────────────────────────────────
 *  - Dropdown Vai trò thay đổi  → ConfirmModal → PATCH /api/admin/users/{id}/role
 *  - Dropdown Trạng thái → LOCKED / BANNED → UserStatusModal
 *  - Nút "Xem lịch sử vi phạm" → ViolationModal
 */

"use strict";

import { userApi }           from "../api/user-api.js";
import { getCurrentUser }    from "../utils/auth.js";
import { ConfirmModal }      from "../components/confirm-modal.js";
import { UserStatusModal }   from "../components/user-status-modal.js";
import { ViolationModal }    from "../components/violation-modal.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ADMIN_ROLE        = "ADMIN";
const SEARCH_DEBOUNCE   = 350;
const DEFAULT_AVATAR    = "../assets/images/default-avatar.png";
const SCROLL_BOTTOM_THRESHOLD = 300;

const ROLE_OPTIONS    = ["MEMBER", "MODERATOR"];
const STATUS_OPTIONS  = ["ACTIVE", "LOCKED", "BANNED"];

const ROLE_LABELS = {
	MEMBER:    "MEMBER",
	MODERATOR: "MODERATOR",
};

const STATUS_LABELS = {
	ACTIVE: "ACTIVE",
	LOCKED: "LOCKED",
	BANNED: "BANNED",
};

// ─── State ────────────────────────────────────────────────────────────────────

const _state = {
	/** @type {Array<object>} */
	users:        [],
	keyword:      "",
	lastUserId:   "",
	hasMore:      true,
	isLoading:    false,
	totalCount:   0,
	requestSeq:   0,
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

let _tbodyEl;
let _countBadgeEl;
let _emptyStateEl;
let _searchInputEl;
let _statusEl;
// _sentinelEl / _loadingIndicatorEl: không cần — dùng window scroll

let _searchDebounceTimer = 0;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const _esc = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const _str = (value) => {
	if (typeof value !== "string") return "";
	const t = value.trim();
	return t.length > 0 ? t : "";
};

const _toErrorMsg = (error, fallback) => {
	if (_str(error?.data?.message).length > 0) return error.data.message.trim();
	if (_str(error?.message).length > 0)       return error.message.trim();
	return fallback;
};

const _getUserRole = () => {
	const u = getCurrentUser();
	return _str(u?.userRole).toUpperCase();
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const _setStatus = (msg, variant = "info") => {
	if (!_statusEl) return;
	_statusEl.textContent = msg;
	_statusEl.classList.toggle("is-hidden", _str(msg).length === 0);
	const colorMap = { error: "#b91c1c", success: "#15803d", info: "#4b5563" };
	_statusEl.style.color = colorMap[variant] ?? "#4b5563";
};

const _clearStatus = () => {
	_setStatus("");
	if (_statusEl) _statusEl.style.color = "";
};

// ─── Normalize user from API response ─────────────────────────────────────────

const _normalizeUser = (raw) => ({
	id:       _str(raw?.id ? String(raw.id) : ""),
	avtUrl:   _str(raw?.avtUrl || raw?.avatar || raw?.avatar_url) || DEFAULT_AVATAR,
	username: _str(raw?.username) || "user",
	nickname: _str(raw?.nickname) || _str(raw?.username) || "Người dùng",
	role:     _str(raw?.role).toUpperCase() || "MEMBER",
	status:   _str(raw?.status).toUpperCase() || "ACTIVE",
});

// ─── CSS class helpers ────────────────────────────────────────────────────────

const _roleClass = (role) => {
	if (role === "ADMIN")     return "role-admin";
	if (role === "MODERATOR") return "role-moderator";
	return "role-member";
};

const _statusClass = (status) => {
	if (status === "LOCKED") return "status-locked";
	if (status === "BANNED") return "status-banned";
	return "status-active";
};

// ─── Row HTML builder ─────────────────────────────────────────────────────────

/**
 * Sinh HTML cho một hàng <tr> của bảng người dùng.
 * @param {object} user - Đã normalize.
 * @param {number} stt  - Số thứ tự (1-based, cộng dồn qua các page).
 */
const _buildRowHtml = (user, stt) => {
	const uid = _esc(user.id);

	// Role select — Admin không thể tự thay đổi role của chính mình
	const roleOptions = ROLE_OPTIONS.map((r) =>
		`<option value="${r}" ${user.role === r ? "selected" : ""}>${ROLE_LABELS[r] ?? r}</option>`
	).join("");

	// Status select — chỉ cho chọn ACTIVE nếu đang bị lock/ban để "mở khóa" (ngoài scope),
	// nhưng theo đề bài chỉ đổi sang LOCKED hoặc BANNED, ta render đủ 3 option.
	const statusOptions = STATUS_OPTIONS.map((s) =>
		`<option value="${s}" ${user.status === s ? "selected" : ""}>${STATUS_LABELS[s] ?? s}</option>`
	).join("");

	return `
	<tr data-user-id="${uid}" data-role="${_esc(user.role)}" data-status="${_esc(user.status)}">
		<td class="number-cell">${stt}</td>
		<td class="account-cell">
			<a class="user-account-link" href="profile.html?id=${uid}" title="Xem trang cá nhân ${_esc(user.nickname)}">
				<img
					class="user-avatar-thumb"
					src="${_esc(user.avtUrl)}"
					alt="Avatar ${_esc(user.username)}"
					onerror="this.src='${DEFAULT_AVATAR}'"
					loading="lazy"
				>
				<span class="user-nickname">${_esc(user.nickname)}</span>
			</a>
		</td>
		<td class="username-cell">${_esc(user.username)}</td>
		<td class="role-cell">
			<div class="user-select-wrap ${_roleClass(user.role)}">
				<select
					class="user-role-select"
					id="role-select-${uid}"
					data-action="change-role"
					data-user-id="${uid}"
					data-original-value="${_esc(user.role)}"
					aria-label="Vai trò của ${_esc(user.username)}"
				>
					${roleOptions}
				</select>
			</div>
		</td>
		<td class="status-cell">
			<div class="user-select-wrap ${_statusClass(user.status)}">
				<select
					class="user-status-select"
					id="status-select-${uid}"
					data-action="change-status"
					data-user-id="${uid}"
					data-original-value="${_esc(user.status)}"
					aria-label="Trạng thái của ${_esc(user.username)}"
				>
					${statusOptions}
				</select>
			</div>
		</td>
		<td class="violation-cell">
			<button
				class="user-action-btn violation-btn"
				type="button"
				data-action="view-violations"
				data-user-id="${uid}"
				aria-label="Xem lịch sử vi phạm của ${_esc(user.username)}"
			>
				<i class="bx bx-history" aria-hidden="true"></i>
				<span>Vi phạm</span>
			</button>
		</td>
	</tr>`;
};

// ─── Render ───────────────────────────────────────────────────────────────────

const _renderRows = (users, startStt) => {
	if (!_tbodyEl) return;
	const html = users.map((u, i) => _buildRowHtml(u, startStt + i)).join("");
	_tbodyEl.insertAdjacentHTML("beforeend", html);
};

const _clearTable = () => {
	if (_tbodyEl) _tbodyEl.innerHTML = "";
};

const _updateCountBadge = () => {
	if (!_countBadgeEl) return;
	const total = _state.totalCount;
	_countBadgeEl.textContent = total > 0 ? `${total} người dùng` : `${_state.users.length} người dùng`;
};

const _syncEmptyState = () => {
	if (!_emptyStateEl) return;
	_emptyStateEl.classList.toggle("is-hidden", _state.users.length > 0 || _state.isLoading);
};

const _syncLoadMore = () => {
	// Sentinel-based infinite scroll: no button to show/hide.
	// The IntersectionObserver handles triggering automatically.
};

// ─── Update a single row in the table ────────────────────────────────────────

/**
 * Cập nhật lại một hàng trong bảng sau khi thay đổi role/status.
 * @param {string} userId
 * @param {Partial<{role: string, status: string}>} patch
 */
const _updateUserRow = (userId, patch) => {
	// Cập nhật state
	const userIndex = _state.users.findIndex((u) => u.id === userId);
	if (userIndex !== -1) {
		_state.users[userIndex] = { ..._state.users[userIndex], ...patch };
	}

	// Cập nhật DOM của row
	const row = _tbodyEl?.querySelector(`[data-user-id="${CSS.escape(userId)}"]`);
	if (!row) return;

	if (patch.role) {
		row.dataset.role = patch.role;
		const sel = row.querySelector(`[data-action="change-role"]`);
		if (sel) {
			sel.value = patch.role;
			sel.dataset.originalValue = patch.role;
		}
		const wrap = row.querySelector(".role-cell .user-select-wrap");
		if (wrap) {
			wrap.className = `user-select-wrap ${_roleClass(patch.role)}`;
		}
	}

	if (patch.status) {
		row.dataset.status = patch.status;
		const sel = row.querySelector(`[data-action="change-status"]`);
		if (sel) {
			sel.value = patch.status;
			sel.dataset.originalValue = patch.status;
		}
		const wrap = row.querySelector(".status-cell .user-select-wrap");
		if (wrap) {
			wrap.className = `user-select-wrap ${_statusClass(patch.status)}`;
		}
	}
};

// ─── API calls ────────────────────────────────────────────────────────────────

const _loadNextPage = async () => {
	if (_state.isLoading || !_state.hasMore) return;
	_state.isLoading = true;

	if (_state.users.length === 0) {
		_setStatus("Đang tải danh sách người dùng...");
	}

	try {
		const response = await userApi.getAdminUsers({
			lastUserId: _state.lastUserId,
			keyword:    _state.keyword,
		});

		const data     = response?.data ?? {};
		const list     = Array.isArray(data.userList) ? data.userList : [];
		const hasMore  = Boolean(data.hasMore);
		const lastId   = _str(data.respLastUserId);
		const total    = Number(data.total ?? 0);

		const startStt = _state.users.length + 1;
		const normalized = list.map(_normalizeUser);

		_state.users     = [..._state.users, ...normalized];
		_state.hasMore   = hasMore;
		_state.lastUserId = lastId.length > 0 ? lastId : _state.lastUserId;
		if (total > 0) _state.totalCount = total;

		_renderRows(normalized, startStt);
		_updateCountBadge();
		_syncEmptyState();

		if (_state.users.length === 0 && !hasMore) {
			_setStatus(
				_state.keyword.length > 0
					? "Không tìm thấy người dùng phù hợp."
					: "Không có người dùng nào để hiển thị."
			);
		} else {
			_clearStatus();
		}
	} catch (error) {
		_setStatus(_toErrorMsg(error, "Không thể tải danh sách người dùng."), "error");
	} finally {
		_state.isLoading = false;
	}
};

const _resetAndLoad = async (keyword = "") => {
	_state.keyword    = keyword;
	_state.lastUserId = "";
	_state.hasMore    = true;
	_state.isLoading  = false;
	_state.users      = [];
	_state.totalCount = 0;

	_clearTable();
	_clearStatus();
	_syncEmptyState();
	_syncLoadMore();
	_updateCountBadge();

	await _loadNextPage();
};

// ─── Action handlers ──────────────────────────────────────────────────────────

/**
 * Xử lý thay đổi vai trò: mở ConfirmModal → gọi API nếu đồng ý, revert nếu hủy.
 * @param {HTMLSelectElement} selectEl
 */
const _handleRoleChange = async (selectEl) => {
	const userId      = _str(selectEl.dataset.userId);
	const newRole     = _str(selectEl.value).toUpperCase();
	const oldRole     = _str(selectEl.dataset.originalValue).toUpperCase();

	if (!userId || newRole === oldRole) return;

	const user = _state.users.find((u) => u.id === userId);
	const name = user ? _str(user.username) || userId : userId;

	const confirmed = await ConfirmModal.show(
		"Xác nhận đổi vai trò",
		`Đổi vai trò của "${name}" từ ${oldRole} sang ${newRole}?`,
		{ confirmLabel: "Đổi vai trò", danger: false, icon: "bx-user-check" }
	);

	if (!confirmed) {
		// Revert về giá trị cũ
		selectEl.value = oldRole;
		return;
	}

	// Disable trong lúc gọi API
	selectEl.disabled = true;

	try {
		await userApi.updateUserRole(userId, newRole);
		_updateUserRow(userId, { role: newRole });
		_setStatus(`Đã đổi vai trò "${name}" sang ${newRole}.`, "success");
		window.setTimeout(_clearStatus, 3500);
	} catch (error) {
		selectEl.value = oldRole; // Revert on error
		_setStatus(_toErrorMsg(error, "Không thể đổi vai trò. Vui lòng thử lại."), "error");
		window.setTimeout(_clearStatus, 4000);
	} finally {
		selectEl.disabled = false;
	}
};

/**
 * Xử lý thay đổi trạng thái:
 * - Nếu đổi sang LOCKED / BANNED → mở UserStatusModal.
 * - Nếu đổi sang ACTIVE → ConfirmModal đơn giản (mở khóa).
 * @param {HTMLSelectElement} selectEl
 */
const _handleStatusChange = async (selectEl) => {
	const userId    = _str(selectEl.dataset.userId);
	const newStatus = _str(selectEl.value).toUpperCase();
	const oldStatus = _str(selectEl.dataset.originalValue).toUpperCase();

	if (!userId || newStatus === oldStatus) return;

	const user = _state.users.find((u) => u.id === userId);
	const name = user ? _str(user.username) || userId : userId;

	if (newStatus === "ACTIVE") {
		// Mở khóa: ConfirmModal đơn giản
		const confirmed = await ConfirmModal.show(
			"Xác nhận mở khóa",
			`Mở khóa tài khoản "${name}"? Trạng thái sẽ trở về ACTIVE.`,
			{ confirmLabel: "Mở khóa", danger: false, icon: "bx-lock-open" }
		);
		if (!confirmed) {
			selectEl.value = oldStatus;
			return;
		}
		// Gọi PATCH với status ACTIVE (nếu API hỗ trợ)
		selectEl.disabled = true;
		try {
			await userApi.updateUserStatus(userId, { status: "ACTIVE" });
			_updateUserRow(userId, { status: "ACTIVE" });
			_setStatus(`Đã mở khóa tài khoản "${name}".`, "success");
			window.setTimeout(_clearStatus, 3500);
		} catch (error) {
			selectEl.value = oldStatus;
			_setStatus(_toErrorMsg(error, "Không thể mở khóa tài khoản."), "error");
			window.setTimeout(_clearStatus, 4000);
		} finally {
			selectEl.disabled = false;
		}
		return;
	}

	// LOCKED hoặc BANNED → mở UserStatusModal
	// Revert ngay để modal tự cập nhật sau khi thành công
	selectEl.value = oldStatus;

	UserStatusModal.open({
		userId,
		username: name,
		targetStatus: newStatus,
		onSuccess: (uid, status) => {
			_updateUserRow(uid, { status });
			_setStatus(
				status === "BANNED"
					? `Đã ban vĩnh viễn tài khoản "${name}".`
					: `Đã khóa tài khoản "${name}".`,
				"success"
			);
			window.setTimeout(_clearStatus, 3500);
		},
	});
};

/**
 * Xử lý nút "Xem lịch sử vi phạm".
 * @param {HTMLButtonElement} btn
 */
const _handleViewViolations = (btn) => {
	const userId = _str(btn.dataset.userId);
	if (!userId) return;

	const user = _state.users.find((u) => u.id === userId);
	ViolationModal.open({
		userId,
		username: user ? (_str(user.username) || userId) : userId,
	});
};

// ─── Event delegation ──────────────────────────────────────────────────────────

/**
 * Delegation trên <tbody> — bắt sự kiện change và click.
 */
const _handleTableChange = (event) => {
	const target = event.target;

	if (target.matches("[data-action='change-role']")) {
		void _handleRoleChange(target);
		return;
	}

	if (target.matches("[data-action='change-status']")) {
		void _handleStatusChange(target);
		return;
	}
};

const _handleTableClick = (event) => {
	const btn = event.target.closest("[data-action='view-violations']");
	if (!btn || !_tbodyEl?.contains(btn)) return;
	_handleViewViolations(btn);
};

// ─── Search ───────────────────────────────────────────────────────────────────

const _handleSearchInput = () => {
	window.clearTimeout(_searchDebounceTimer);
	_searchDebounceTimer = window.setTimeout(() => {
		const keyword = _str(_searchInputEl?.value);
		void _resetAndLoad(keyword);
	}, SEARCH_DEBOUNCE);
};

const _handleSearchEnter = (event) => {
	if (event.key !== "Enter") return;
	event.preventDefault();
	window.clearTimeout(_searchDebounceTimer);
	void _resetAndLoad(_str(_searchInputEl?.value));
};

// ─── Infinite Scroll — window scroll (giống feed.js / reports.js) ────────────────

/**
 * Kiểm tra nếu đã cuộn gần đáy trang thì tải thêm.
 * Pattern đồng bộ với feed.js / reports.js / search.js.
 */
const _handleScrollToBottom = () => {
	if (_state.isLoading || !_state.hasMore) return;
	const currentScroll = window.innerHeight + window.scrollY;
	const scrollBottom  = document.body.offsetHeight - SCROLL_BOTTOM_THRESHOLD;
	if (currentScroll >= scrollBottom) {
		void _loadNextPage();
	}
};

// ─── Init ─────────────────────────────────────────────────────────────────────

const _initUsersPage = async () => {
	// Chỉ Admin mới được vào
	if (_getUserRole() !== ADMIN_ROLE) {
		window.location.href = "feed.html";
		return;
	}

	// Cache DOM refs
	_tbodyEl       = document.getElementById("users-tbody");
	_countBadgeEl  = document.getElementById("users-count-badge");
	_emptyStateEl  = document.getElementById("users-empty-state");
	_searchInputEl = document.getElementById("users-search-input");
	_statusEl      = document.getElementById("users-status");

	if (!_tbodyEl) return;

	// Gắn event listeners
	_tbodyEl.addEventListener("change", _handleTableChange);
	_tbodyEl.addEventListener("click",  _handleTableClick);
	_searchInputEl?.addEventListener("input",   _handleSearchInput);
	_searchInputEl?.addEventListener("keydown", _handleSearchEnter);

	// Infinite scroll — giống feed.js / reports.js
	window.addEventListener("scroll", _handleScrollToBottom, { passive: true });

	// Tải trang đầu tiên
	await _resetAndLoad("");
};

document.addEventListener("DOMContentLoaded", _initUsersPage);