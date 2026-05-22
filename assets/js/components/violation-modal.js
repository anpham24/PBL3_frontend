/**
 * @file violation-modal.js
 * @module components/violation-modal
 *
 * Modal "Lịch sử vi phạm" dành cho Admin.
 *
 * ── Cách dùng ─────────────────────────────────────────────────────────────────
 *   import { ViolationModal } from './violation-modal.js';
 *
 *   ViolationModal.open({
 *     userId: 'abc123',
 *     username: 'john_doe',
 *   });
 *
 * ── Thiết kế ──────────────────────────────────────────────────────────────────
 *  - Singleton — inject HTML vào <body> một lần (idempotent).
 *  - Mỗi lần open() sẽ gọi GET /api/admin/users/{userId}/violations.
 *  - Hiển thị danh sách vi phạm (reasonCode + note).
 *  - Hiển thị trạng thái loading / empty / error inline.
 */

"use strict";

import { apiClient } from "../api/api-client.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODAL_ID       = "violation-modal";
const CLOSE_BTN_ID   = "violation-modal-close";
const TITLE_ID       = "violation-modal-title";
const SUBTITLE_ID    = "violation-modal-subtitle";
const LIST_ID        = "violation-modal-list";
const STATUS_ID      = "violation-modal-status";

const ACTIVE_USER_KEY = "data-active-user-id";

// ─── HTML Template ─────────────────────────────────────────────────────────────

const _buildHTML = () => /* html */`
<div
  id="${MODAL_ID}"
  class="violation-modal is-hidden"
  role="dialog"
  aria-modal="true"
  aria-labelledby="${TITLE_ID}"
  aria-hidden="true"
>
  <div class="violation-dialog">
    <!-- Header -->
    <header class="violation-header">
      <div class="violation-header-left">
        <div class="violation-icon-wrap" aria-hidden="true">
          <i class="bx bx-history"></i>
        </div>
        <div>
          <h2 id="${TITLE_ID}" class="violation-title">Lịch sử vi phạm</h2>
          <p id="${SUBTITLE_ID}" class="violation-subtitle"></p>
        </div>
      </div>
      <button
        id="${CLOSE_BTN_ID}"
        class="violation-close"
        type="button"
        aria-label="Đóng"
      >
        <i class="bx bx-x" aria-hidden="true"></i>
      </button>
    </header>

    <!-- Status / loading / error -->
    <p
      id="${STATUS_ID}"
      class="violation-status is-hidden"
      role="status"
      aria-live="polite"
    ></p>

    <!-- Violation list -->
    <div id="${LIST_ID}" class="violation-list" aria-label="Danh sách vi phạm">
      <!-- Filled dynamically -->
    </div>

  </div>
</div>
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Singleton ────────────────────────────────────────────────────────────────

export const ViolationModal = (() => {
	// ── Private state ──────────────────────────────────────────────────────
	let _eventsAreBound = false;

	// ── DOM helpers ────────────────────────────────────────────────────────
	const _el = (id) => document.getElementById(id);

	// ── Inject HTML ────────────────────────────────────────────────────────
	const _injectHTML = () => {
		if (_el(MODAL_ID)) return;
		document.body.insertAdjacentHTML("beforeend", _buildHTML());
	};

	// ── Status helpers ─────────────────────────────────────────────────────
	const _setStatus = (message, isError = false) => {
		const el = _el(STATUS_ID);
		if (!el) return;
		el.textContent = message;
		el.style.color = isError ? "#dc2626" : "#6b7280";
		el.classList.toggle("is-hidden", _str(message).length === 0);
	};

	const _clearStatus = () => _setStatus("");

	// ── Render violations list ─────────────────────────────────────────────
	const _renderViolations = (violations) => {
		const listEl = _el(LIST_ID);
		if (!listEl) return;

		if (!Array.isArray(violations) || violations.length === 0) {
			listEl.innerHTML = `
				<div class="violation-empty">
					<i class="bx bx-check-shield" aria-hidden="true"></i>
					<p>Người dùng này chưa có vi phạm nào được ghi nhận.</p>
				</div>
			`;
			return;
		}

		listEl.innerHTML = violations
			.map((item, index) => {
				const reasonCode = _esc(_str(item?.reasonCode)) || "UNKNOWN";
				const note       = _esc(_str(item?.note));
				return `
				<div class="violation-item" aria-label="Vi phạm ${index + 1}">
					<div class="violation-item-header">
						<span class="violation-index">#${index + 1}</span>
						<span class="violation-reason-badge">${reasonCode}</span>
					</div>
					${note
						? `<p class="violation-note">${note}</p>`
						: `<p class="violation-note violation-note--empty">Không có ghi chú.</p>`
					}
				</div>`;
			})
			.join("");
	};

	// ── Fetch and render violations ────────────────────────────────────────
	const _loadViolations = async (userId) => {
		const listEl = _el(LIST_ID);
		if (listEl) listEl.innerHTML = "";

		_setStatus("Đang tải lịch sử vi phạm...");

		try {
			const response = await apiClient.get(
				`/api/admin/users/${encodeURIComponent(userId)}/violations`
			);
			const violations = Array.isArray(response?.data?.violations)
				? response.data.violations
				: [];

			_clearStatus();

			const total = Number(response?.data?.total ?? violations.length);
			const subtitleEl = _el(SUBTITLE_ID);
			if (subtitleEl) {
				subtitleEl.textContent = total > 0
					? `Tổng cộng ${total} lần vi phạm`
					: "Chưa có vi phạm nào";
			}

			_renderViolations(violations);
		} catch (error) {
			console.error("[ViolationModal] load error:", error);
			const errMsg =
				_str(error?.data?.message) ||
				_str(error?.message) ||
				"Không thể tải lịch sử vi phạm. Vui lòng thử lại.";
			_setStatus(errMsg, true);
		}
	};

	// ── Bind events (once) ─────────────────────────────────────────────────
	const _bindEvents = () => {
		if (_eventsAreBound) return;
		_eventsAreBound = true;

		_el(CLOSE_BTN_ID)?.addEventListener("click", () => close());

		_el(MODAL_ID)?.addEventListener("click", (e) => {
			if (e.target === _el(MODAL_ID)) close();
		});

		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && !_el(MODAL_ID)?.classList.contains("is-hidden")) {
				close();
			}
		});
	};

	// ── open ───────────────────────────────────────────────────────────────
	/**
	 * Mở modal lịch sử vi phạm và tải dữ liệu.
	 *
	 * @param {object} options
	 * @param {string} options.userId   - ID người dùng cần xem.
	 * @param {string} options.username - Username hiển thị trong tiêu đề.
	 */
	const open = ({ userId, username } = {}) => {
		const safeUserId = _str(userId);
		if (!safeUserId) {
			console.warn("[ViolationModal] open() thiếu userId hợp lệ.");
			return;
		}

		_injectHTML();
		_bindEvents();

		const modal = _el(MODAL_ID);
		if (!modal) return;

		modal.setAttribute(ACTIVE_USER_KEY, safeUserId);

		// Cập nhật tiêu đề
		const titleEl    = _el(TITLE_ID);
		const subtitleEl = _el(SUBTITLE_ID);
		if (titleEl) titleEl.textContent = "Lịch sử vi phạm";
		if (subtitleEl) subtitleEl.textContent = `Tài khoản: ${_esc(_str(username) || safeUserId)}`;

		// Hiển thị modal
		modal.classList.remove("is-hidden");
		modal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";

		window.requestAnimationFrame(() => {
			_el(CLOSE_BTN_ID)?.focus();
		});

		// Tải dữ liệu vi phạm
		void _loadViolations(safeUserId);
	};

	// ── close ──────────────────────────────────────────────────────────────
	const close = () => {
		const modal = _el(MODAL_ID);
		if (!modal) return;

		modal.classList.add("is-hidden");
		modal.setAttribute("aria-hidden", "true");
		modal.removeAttribute(ACTIVE_USER_KEY);
		document.body.style.overflow = "";

		_clearStatus();
		const listEl = _el(LIST_ID);
		if (listEl) listEl.innerHTML = "";
	};

	// ── Public API ─────────────────────────────────────────────────────────
	return Object.freeze({ open, close });
})();
