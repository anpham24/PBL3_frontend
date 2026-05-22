/**
 * @file user-status-modal.js
 * @module components/user-status-modal
 *
 * Modal "Đổi trạng thái người dùng" dành cho Admin.
 *
 * ── Cách dùng ─────────────────────────────────────────────────────────────────
 *   import { UserStatusModal } from './user-status-modal.js';
 *
 *   UserStatusModal.open({
 *     userId: 'abc123',
 *     username: 'john_doe',
 *     targetStatus: 'LOCKED',        // 'LOCKED' | 'BANNED'
 *     onSuccess: (userId, newStatus) => { /* cập nhật row *\/ }
 *   });
 *
 * ── Thiết kế ──────────────────────────────────────────────────────────────────
 *  - Singleton — inject HTML vào <body> đúng một lần (idempotent).
 *  - Fetch lý do từ GET /api/reports/reasons (lazy, cache sau lần đầu).
 *  - Ẩn trường lockDuration khi targetStatus === 'BANNED'.
 *  - Submit → PATCH /api/admin/users/{userId}/status → gọi onSuccess callback.
 */

"use strict";

import { apiClient } from "../api/api-client.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const MODAL_ID       = "user-status-modal";
const CLOSE_BTN_ID   = "user-status-modal-close";
const CANCEL_BTN_ID  = "user-status-modal-cancel";
const SUBMIT_BTN_ID  = "user-status-modal-submit";
const FORM_ID        = "user-status-modal-form";
const FEEDBACK_ID    = "user-status-modal-feedback";
const TITLE_ID       = "user-status-modal-title";
const SUBTITLE_ID    = "user-status-modal-subtitle";
const DURATION_ID    = "user-status-modal-duration";
const DURATION_WRAP_ID = "user-status-modal-duration-wrap";
const REASON_ID      = "user-status-modal-reason";
const NOTE_ID        = "user-status-modal-note";
const REASONS_WRAP_ID = "user-status-modal-reasons-wrap";

const ACTIVE_USER_KEY   = "data-active-user-id";
const ACTIVE_STATUS_KEY = "data-active-status";

/** Các mốc thời hạn khóa tài khoản */
const LOCK_DURATIONS = [
	{ value: "3d",  label: "3 ngày" },
	{ value: "7d",  label: "1 tuần" },
	{ value: "30d", label: "1 tháng" },
	{ value: "180d", label: "6 tháng" },
	{ value: "365d", label: "1 năm" },
];

// ─── HTML Template ─────────────────────────────────────────────────────────────

const _buildHTML = () => /* html */`
<div
  id="${MODAL_ID}"
  class="user-status-modal is-hidden"
  role="dialog"
  aria-modal="true"
  aria-labelledby="${TITLE_ID}"
  aria-hidden="true"
>
  <div class="user-status-dialog">
    <!-- Header -->
    <header class="user-status-header">
      <div class="user-status-header-left">
        <div class="user-status-icon-wrap" aria-hidden="true">
          <i class="bx bx-lock-alt"></i>
        </div>
        <div>
          <h2 id="${TITLE_ID}" class="user-status-title">Khóa tài khoản</h2>
          <p id="${SUBTITLE_ID}" class="user-status-subtitle"></p>
        </div>
      </div>
      <button
        id="${CLOSE_BTN_ID}"
        class="user-status-close"
        type="button"
        aria-label="Đóng"
      >
        <i class="bx bx-x" aria-hidden="true"></i>
      </button>
    </header>

    <!-- Form body -->
    <form id="${FORM_ID}" class="user-status-form" novalidate>

      <!-- Thời hạn khóa (chỉ hiện khi LOCKED) -->
      <div id="${DURATION_WRAP_ID}" class="user-status-field-wrap">
        <label class="user-status-label" for="${DURATION_ID}">
          <i class="bx bx-time-five" aria-hidden="true"></i>
          Thời hạn khóa
        </label>
        <div class="user-status-select-wrap">
          <select id="${DURATION_ID}" class="user-status-select" name="lockDuration" required>
            ${LOCK_DURATIONS.map((d) => `<option value="${d.value}">${d.label}</option>`).join("")}
          </select>
          <i class="bx bx-chevron-down user-status-select-arrow" aria-hidden="true"></i>
        </div>
      </div>

      <!-- Lý do (reasonCode) -->
      <div class="user-status-field-wrap">
        <label class="user-status-label" for="${REASON_ID}">
          <i class="bx bx-flag" aria-hidden="true"></i>
          Lý do vi phạm
        </label>
        <div id="${REASONS_WRAP_ID}" class="user-status-select-wrap">
          <select id="${REASON_ID}" class="user-status-select" name="reasonCode" required>
            <option value="">Đang tải lý do...</option>
          </select>
          <i class="bx bx-chevron-down user-status-select-arrow" aria-hidden="true"></i>
        </div>
      </div>

      <!-- Ghi chú -->
      <div class="user-status-field-wrap">
        <label class="user-status-label" for="${NOTE_ID}">
          <i class="bx bx-note" aria-hidden="true"></i>
          Ghi chú <span class="user-status-optional">(tuỳ chọn)</span>
        </label>
        <div class="user-status-note-wrap">
          <textarea
            id="${NOTE_ID}"
            class="user-status-note"
            name="note"
            placeholder="Nhập ghi chú về lý do xử lý này..."
            rows="3"
          ></textarea>
        </div>
      </div>

      <!-- Feedback inline -->
      <p
        id="${FEEDBACK_ID}"
        class="user-status-feedback is-hidden"
        role="alert"
        aria-live="assertive"
      ></p>

    </form>

    <!-- Footer -->
    <footer class="user-status-footer">
      <button
        id="${CANCEL_BTN_ID}"
        class="user-status-btn user-status-btn--cancel"
        type="button"
      >
        <i class="bx bx-x-circle" aria-hidden="true"></i>
        <span>Hủy</span>
      </button>
      <button
        id="${SUBMIT_BTN_ID}"
        class="user-status-btn user-status-btn--submit"
        type="submit"
        form="${FORM_ID}"
      >
        <i class="bx bx-lock-alt" aria-hidden="true"></i>
        <span>Xác nhận</span>
      </button>
    </footer>
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

export const UserStatusModal = (() => {
	// ── Private state ──────────────────────────────────────────────────────
	let _eventsAreBound  = false;
	let _isSubmitting    = false;
	let _onSuccess       = null;
	/** @type {Array<{code: string, reason: string}>} */
	let _cachedReasons   = null;  // null = not yet fetched, [] = fetched (maybe empty)

	// ── DOM helpers ────────────────────────────────────────────────────────
	const _el = (id) => document.getElementById(id);

	// ── Inject HTML ────────────────────────────────────────────────────────
	const _injectHTML = () => {
		if (_el(MODAL_ID)) return;
		document.body.insertAdjacentHTML("beforeend", _buildHTML());
	};

	// ── Feedback ───────────────────────────────────────────────────────────
	const _showFeedback = (message, isError = true) => {
		const el = _el(FEEDBACK_ID);
		if (!el) return;
		el.textContent = message;
		el.style.color = isError ? "#dc2626" : "#15803d";
		el.classList.remove("is-hidden");
	};

	const _clearFeedback = () => {
		const el = _el(FEEDBACK_ID);
		if (!el) return;
		el.textContent = "";
		el.style.color = "";
		el.classList.add("is-hidden");
	};

	// ── Load & render reasons ──────────────────────────────────────────────
	const _fetchReasons = async () => {
		if (_cachedReasons !== null) return _cachedReasons;
		try {
			const response = await apiClient.get("/api/reports/reasons");
			_cachedReasons = Array.isArray(response?.data?.reportReasons)
				? response.data.reportReasons
				: [];
		} catch {
			_cachedReasons = [];
		}
		return _cachedReasons;
	};

	const _renderReasonOptions = (reasons) => {
		const select = _el(REASON_ID);
		if (!select) return;

		if (!Array.isArray(reasons) || reasons.length === 0) {
			select.innerHTML = '<option value="">Không có lý do nào</option>';
			return;
		}

		select.innerHTML = reasons
			.map((item) => {
				const code  = _esc(_str(item?.code));
				const label = _esc(_str(item?.reason));
				if (!code || !label) return "";
				return `<option value="${code}">${label}</option>`;
			})
			.filter(Boolean)
			.join("");
	};

	// ── Toggle lock duration visibility ────────────────────────────────────
	const _updateDurationVisibility = (status) => {
		const wrap = _el(DURATION_WRAP_ID);
		const select = _el(DURATION_ID);
		if (!wrap) return;

		const isBanned = status === "BANNED";
		wrap.classList.toggle("is-hidden", isBanned);
		if (select) select.required = !isBanned;
	};

	// ── Submit ─────────────────────────────────────────────────────────────
	const _handleSubmit = async (event) => {
		event.preventDefault();
		if (_isSubmitting) return;

		const modal     = _el(MODAL_ID);
		const submitBtn = _el(SUBMIT_BTN_ID);
		const durationEl = _el(DURATION_ID);
		const reasonEl  = _el(REASON_ID);
		const noteEl    = _el(NOTE_ID);

		const userId     = _str(modal?.getAttribute(ACTIVE_USER_KEY));
		const status     = _str(modal?.getAttribute(ACTIVE_STATUS_KEY));
		const reasonCode = _str(reasonEl?.value);
		const note       = _str(noteEl?.value);

		// Validate
		if (!userId) {
			_showFeedback("Không xác định được người dùng cần xử lý.");
			return;
		}
		if (!reasonCode) {
			_showFeedback("Vui lòng chọn lý do vi phạm.");
			return;
		}

		const body = { status, reasonCode, note };
		if (status === "LOCKED") {
			const lockDuration = _str(durationEl?.value);
			if (!lockDuration) {
				_showFeedback("Vui lòng chọn thời hạn khóa.");
				return;
			}
			body.lockDuration = lockDuration;
		}

		// Loading state
		_isSubmitting = true;
		_clearFeedback();
		if (submitBtn) {
			submitBtn.disabled = true;
			const span = submitBtn.querySelector("span");
			const icon = submitBtn.querySelector("i");
			if (icon) icon.className = "";
			if (span) span.textContent = "Đang xử lý...";
			submitBtn.insertAdjacentHTML(
				"afterbegin",
				'<span class="user-status-spinner" aria-hidden="true"></span>'
			);
		}

		try {
			await apiClient.patch(
				`/api/admin/users/${encodeURIComponent(userId)}/status`,
				body
			);

			const cb = _onSuccess;
			close();
			if (typeof cb === "function") {
				cb(userId, status);
			}
		} catch (error) {
			console.error("[UserStatusModal] submit error:", error);
			const errMsg =
				_str(error?.data?.message) ||
				_str(error?.message) ||
				"Không thể cập nhật trạng thái. Vui lòng thử lại.";
			_showFeedback(errMsg, true);
		} finally {
			_isSubmitting = false;
			if (submitBtn) {
				submitBtn.disabled = false;
				const spinner = submitBtn.querySelector(".user-status-spinner");
				if (spinner) spinner.remove();
				const span = submitBtn.querySelector("span");
				const icon = submitBtn.querySelector("i");
				if (icon) icon.className = "bx bx-lock-alt";
				if (span) span.textContent = "Xác nhận";
			}
		}
	};

	// ── Bind events (once) ─────────────────────────────────────────────────
	const _bindEvents = () => {
		if (_eventsAreBound) return;
		_eventsAreBound = true;

		_el(CLOSE_BTN_ID)?.addEventListener("click", () => close());
		_el(CANCEL_BTN_ID)?.addEventListener("click", () => close());

		_el(MODAL_ID)?.addEventListener("click", (e) => {
			if (e.target === _el(MODAL_ID)) close();
		});

		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && !_el(MODAL_ID)?.classList.contains("is-hidden")) {
				close();
			}
		});

		_el(FORM_ID)?.addEventListener("submit", _handleSubmit);
	};

	// ── open ───────────────────────────────────────────────────────────────
	/**
	 * Mở modal đổi trạng thái người dùng.
	 *
	 * @param {object}   options
	 * @param {string}   options.userId         - ID người dùng cần cập nhật.
	 * @param {string}   options.username        - Username để hiển thị trong tiêu đề.
	 * @param {'LOCKED'|'BANNED'} options.targetStatus - Trạng thái muốn đặt.
	 * @param {Function} [options.onSuccess]     - Callback(userId, newStatus) sau khi thành công.
	 */
	const open = ({ userId, username, targetStatus, onSuccess } = {}) => {
		const safeUserId = _str(userId);
		const safeStatus = _str(targetStatus).toUpperCase();

		if (!safeUserId || !["LOCKED", "BANNED"].includes(safeStatus)) {
			console.warn("[UserStatusModal] open() thiếu userId hoặc targetStatus hợp lệ.");
			return;
		}

		_injectHTML();
		_bindEvents();

		const modal = _el(MODAL_ID);
		const form  = _el(FORM_ID);
		if (!modal || !form) return;

		// Lưu context
		modal.setAttribute(ACTIVE_USER_KEY, safeUserId);
		modal.setAttribute(ACTIVE_STATUS_KEY, safeStatus);
		_onSuccess = typeof onSuccess === "function" ? onSuccess : null;

		// Cập nhật tiêu đề
		const titleEl    = _el(TITLE_ID);
		const subtitleEl = _el(SUBTITLE_ID);
		const iconEl     = modal.querySelector(".user-status-icon-wrap i");
		const submitSpan = _el(SUBMIT_BTN_ID)?.querySelector("span");
		const submitIcon = _el(SUBMIT_BTN_ID)?.querySelector("i");

		if (safeStatus === "BANNED") {
			if (titleEl) titleEl.textContent = "Ban vĩnh viễn";
			if (subtitleEl) subtitleEl.textContent = `Tài khoản "${_esc(username)}" sẽ bị ban vĩnh viễn.`;
			if (iconEl) iconEl.className = "bx bx-block";
			if (submitIcon) submitIcon.className = "bx bx-block";
			if (submitSpan) submitSpan.textContent = "Xác nhận Ban";
		} else {
			if (titleEl) titleEl.textContent = "Khóa tài khoản";
			if (subtitleEl) subtitleEl.textContent = `Tài khoản "${_esc(username)}" sẽ bị khóa trong thời gian chỉ định.`;
			if (iconEl) iconEl.className = "bx bx-lock-alt";
			if (submitIcon) submitIcon.className = "bx bx-lock-alt";
			if (submitSpan) submitSpan.textContent = "Xác nhận Khóa";
		}

		// Ẩn/hiện duration
		_updateDurationVisibility(safeStatus);

		// Reset form & feedback
		form.reset();
		_clearFeedback();
		_isSubmitting = false;

		// Reset submit btn trạng thái
		const submitBtn = _el(SUBMIT_BTN_ID);
		if (submitBtn) {
			submitBtn.disabled = false;
			submitBtn.querySelectorAll(".user-status-spinner").forEach((s) => s.remove());
		}

		// Tải lý do (async, không block mở modal)
		_fetchReasons().then((reasons) => {
			_renderReasonOptions(reasons);
		});

		// Hiển thị modal
		modal.classList.remove("is-hidden");
		modal.setAttribute("aria-hidden", "false");
		document.body.style.overflow = "hidden";

		window.requestAnimationFrame(() => {
			_el(CLOSE_BTN_ID)?.focus();
		});
	};

	// ── close ──────────────────────────────────────────────────────────────
	const close = () => {
		const modal = _el(MODAL_ID);
		if (!modal) return;

		modal.classList.add("is-hidden");
		modal.setAttribute("aria-hidden", "true");
		modal.removeAttribute(ACTIVE_USER_KEY);
		modal.removeAttribute(ACTIVE_STATUS_KEY);
		document.body.style.overflow = "";

		_clearFeedback();
		_isSubmitting = false;
		_onSuccess    = null;
	};

	// ── Public API ─────────────────────────────────────────────────────────
	return Object.freeze({ open, close });
})();
