/**
 * @file reports.js
 * @module pages/reports
 *
 * Logic trang Quản lý báo cáo bài đăng (Admin/Moderator).
 *
 * ── Luồng khởi tạo ──────────────────────────────────────────────────
 *  1. Kiểm tra quyền truy cập (ADMIN / MODERATOR).
 *  2. Gọi GET /api/reports/reasons → lưu allReasons (dùng map code → text).
 *  3. Gọi GET /api/admin/reports → render danh sách phiếu báo cáo.
 *  4. Xử lý infinite scroll (cursor-based, dừng khi hasMore = false).
 *
 * ── Sự kiện nút ─────────────────────────────────────────────────────────────
 *  - "Bỏ qua"         → POST resolve với action: "REJECTED"
 *  - "Xử lý vi phạm"  → mở ResolveReportModal
 */

"use strict";

import { postApi }            from "../api/post-api.js";
import { getCurrentUser }     from "../utils/auth.js";
import { ResolveReportModal } from "../components/resolve-report-modal.js";

// ─── Hằng ────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES      = new Set(["MODERATOR", "ADMIN"]);
const DEFAULT_AVATAR_URL = "../assets/images/default-avatar.png";

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
	/** @type {Array<{code: string, reason: string}>} */
	allReasons:      [],
	/** Map reasonCode → reasonText, dùng để dịch code sang tiếng Việt */
	reasonMap:       new Map(),
	keyword:         "",
	lastReportId:    null,   // cursor phân trang theo phiếu báo cáo
	hasMore:         true,
	isLoading:       false,
	reportCount:     0
};

// ─── DOM refs (lazy-populated trong initReportsPage) ─────────────────────────

let listEl;
let countBadgeEl;
let emptyStateEl;
let searchInputEl;
let statusEl;
let endNoticeEl;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const _str = (value) => {
	if (typeof value !== "string") return "";
	const t = value.trim();
	return t.length > 0 ? t : "";
};

const _num = (value, fallback = 0) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const _esc = (value) =>
	String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");

const _timeAgo = (dateString) => {
	if (!dateString) return "";
	const date = new Date(dateString);
	if (isNaN(date.getTime())) return "";
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 0) return "Vừa xong";
	const intervals = [
		{ unit: "năm",   secs: 31_536_000 },
		{ unit: "tháng", secs: 2_592_000  },
		{ unit: "ngày",  secs: 86_400     },
		{ unit: "giờ",   secs: 3_600      },
		{ unit: "phút",  secs: 60         }
	];
	for (const { unit, secs } of intervals) {
		const n = Math.floor(seconds / secs);
		if (n >= 1) return `${n} ${unit} trước`;
	}
	return "Vừa xong";
};

const _toErrorMessage = (error, fallback) => {
	if (_str(error?.data?.message).length > 0) return error.data.message.trim();
	if (_str(error?.message).length > 0)       return error.message.trim();
	return fallback;
};

// ─── Auth ────────────────────────────────────────────────────────────────────

const _getUserRole = () => {
	const user = getCurrentUser();
	const role = _str(user?.userRole);
	return role.toUpperCase();
};

const _ensureAccess = () => {
	const role = _getUserRole();
	if (!ALLOWED_ROLES.has(role)) {
		window.location.href = "feed.html";
		return "";
	}
	return role;
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const _setStatus = (message, variant = "info") => {
	if (!statusEl) return;
	statusEl.textContent = message;
	statusEl.classList.toggle("is-hidden", _str(message).length === 0);
	const colorMap = { error: "#b91c1c", success: "#15803d", info: "#4b5563" };
	statusEl.style.color = colorMap[variant] ?? "#4b5563";
};

const _clearStatus = () => {
	_setStatus("");
	if (statusEl) statusEl.style.color = "";
};

// ─── HTML Builders ────────────────────────────────────────────────────────────

/**
 * Sinh HTML cho .report-side-panel (cột phải).
 * Dùng state.reasonMap để dịch reasonCode → tiếng Việt.
 *
 * @param {object} reportItem - Phếu báo cáo: { reportId, post, reasonList }.
 * @returns {string}
 */
const _buildSidePanelHtml = (reportItem) => {
	const reportId   = _str(reportItem?.reportId);
	const reasonList = Array.isArray(reportItem?.reasonList) ? reportItem.reasonList : [];

	// Sắp xếp theo count giảm dần để hiển thị lý do nhiều nhất trước
	const sortedReasons = [...reasonList].sort(
		(a, b) => _num(b.count) - _num(a.count)
	);

	const reasonsHtml = sortedReasons.length > 0
		? sortedReasons
			.map((item) => {
				const code  = _str(item?.reasonCode);
				const count = _num(item?.count, 0);
				// Dịch reasonCode sang text tiếng Việt qua reasonMap
				const label = state.reasonMap.get(code) || code || "Không rõ";
				return `
				<div class="report-reason-stat">
					<span class="report-reason-stat__label">${_esc(label)}</span>
					<span class="report-reason-stat__count">${_esc(String(count))}</span>
				</div>`;
			})
			.join("")
		: '<p class="report-side-panel__empty">Chưa có thông tin lý do.</p>';

	const totalReports = reasonList.reduce((sum, item) => sum + _num(item.count, 0), 0);

	return `
	<aside class="report-side-panel" aria-label="Thông tin phiếu báo cáo ${_esc(reportId)}">
		<div class="report-side-panel__header">
			<i class="bx bx-flag" aria-hidden="true"></i>
			<h4>${_esc(String(totalReports))} lượt báo cáo</h4>
		</div>
		<div class="report-side-panel__reasons">
			${reasonsHtml}
		</div>
		<div class="report-side-panel__actions">
			<button
				class="report-side-btn report-side-btn--ignore"
				type="button"
				data-action="ignore"
				data-report-id="${_esc(reportId)}"
				aria-label="Bỏ qua phiếu báo cáo ${_esc(reportId)}"
			>
				<i class="bx bx-x-circle" aria-hidden="true"></i>
				<span>Bỏ qua</span>
			</button>
			<button
				class="report-side-btn report-side-btn--resolve"
				type="button"
				data-action="resolve"
				data-report-id="${_esc(reportId)}"
				aria-label="Xử lý vi phạm phiếu ${_esc(reportId)}"
			>
				<i class="bx bx-shield-x" aria-hidden="true"></i>
				<span>Xử lý vi phạm</span>
			</button>
		</div>
	</aside>`;
};

/**
 * Sinh HTML cho .post-card (cột trái) từ object post lồng bên trong phiếu báo cáo.
 * Tái sử dụng cấu trúc HTML của post-card component.
 *
 * @param {object} post - item.post từ API (có các field: id, authorId, authorName, ...).
 * @returns {string}
 */
const _buildPostCardHtml = (post) => {
	const postId     = _str(post?.id);
	const authorId   = _str(post?.authorId);
	const authorName = _str(post?.authorName) || "Người dùng";
	const avatarUrl  = _str(post?.avtUrl) || DEFAULT_AVATAR_URL;
	const content    = _str(post?.content || post?.caption);
	const createdAt  = _str(post?.createAt || post?.create_at || post?.created_at);
	const timeText   = _timeAgo(createdAt);

	// Tags: province và topic từ API mới
	const province = _str(post?.province);
	const topic    = _str(post?.topic);
	const address  = _str(post?.address);
	const tagsHtml = (province || topic || address)
		? `
			<div class="post-card__tags post-tags-inline">
				${province ? `<span class="post-tag-chip"><i class="bx bx-map"></i><span>${_esc(province)}</span></span>` : ""}
				${topic    ? `<span class="post-tag-chip"><i class="bx bx-category"></i><span>${_esc(topic)}</span></span>` : ""}
				${address  ? `<span class="post-tag-chip"><i class="bx bx-current-location"></i><span>${_esc(address)}</span></span>` : ""}
			</div>`
		: "";

	// Media: lấy item đầu tiên trong mediaList
	const mediaList  = Array.isArray(post?.mediaList) ? post.mediaList : [];
	const firstMedia = mediaList.find((m) => _str(m?.mediaUrl).length > 0);
	const mediaHtml  = firstMedia
		? (() => {
			const url  = _str(firstMedia.mediaUrl);
			const type = _str(firstMedia.mediaType).toUpperCase();
			if (type === "VIDEO") {
				return `<div class="post-image"><video src="${_esc(url)}" controls preload="metadata"></video></div>`;
			}
			return `<img class="post-image" src="${_esc(url)}" alt="Ảnh bài đăng" loading="lazy">`;
		})()
		: "";

	const userIdAttr   = authorId ? ` data-user-id="${_esc(authorId)}"` : "";
	const authorIdAttr = authorId ? ` data-author-id="${_esc(authorId)}"` : "";

	return `
	<article
		class="post-card"
		data-post-id="${_esc(postId)}"${authorIdAttr}
		role="article"
	>
		<header class="post-card__header post-header">
			<div class="post-card__author post-author">
				<img
					class="post-card__avatar avatar"
					src="${_esc(avatarUrl)}"
					alt="Avatar ${_esc(authorName)}"
					${userIdAttr}
				>
				<div class="post-card__meta post-meta">
					<div class="post-meta-row">
						<h3>
							<span class="post-card__author-name">${_esc(authorName)}</span>${timeText
								? `<span class="post-card__time post-time"> &bull; ${_esc(timeText)}</span>`
								: ""
							}
						</h3>
					</div>
					${tagsHtml}
				</div>
			</div>
		</header>

		${mediaHtml}

		<footer class="post-card__footer post-footer">
			<div class="post-card__caption-wrap">
				<p class="post-card__caption caption${content ? " post-card__caption--clamped" : ""}" data-role="post-caption">
					<strong>${_esc(authorName)}</strong>${_esc(content)}
				</p>
			</div>
		</footer>
	</article>`;
};

/**
 * Sinh HTML hoàn chỉnh cho một .report-item (2 cột).
 * Dữ liệu bài đăng nằm trong reportItem.post, khóa chính là reportItem.reportId.
 *
 * @param {object} reportItem - Phếu báo cáo: { reportId, post, reasonList }.
 * @returns {string}
 */
const _buildReportItemHtml = (reportItem) => {
	const reportId     = _str(reportItem?.reportId);
	const post         = reportItem?.post ?? {};
	const reasonList   = Array.isArray(reportItem?.reasonList) ? reportItem.reasonList : [];
	const reasonListJson = _esc(JSON.stringify(reasonList));

	const postCardHtml  = _buildPostCardHtml(post);
	const sidePanelHtml = _buildSidePanelHtml(reportItem);

	return `
	<div
		class="report-item"
		data-report-id="${_esc(reportId)}"
		data-reason-list="${reasonListJson}"
	>
		${postCardHtml}
		${sidePanelHtml}
	</div>`;
};

// ─── Render ──────────────────────────────────────────────────────────────────

const _updateCountBadge = (count) => {
	if (!countBadgeEl) return;
	countBadgeEl.textContent = `${count} bài viết bị báo cáo`;
};

const _syncEmptyState = (isEmpty) => {
	if (!emptyStateEl) return;
	emptyStateEl.classList.toggle("is-hidden", !isEmpty);
};

/**
 * Xóa card khỏi danh sách DOM theo reportId và cập nhật bộ đếm.
 * @param {string} reportId
 */
const _removeReportItem = (reportId) => {
	const item = listEl?.querySelector(`[data-report-id="${CSS.escape(reportId)}"]`);
	if (item) {
		item.remove();
		state.reportCount = Math.max(0, state.reportCount - 1);
		_updateCountBadge(state.reportCount);
		if (state.reportCount === 0 && !state.hasMore) {
			_syncEmptyState(true);
		}
	}
};

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Lấy và lưu danh sách lý do báo cáo.
 * GET /api/reports/reasons
 */
const _loadReasons = async () => {
	try {
		const response = await postApi.getReportReasons();
		const reasons  = Array.isArray(response?.data?.reportReasons)
			? response.data.reportReasons
			: [];
		state.allReasons = reasons;
		state.reasonMap  = new Map(
			reasons.map((item) => [_str(item?.code), _str(item?.reason)])
		);
	} catch (error) {
		console.error("[reports.js] _loadReasons error:", error);
		// Không block trang nếu API lý do thất bại
	}
};

/**
 * Tải trang tiếp theo của danh sách phiếu báo cáo.
 * GET /api/admin/reports
 */
const _loadNextPage = async () => {
	if (state.isLoading || !state.hasMore) return;
	state.isLoading = true;

	try {
		const response = await postApi.getAdminReports({
			lastReportId: state.lastReportId,
			keyword:      state.keyword
		});

		const data       = response?.data ?? {};
		const reportList = Array.isArray(data.reportList) ? data.reportList : [];
		const hasMore    = Boolean(data.hasMore);
		const lastId     = _str(data.respLastReportId);

		state.hasMore      = hasMore;
		state.lastReportId = lastId.length > 0 ? lastId : state.lastReportId;

		if (reportList.length === 0 && state.reportCount === 0) {
			_syncEmptyState(true);
			return;
		}

		// Render thêm vào cuối danh sách
		const fragment = reportList.map(_buildReportItemHtml).join("");
		if (listEl && fragment.length > 0) {
			listEl.insertAdjacentHTML("beforeend", fragment);
		}

		state.reportCount += reportList.length;
		_updateCountBadge(state.reportCount);

		if (!hasMore) {
			if (endNoticeEl) {
				endNoticeEl.classList.remove("is-hidden");
			}
		}
	} catch (error) {
		_setStatus(_toErrorMessage(error, "Không thể tải danh sách báo cáo."), "error");
	} finally {
		state.isLoading = false;
	}
};

// ─── Infinite scroll ─────────────────────────────────────────────────────────

const _setupInfiniteScroll = () => {
	const _onScroll = () => {
		if (!state.hasMore || state.isLoading) return;
		const scrolledToBottom =
			window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
		if (scrolledToBottom) {
			void _loadNextPage();
		}
	};

	window.addEventListener("scroll", _onScroll, { passive: true });
};

// ─── Action handlers ─────────────────────────────────────────────────────────

/**
 * Xử lý nút "Bỏ qua": gọi API POST với action: "REJECTED".
 * @param {string} reportId - ID phiếu báo cáo.
 * @param {HTMLButtonElement} btn
 */
const _handleIgnore = async (reportId, btn) => {
	if (btn.disabled) return;

	btn.disabled = true;
	const originalHtml = btn.innerHTML;
	btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Đang xử lý...</span>';

	try {
		await postApi.resolveReport(reportId, { action: "REJECTED" });
		_removeReportItem(reportId);
	} catch (error) {
		console.error("[reports.js] _handleIgnore error:", error);
		_setStatus(_toErrorMessage(error, "Không thể bỏ qua báo cáo. Vui lòng thử lại."), "error");
		btn.disabled = false;
		btn.innerHTML = originalHtml;
	}
};

/**
 * Xử lý nút "Xử lý vi phạm": mở ResolveReportModal.
 * @param {string} reportId - ID phiếu báo cáo.
 * @param {Array}  postReasonList - reasonList của phiếu đó.
 */
const _handleResolve = (reportId, postReasonList) => {
	ResolveReportModal.open({
		reportId,
		postReasonList,
		allReasons: state.allReasons,
		onSuccess: (resolvedReportId, message) => {
			_removeReportItem(resolvedReportId);
			_setStatus(message || "Đã xử lý vi phạm thành công.", "success");
			// Tự xóa status sau 4 giây
			window.setTimeout(_clearStatus, 4000);
		}
	});
};

/**
 * Event delegation trên #reported-post-list.
 * @param {MouseEvent} event
 */
const _handleListClick = (event) => {
	const btn = event.target.closest("[data-action]");
	if (!btn) return;

	const action   = _str(btn.dataset.action);
	const reportId = _str(btn.dataset.reportId);
	if (!reportId) return;

	if (action === "ignore") {
		void _handleIgnore(reportId, btn);
		return;
	}

	if (action === "resolve") {
		// Đọc reasonList đã được serialize vào data-attribute của .report-item khi render
		const reportItem     = btn.closest(".report-item");
		const reasonListJson = _str(reportItem?.dataset.reasonList);
		let   postReasonList = [];
		try {
			postReasonList = reasonListJson.length > 0 ? JSON.parse(reasonListJson) : [];
		} catch {
			postReasonList = [];
		}

		_handleResolve(reportId, postReasonList);
	}
};


// ─── Search ──────────────────────────────────────────────────────────────────

let _searchDebounceTimer = null;

const _handleSearchChange = () => {
	const newKeyword = _str(searchInputEl?.value);
	if (newKeyword === state.keyword) return;

	state.keyword      = newKeyword;
	state.lastReportId = null;
	state.hasMore      = true;
	state.isLoading    = false;
	state.reportCount  = 0;

	// Reset list
	if (listEl)       listEl.innerHTML = "";
	if (endNoticeEl)  endNoticeEl.classList.add("is-hidden");
	_syncEmptyState(false);
	_updateCountBadge(0);
	_clearStatus();

	void _loadNextPage();
};

const _handleSearchInput = () => {
	clearTimeout(_searchDebounceTimer);
	_searchDebounceTimer = window.setTimeout(_handleSearchChange, 400);
};

// ─── Init ────────────────────────────────────────────────────────────────────

const initReportsPage = async () => {
	// Kiểm tra quyền
	const role = _ensureAccess();
	if (!role) return;

	// Cache DOM refs
	listEl      = document.getElementById("reported-post-list");
	countBadgeEl = document.getElementById("reports-count-badge");
	emptyStateEl = document.getElementById("reports-empty-state");
	searchInputEl = document.getElementById("reports-search-input");
	statusEl     = document.getElementById("reports-status");
	endNoticeEl  = document.getElementById("reports-end-notice");

	if (!listEl) return;

	// Gắn event delegation
	listEl.addEventListener("click", _handleListClick);

	// Search listeners
	searchInputEl?.addEventListener("input", _handleSearchInput);
	searchInputEl?.addEventListener("keydown", (e) => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		clearTimeout(_searchDebounceTimer);
		_handleSearchChange();
	});

	// Infinite scroll
	_setupInfiniteScroll();

	// Hiển thị trạng thái loading
	_setStatus("Đang tải danh sách báo cáo...");

	// 1. Lấy danh sách lý do trước (cần để render side panel và open modal)
	await _loadReasons();

	// 2. Tải trang đầu tiên
	_clearStatus();
	await _loadNextPage();

	// Nếu sau khi tải mà không có bài → hiện empty state
	if (state.reportCount === 0 && !state.hasMore) {
		_syncEmptyState(true);
	}
};

document.addEventListener("DOMContentLoaded", initReportsPage);
